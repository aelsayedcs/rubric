import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'
import { toYMD } from '@/lib/dates'

type Gran = 'week' | 'month' | 'quarter'

// Bucket an eval_date into a period key (for sorting) + human label.
function bucket(dateStr: string, g: Gran): { key: string; label: string } {
  const d = new Date(dateStr)
  if (g === 'week') {
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)) // back to Monday
    return { key: toYMD(mon), label: mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  }
  if (g === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1
    const k = `${d.getFullYear()}-Q${q}`
    return { key: k, label: k }
  }
  const label = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return { key: dateStr.slice(0, 7), label } // YYYY-MM
}

// GET /api/agents/[email] — per-agent profile aggregation.
// Query: date_from, date_to, channel, granularity (week|month|quarter).
export async function GET(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const { email: raw } = await params
  const email = normEmail(decodeURIComponent(raw))
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const dateFrom = sp.get('date_from') || ''
  const dateTo = sp.get('date_to') || ''
  const channel = sp.get('channel') || ''
  const granParam = sp.get('granularity') || 'month'
  const gran: Gran = (['week', 'month', 'quarter'].includes(granParam) ? granParam : 'month') as Gran

  const svc = createServiceClient()
  const { data: agentRow } = await svc.from('agents')
    .select('email, full_name, team_lead_email, active').eq('email', email).maybeSingle()

  // Access: QA staff anyone; team_lead only their team; agent only self.
  const tlEmail = agentRow?.team_lead_email ?? null
  if (!isQaStaff(user.role)) {
    if (user.role === 'team_lead' && tlEmail !== user.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (user.role !== 'team_lead' && user.email !== email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: cfg } = await svc.from('app_config')
    .select('value').eq('app', 'quality').eq('key', 'coaching_threshold').maybeSingle()
  const threshold = Number(cfg?.value ?? 85)

  let evalsQ = svc.schema('qa').from('qa_evaluations')
    .select('id, ticket_number, channel, score, total_critical_errors, coached, disputed, team_lead_email, eval_date')
    .eq('agent_email', email).is('deleted_at', null)
  if (channel) evalsQ = evalsQ.eq('channel', channel)
  if (dateFrom) evalsQ = evalsQ.gte('eval_date', dateFrom)
  if (dateTo) evalsQ = evalsQ.lte('eval_date', dateTo + 'T23:59:59')
  const { data: evalsRaw } = await evalsQ.order('eval_date', { ascending: false }).limit(5000)
  const evals = evalsRaw ?? []

  const total = evals.length
  const avg = (xs: number[]) => xs.length ? +(xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(1) : 0
  const avgScore = avg(evals.map(e => Number(e.score)))
  const crit = evals.filter(e => e.total_critical_errors > 0).length
  const coached = evals.filter(e => e.coached).length
  const disputes = evals.filter(e => e.disputed).length
  const needsCoaching = evals.filter(e => !e.coached && (Number(e.score) < threshold || e.total_critical_errors > 0)).length

  // Trend bucketed by the chosen granularity (week / month / quarter).
  const tmap = new Map<string, { label: string; c: number; s: number; crit: number }>()
  for (const e of evals) {
    const { key, label } = bucket(String(e.eval_date), gran)
    const t = tmap.get(key) ?? { label, c: 0, s: 0, crit: 0 }
    t.c++; t.s += Number(e.score); if (e.total_critical_errors > 0) t.crit++
    tmap.set(key, t)
  }
  const trend = [...tmap.entries()].sort(([a], [b]) => a < b ? -1 : 1)
    .map(([key, t]) => ({ key, month: t.label, count: t.c, avgScore: +(t.s / t.c).toFixed(1), critical: t.crit }))

  // Period-over-period comparison: latest bucket vs the one before it (WoW/MoM/QoQ).
  const delta = (cur: number, prev: number) => +(cur - prev).toFixed(1)
  const comparison = trend.length >= 2 ? (() => {
    const cur = trend[trend.length - 1], prev = trend[trend.length - 2]
    return {
      granularity: gran,
      current: { period: cur.month, count: cur.count, avgScore: cur.avgScore, critical: cur.critical },
      previous: { period: prev.month, count: prev.count, avgScore: prev.avgScore, critical: prev.critical },
      deltas: { avgScore: delta(cur.avgScore, prev.avgScore), count: cur.count - prev.count, critical: cur.critical - prev.critical },
    }
  })() : null

  // Failed criteria (respects the same date/channel filters via the joined eval)
  let failsQ = svc.schema('qa').from('qa_evaluation_responses')
    .select('result, qa_criteria!inner(label, section), qa_evaluations!inner(agent_email, deleted_at, channel, eval_date)')
    .eq('result', 'fail')
    .eq('qa_evaluations.agent_email', email)
    .is('qa_evaluations.deleted_at', null)
  if (channel) failsQ = failsQ.eq('qa_evaluations.channel', channel)
  if (dateFrom) failsQ = failsQ.gte('qa_evaluations.eval_date', dateFrom)
  if (dateTo) failsQ = failsQ.lte('qa_evaluations.eval_date', dateTo + 'T23:59:59')
  const { data: failsRaw } = await failsQ.limit(20000)
  const mm = new Map<string, number>()
  for (const f of (failsRaw ?? []) as { qa_criteria: { label: string } | null }[]) {
    const l = f.qa_criteria?.label; if (!l) continue
    mm.set(l, (mm.get(l) ?? 0) + 1)
  }
  const mistakes = [...mm.entries()].map(([label, fails]) => ({ label, fails })).sort((a, b) => b.fails - a.fails)

  // Applicable target: agent-specific → their team lead's → global (most specific wins).
  const { data: tRows } = await svc.from('qa_targets')
    .select('scope_type, scope_value, avg_score, max_critical_rate, min_coached_pct')
    .or(`and(scope_type.eq.agent,scope_value.eq.${email}),and(scope_type.eq.team_lead,scope_value.eq.${tlEmail ?? '___none___'}),scope_type.eq.global`)
  const pick = (tRows ?? []).find(t => t.scope_type === 'agent')
    ?? (tRows ?? []).find(t => t.scope_type === 'team_lead')
    ?? (tRows ?? []).find(t => t.scope_type === 'global') ?? null
  const target = pick ? {
    scope: pick.scope_type as string,
    avgScore: pick.avg_score === null ? null : Number(pick.avg_score),
    maxCriticalRate: pick.max_critical_rate === null ? null : Number(pick.max_critical_rate),
    minCoachedPct: pick.min_coached_pct === null ? null : Number(pick.min_coached_pct),
  } : null

  const coachedPct = total ? Math.round(coached / total * 100) : 0
  const criticalRate = total ? Math.round(crit / total * 100) : 0

  return NextResponse.json({
    agent: { email, full_name: agentRow?.full_name ?? null, team_lead_email: tlEmail, active: agentRow?.active ?? null },
    threshold,
    kpis: { total, avgScore, criticalErrors: crit, criticalRate, needsCoaching, disputes, coached, coachedPct },
    target,
    granularity: gran,
    trend,
    comparison,
    mistakes,
    recent: evals.slice(0, 50),
  })
}
