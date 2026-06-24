import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'
import { toYMD } from '@/lib/dates'

// GET /api/insights — turns the QA data into ranked, actionable recommendations.
// Read-only: calls the analysis RPC for the selected period and the period
// immediately before it, then derives insight cards from the figures + deltas.
export const maxDuration = 60

type Severity = 'high' | 'medium' | 'positive' | 'info'
const RANK: Record<Severity, number> = { high: 3, medium: 2, positive: 1, info: 0 }

interface Insight {
  id: string; severity: Severity; icon: string; category: string
  title: string; detail: string; action?: string; link?: string; linkLabel?: string
  agents?: { email: string; label: string }[] // rendered as clickable chips → /agent/<email>
}

interface AgentRow { key: string; evals: number; avgScore: number; criticalErrors: number; coachedPct: number; disputes: number }
interface Analysis {
  threshold: number
  kpis: { total: number; avgScore: number; criticalRate: number; coached: number; notCoached: number; needsCoaching: number; openDisputes: number }
  agents: AgentRow[]
  channels: { key: string; evals: number; avgScore: number }[]
  mistakes: { label: string; section: string; fails: number }[]
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role) && user.role !== 'team_lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams
  const channel = sp.get('channel') || ''
  const agent = sp.get('agent') || ''
  // Team leads only ever see their own team.
  const tl = (user.role === 'team_lead' && !isQaStaff(user.role)) ? user.email : (sp.get('team_lead') || '')

  // Period: default last 30 days. Previous period = the equal-length window before it.
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const def = new Date(today); def.setDate(def.getDate() - 29)
  const from = sp.get('date_from') || toYMD(def)
  const to = sp.get('date_to') || toYMD(today)
  const fD = new Date(from), tD = new Date(to)
  const days = Math.max(1, Math.round((tD.getTime() - fD.getTime()) / 86400000) + 1)
  const prevToD = new Date(fD); prevToD.setDate(prevToD.getDate() - 1)
  const prevFromD = new Date(prevToD); prevFromD.setDate(prevFromD.getDate() - (days - 1))

  const call = async (f: string, t: string): Promise<Analysis | null> => {
    const { data, error } = await svc.schema('qa').rpc('analysis', {
      p_from: f, p_to: t, p_channel: channel || null, p_tl: tl || null, p_agent: agent || null,
    })
    if (error) return null
    return data as Analysis
  }

  const [cur, prev] = await Promise.all([call(from, to), call(toYMD(prevFromD), toYMD(prevToD))])
  if (!cur) return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })

  const k = cur.kpis
  const thr = cur.threshold
  const insights: Insight[] = []
  const linkRange = `date_from=${from}&date_to=${to}${channel ? `&channel=${channel}` : ''}`

  if (k.total === 0) {
    return NextResponse.json({ period: { from, to }, threshold: thr, total: 0, insights: [
      { id: 'no-data', severity: 'info', icon: '📭', category: 'Coverage', title: 'No evaluations in this period', detail: 'Nothing to analyze for the selected range.', action: 'Widen the date range or evaluate more tickets.' },
    ] })
  }

  // 1) Average score vs target
  if (k.avgScore < thr) {
    const gap = +(thr - k.avgScore).toFixed(1)
    insights.push({
      id: 'avg-below', severity: gap >= 5 ? 'high' : 'medium', icon: '🎯', category: 'Score',
      title: `Average score ${k.avgScore}% is ${gap}pts below the ${thr}% target`,
      detail: `Across ${k.total} evaluations. ${k.needsCoaching} are flagged as needing coaching.`,
      action: 'Prioritize coaching for the lowest-scoring agents and most-failed criteria below.',
      link: `/results?${linkRange}`, linkLabel: 'View all evaluations →',
    })
  } else {
    insights.push({
      id: 'avg-ok', severity: 'positive', icon: '✅', category: 'Score',
      title: `Average score ${k.avgScore}% meets the ${thr}% target`,
      detail: `Across ${k.total} evaluations this period.`,
    })
  }

  // 2) Score trend vs previous period
  if (prev && prev.kpis.total >= 5) {
    const delta = +(k.avgScore - prev.kpis.avgScore).toFixed(1)
    if (delta <= -3) insights.push({
      id: 'trend-down', severity: 'high', icon: '📉', category: 'Trend',
      title: `Average score dropped ${Math.abs(delta)}pts vs the previous period`,
      detail: `${prev.kpis.avgScore}% → ${k.avgScore}%. Critical rate is ${k.criticalRate}% (was ${prev.kpis.criticalRate}%).`,
      action: 'Investigate what changed — new agents, policy updates, or a specific channel.',
    })
    else if (delta >= 3) insights.push({
      id: 'trend-up', severity: 'positive', icon: '📈', category: 'Trend',
      title: `Average score improved ${delta}pts vs the previous period`,
      detail: `${prev.kpis.avgScore}% → ${k.avgScore}%. Keep reinforcing what's working.`,
    })
  }

  // 3) Critical error rate
  if (k.criticalRate >= 10) insights.push({
    id: 'critical-rate', severity: k.criticalRate >= 20 ? 'high' : 'medium', icon: '🚫', category: 'Critical',
    title: `${k.criticalRate}% of evaluations have a critical error`,
    detail: 'Critical errors zero out the score and usually signal policy/compliance gaps.',
    action: 'Review the most-failed critical criteria with the team; consider a refresher.',
    link: `/results?critical=true&${linkRange}`, linkLabel: 'View critical-error evaluations →',
  })

  // 4) Most-failed criteria
  const topFails = (cur.mistakes ?? []).slice(0, 3)
  if (topFails.length) {
    const top = topFails[0]
    const pct = Math.round((top.fails / k.total) * 100)
    insights.push({
      id: 'top-criterion', severity: pct >= 25 ? 'high' : 'medium', icon: '📋', category: 'Coaching focus',
      title: `Most-failed: “${top.label}” — ${top.fails} fails (${pct}% of evals)`,
      detail: `Other frequent gaps: ${topFails.slice(1).map(m => `“${m.label}” (${m.fails})`).join(', ') || 'none'}.`,
      action: 'Make this the focus of the next coaching round / team huddle.',
      link: `/analysis`, linkLabel: 'Open Analysis →',
    })
  }

  // 5) Channel gap
  const ch = (cur.channels ?? []).filter(c => c.evals >= 5).sort((a, b) => a.avgScore - b.avgScore)
  if (ch.length >= 2) {
    const low = ch[0], high = ch[ch.length - 1]
    const gap = +(high.avgScore - low.avgScore).toFixed(1)
    if (gap >= 5) insights.push({
      id: 'channel-gap', severity: 'medium', icon: '🔀', category: 'Channel',
      title: `${low.key} (${low.avgScore}%) trails ${high.key} (${high.avgScore}%) by ${gap}pts`,
      detail: `Performance varies by channel — ${low.key} handling may need attention.`,
      action: `Review ${low.key}-specific scripts and coach agents on that channel.`,
      link: `/results?channel=${low.key}&${linkRange}`, linkLabel: `View ${low.key} evaluations →`,
    })
  }

  // 6) Agents needing attention
  const weakAll = (cur.agents ?? []).filter(a => a.evals >= 3 && a.avgScore < thr).sort((a, b) => a.avgScore - b.avgScore)
  const weak = weakAll.slice(0, 8)
  if (weak.length) insights.push({
    id: 'weak-agents', severity: 'high', icon: '👥', category: 'Agents',
    title: `${weakAll.length} agent${weakAll.length > 1 ? 's' : ''} averaging below the ${thr}% target`,
    detail: 'Lowest first — click an agent to open their profile.',
    action: 'Schedule focused coaching with these agents.',
    agents: weak.map(a => ({ email: a.key, label: `${a.key.split('@')[0]} · ${a.avgScore}%` })),
  })

  // 7) Coaching backlog
  if (k.needsCoaching > 0) insights.push({
    id: 'coaching-backlog', severity: k.needsCoaching >= 10 ? 'medium' : 'info', icon: '🧑‍🏫', category: 'Coaching',
    title: `${k.needsCoaching} evaluation${k.needsCoaching > 1 ? 's' : ''} flagged for coaching, not yet coached`,
    detail: `Coaching coverage helps agents close gaps before they recur.`,
    action: 'Work through the Needs-Coaching list.',
    link: `/results?needs_coaching=true&${linkRange}`, linkLabel: 'View needs-coaching list →',
  })

  // 8) Top performers (recognition)
  const stars = (cur.agents ?? []).filter(a => a.evals >= 3 && a.avgScore >= Math.max(95, thr) && a.criticalErrors === 0)
    .sort((a, b) => b.avgScore - a.avgScore).slice(0, 5)
  if (stars.length) insights.push({
    id: 'top-performers', severity: 'positive', icon: '🌟', category: 'Recognition',
    title: `${stars.length} top performer${stars.length > 1 ? 's' : ''} this period`,
    detail: 'Click an agent to open their profile.',
    action: 'Recognize them and share their approach with the team.',
    agents: stars.map(a => ({ email: a.key, label: `${a.key.split('@')[0]} · ${a.avgScore}%` })),
  })

  // 9) Pending disputes (current backlog awaiting TL/QA — accurate, status-based)
  let pendingQ = svc.schema('qa').from('qa_disputes')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending_tl', 'pending_qa'])
  if (tl) pendingQ = pendingQ.eq('tl_email', tl)
  const { count: pendingDisputes } = await pendingQ
  if ((pendingDisputes ?? 0) > 0) insights.push({
    id: 'pending-disputes', severity: 'medium', icon: '⚖', category: 'Disputes',
    title: `${pendingDisputes} dispute${pendingDisputes! > 1 ? 's' : ''} awaiting review`,
    detail: 'Disputes left pending erode agent trust in the QA process.',
    action: 'Clear the pending queue (TL → QA).',
    link: `/disputes`, linkLabel: 'Open Disputes →',
  })

  insights.sort((a, b) => RANK[b.severity] - RANK[a.severity])

  return NextResponse.json({ period: { from, to }, threshold: thr, total: k.total, insights })
}
