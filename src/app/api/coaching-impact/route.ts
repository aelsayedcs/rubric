import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// GET /api/coaching-impact — did coaching move the needle?
// For each coached agent, compares their average score BEFORE their first
// coaching vs AFTER it. Rolls up to a team-wide effect. Read-only.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role) && user.role !== 'team_lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = createServiceClient()
  const tl = (user.role === 'team_lead' && !isQaStaff(user.role)) ? user.email : (req.nextUrl.searchParams.get('team_lead') || '')
  const onlyAgent = req.nextUrl.searchParams.get('agent') ? normEmail(req.nextUrl.searchParams.get('agent')!) : ''

  // First coaching date per agent.
  let cq = svc.schema('qa').from('qa_coaching').select('agent_email, created_at')
  if (tl) cq = cq.eq('team_lead_email', tl)
  if (onlyAgent) cq = cq.eq('agent_email', onlyAgent)
  const { data: coachings } = await cq
  const firstCoach = new Map<string, number>()
  for (const c of coachings ?? []) {
    const a = (c.agent_email as string).toLowerCase()
    const t = new Date(c.created_at as string).getTime()
    if (!firstCoach.has(a) || t < firstCoach.get(a)!) firstCoach.set(a, t)
  }
  if (firstCoach.size === 0) {
    return NextResponse.json({ summary: { count: 0, avgBefore: 0, avgAfter: 0, avgDelta: 0, improved: 0, declined: 0 }, agents: [] })
  }

  // All evals for those agents (minimal cols, paginated).
  type Acc = { before: { s: number; n: number }; after: { s: number; n: number } }
  const acc = new Map<string, Acc>()
  for (const a of firstCoach.keys()) acc.set(a, { before: { s: 0, n: 0 }, after: { s: 0, n: 0 } })
  const agentList = [...firstCoach.keys()]

  for (let off = 0; ; off += 1000) {
    let eq = svc.schema('qa').from('qa_evaluations')
      .select('agent_email, score, eval_date')
      .is('deleted_at', null)
      .in('agent_email', agentList)
      .order('eval_date', { ascending: true })
      .range(off, off + 999)
    if (tl) eq = eq.eq('team_lead_email', tl)
    const { data, error } = await eq
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    for (const e of data as { agent_email: string; score: number; eval_date: string }[]) {
      const a = e.agent_email.toLowerCase()
      const fc = firstCoach.get(a); if (fc === undefined) continue
      const bucket = new Date(e.eval_date).getTime() < fc ? 'before' : 'after'
      const b = acc.get(a)![bucket]; b.s += Number(e.score); b.n++
    }
    if (data.length < 1000) break
  }

  const agents = [...acc.entries()]
    .filter(([, v]) => v.before.n > 0 && v.after.n > 0)
    .map(([email, v]) => {
      const before = Math.round(v.before.s / v.before.n)
      const after = Math.round(v.after.s / v.after.n)
      return { email, before, after, delta: after - before, evalsBefore: v.before.n, evalsAfter: v.after.n }
    })
    .sort((a, b) => b.delta - a.delta)

  const n = agents.length
  const summary = {
    count: n,
    avgBefore: n ? Math.round(agents.reduce((s, a) => s + a.before, 0) / n) : 0,
    avgAfter: n ? Math.round(agents.reduce((s, a) => s + a.after, 0) / n) : 0,
    avgDelta: n ? +(agents.reduce((s, a) => s + a.delta, 0) / n).toFixed(1) : 0,
    improved: agents.filter(a => a.delta > 0).length,
    declined: agents.filter(a => a.delta < 0).length,
  }

  return NextResponse.json({ summary, agents })
}
