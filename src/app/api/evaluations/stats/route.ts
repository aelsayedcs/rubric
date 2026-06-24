import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// GET /api/evaluations/stats — aggregate KPIs over the full filtered set.
// Mirrors the list filters + role scoping. Pages through minimal columns so the
// averages/counts are accurate beyond the 1000-row list cap.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams

  const build = () => {
    let q = svc.schema('qa').from('qa_evaluations')
      .select('id, score, total_critical_errors, coached')
      .is('deleted_at', null)
    if (!isQaStaff(user.role)) {
      if (user.role === 'team_lead') q = q.eq('team_lead_email', user.email)
      else q = q.eq('agent_email', user.email)
    }
    const status = sp.get('status'); if (status) q = q.eq('status', status)
    const agent = sp.get('agent'); if (agent) q = q.eq('agent_email', normEmail(agent))
    const tl = sp.get('team_lead'); if (tl) q = q.eq('team_lead_email', normEmail(tl))
    const channel = sp.get('channel'); if (channel) q = q.eq('channel', channel)
    const coached = sp.get('coached'); if (coached === 'true') q = q.eq('coached', true); else if (coached === 'false') q = q.eq('coached', false)
    const from = sp.get('date_from'); if (from) q = q.gte('eval_date', from)
    const to = sp.get('date_to'); if (to) q = q.lte('eval_date', to + 'T23:59:59')
    const search = sp.get('search'); if (search) q = q.ilike('ticket_number', `%${search}%`)
    return q
  }

  const { data: cfg } = await svc.from('app_config')
    .select('value').eq('app', 'quality').eq('key', 'coaching_threshold').maybeSingle()
  const threshold = Number(cfg?.value ?? 85)

  // Dispute status per evaluation — a dispute is "pending" while awaiting TL/QA,
  // otherwise "finished" (rejected/approved/resolved).
  const { data: disp } = await svc.schema('qa').from('qa_disputes').select('evaluation_id, status')
  const pendingIds = new Set<string>(), finishedIds = new Set<string>()
  for (const d of disp ?? []) {
    if (!d.evaluation_id) continue
    if (String(d.status).startsWith('pending')) pendingIds.add(d.evaluation_id as string)
    else finishedIds.add(d.evaluation_id as string)
  }

  let total = 0, scoreSum = 0, critical = 0, coachedN = 0, dPending = 0, dFinished = 0, needs = 0
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build().range(off, off + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    for (const e of data as { id: string; score: number; total_critical_errors: number; coached: boolean }[]) {
      total++; scoreSum += Number(e.score)
      if (e.total_critical_errors > 0) critical++
      if (e.coached) coachedN++
      if (pendingIds.has(e.id)) dPending++
      else if (finishedIds.has(e.id)) dFinished++
      if (!e.coached && (Number(e.score) < threshold || e.total_critical_errors > 0)) needs++
    }
    if (data.length < 1000) break
  }

  return NextResponse.json({
    total,
    avgScore: total ? Math.round(scoreSum / total) : 0,
    critical,
    coached: coachedN,
    coachedPct: total ? Math.round(coachedN / total * 100) : 0,
    needsCoaching: needs,
    disputed: dPending + dFinished,
    disputedPending: dPending,
    disputedFinished: dFinished,
    threshold,
  })
}
