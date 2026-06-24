import { type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// Detailed CSV export — one row per ticket + a Pass/Fail/N/A column per scorecard
// criterion. Mirrors the list filters and role scoping. Runs server-side so it
// can page through every matching row and join the per-criterion responses.
export const maxDuration = 60

const RESULT_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' }
const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const ymd = (d: unknown) => (d ? String(d).slice(0, 10) : '')

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams

  // Re-apply the same filters + role scoping as GET /api/evaluations.
  const build = () => {
    let q = svc.schema('qa').from('qa_evaluations')
      .select('id, ticket_number, agent_email, team_lead_email, customer_email, channel, score, total_errors, total_critical_errors, eval_date, solved_date, coached, disputed, notes, areas_for_improvement')
      .is('deleted_at', null)
      .order('eval_date', { ascending: false })
    if (!isQaStaff(user.role)) {
      if (user.role === 'team_lead') q = q.eq('team_lead_email', user.email)
      else q = q.eq('agent_email', user.email)
    }
    const agent = sp.get('agent'); if (agent) q = q.eq('agent_email', normEmail(agent))
    const tl = sp.get('team_lead'); if (tl) q = q.eq('team_lead_email', normEmail(tl))
    const channel = sp.get('channel'); if (channel) q = q.eq('channel', channel)
    const coached = sp.get('coached'); if (coached === 'true') q = q.eq('coached', true); else if (coached === 'false') q = q.eq('coached', false)
    const from = sp.get('date_from'); if (from) q = q.gte('eval_date', from)
    const to = sp.get('date_to'); if (to) q = q.lte('eval_date', to + 'T23:59:59')
    const search = sp.get('search'); if (search) q = q.ilike('ticket_number', `%${search}%`)
    return q
  }

  // 1) Page through every matching evaluation.
  type Ev = {
    id: string; ticket_number: string; agent_email: string; team_lead_email: string | null
    customer_email: string | null; channel: string; score: number; total_errors: number
    total_critical_errors: number; eval_date: string; solved_date: string | null
    coached: boolean; disputed: boolean; notes: string | null; areas_for_improvement: string | null
  }
  const evals: Ev[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build().range(off, off + 999)
    if (error) return new Response('Export failed: ' + error.message, { status: 500 })
    if (!data?.length) break
    evals.push(...(data as Ev[]))
    if (data.length < 1000) break
  }

  // 2) Criterion columns (deduped by label, ordered by section then sort_order).
  const { data: crit } = await svc.schema('qa').from('qa_criteria')
    .select('id, label, section, sort_order').order('section').order('sort_order')
  const idToLabel = new Map<string, string>()
  const cols: string[] = []
  const seen = new Set<string>()
  for (const c of crit ?? []) {
    idToLabel.set(c.id as string, c.label as string)
    if (!seen.has(c.label as string)) { seen.add(c.label as string); cols.push(c.label as string) }
  }

  // 3) Per-criterion responses for these evaluations (chunked to stay under the row cap).
  const byEval = new Map<string, Map<string, string>>()
  const ids = evals.map(e => e.id)
  const CHUNK = 40
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const { data: rs } = await svc.schema('qa').from('qa_evaluation_responses')
      .select('evaluation_id, criterion_id, result').in('evaluation_id', slice)
    for (const r of rs ?? []) {
      const lbl = idToLabel.get(r.criterion_id as string); if (!lbl) continue
      let m = byEval.get(r.evaluation_id as string); if (!m) { m = new Map(); byEval.set(r.evaluation_id as string, m) }
      m.set(lbl, r.result as string)
    }
  }

  // 4) Build the wide CSV.
  const base = ['Ticket', 'Agent', 'Team Lead', 'Customer', 'Channel', 'Score', 'Errors', 'Critical', 'Coached', 'Disputed', 'QA Date', 'Solved Date']
  const header = [...base, ...cols, 'Notes', 'Areas for Improvement']
  const lines = evals.map(e => {
    const m = byEval.get(e.id) ?? new Map<string, string>()
    const row: unknown[] = [
      e.ticket_number, e.agent_email, e.team_lead_email ?? '', e.customer_email ?? '', e.channel,
      e.score, e.total_errors, e.total_critical_errors, e.coached ? 'Yes' : 'No', e.disputed ? 'Yes' : 'No',
      ymd(e.eval_date), ymd(e.solved_date),
    ]
    for (const lbl of cols) row.push(RESULT_LABEL[m.get(lbl) ?? ''] ?? '')
    row.push(e.notes ?? '', e.areas_for_improvement ?? '')
    return row.map(esc).join(',')
  })

  const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\n') // BOM for Excel
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qa-detailed-export-${ymd(new Date().toISOString())}.csv"`,
    },
  })
}
