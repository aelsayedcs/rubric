import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { toYMD } from '@/lib/dates'

// GET /api/cron/target-misses — scheduled (weekly via vercel.json).
// Notifies each team lead about agents whose rolling 30-day average is below
// their applicable avg-score target. Weekly cadence is the throttle (a persistent
// miss re-alerts weekly). Protected by CRON_SECRET when set.
export const maxDuration = 60
const MIN_EVALS = 3

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()

  // Targets → resolver (agent → team lead → global).
  const { data: tRows } = await svc.from('qa_targets')
    .select('scope_type, scope_value, avg_score')
  const agentT = new Map<string, number>(), tlT = new Map<string, number>()
  let globalT: number | null = null
  for (const t of tRows ?? []) {
    if (t.avg_score == null) continue
    if (t.scope_type === 'agent' && t.scope_value) agentT.set((t.scope_value as string).toLowerCase(), Number(t.avg_score))
    else if (t.scope_type === 'team_lead' && t.scope_value) tlT.set((t.scope_value as string).toLowerCase(), Number(t.avg_score))
    else if (t.scope_type === 'global') globalT = Number(t.avg_score)
  }

  // Active agents with a team lead.
  const { data: agents } = await svc.from('agents')
    .select('email, team_lead_email, active').eq('active', true)
  const agentTl = new Map<string, string>()
  for (const a of agents ?? []) if (a.team_lead_email) agentTl.set((a.email as string).toLowerCase(), (a.team_lead_email as string).toLowerCase())

  // Rolling 30-day scores per agent.
  const from = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d) })()
  const stat = new Map<string, { s: number; n: number }>()
  for (let off = 0; ; off += 1000) {
    const { data } = await svc.schema('qa').from('qa_evaluations')
      .select('agent_email, score').is('deleted_at', null).gte('eval_date', from)
      .range(off, off + 999)
    if (!data?.length) break
    for (const e of data as { agent_email: string; score: number }[]) {
      const a = e.agent_email.toLowerCase()
      const v = stat.get(a) ?? { s: 0, n: 0 }; v.s += Number(e.score); v.n++; stat.set(a, v)
    }
    if (data.length < 1000) break
  }

  let alerted = 0, checked = 0
  const items = []
  for (const [agent, v] of stat) {
    if (v.n < MIN_EVALS) continue
    const tl = agentTl.get(agent); if (!tl) continue
    const target = agentT.get(agent) ?? tlT.get(tl) ?? globalT
    if (target == null) continue
    checked++
    const avg = Math.round(v.s / v.n)
    if (avg < target) {
      alerted++
      items.push({
        recipient_email: tl, type: 'target_missed',
        title: `${agent.split('@')[0]} is below the ${target}% target`,
        body: `30-day average is ${avg}% across ${v.n} evaluations. Consider focused coaching.`,
        link: `/agent/${encodeURIComponent(agent)}`,
      })
    }
  }
  if (items.length) await notify(items)

  return NextResponse.json({ ok: true, window_from: from, agents_checked: checked, alerts_sent: alerted })
}
