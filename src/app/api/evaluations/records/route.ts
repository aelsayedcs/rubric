import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

interface EvalRow {
  id: string; ticket_number: string; agent_email: string; channel: string
  score: number; total_critical_errors: number; coached: boolean; eval_date: string
}

// GET /api/evaluations/records — drill-down list behind an analysis section.
// Supports the same filters as /api/analysis plus `criterion` (a failed criterion
// label) and `bucket` (coached | not_coached | needs).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role) && user.role !== 'team_lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams
  const from = sp.get('date_from'); const to = sp.get('date_to')
  const channel = sp.get('channel'); const agent = sp.get('agent')
  const criterion = sp.get('criterion'); const bucket = sp.get('bucket')
  let tl = sp.get('team_lead')
  if (user.role === 'team_lead' && !isQaStaff(user.role)) tl = user.email

  let threshold = 85
  if (bucket === 'needs') {
    const { data: cfg } = await svc.from('app_config').select('value')
      .eq('app', 'quality').eq('key', 'coaching_threshold').maybeSingle()
    threshold = Number(cfg?.value ?? 85)
  }

  // Apply the shared evaluation filters, optionally against an embedded resource.
  const applyFilters = <T extends { is: (c: string, v: null) => T; gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; eq: (c: string, v: string) => T }>(q: T, p = ''): T => {
    q = q.is(p + 'deleted_at', null)
    if (from) q = q.gte(p + 'eval_date', from)
    if (to) q = q.lte(p + 'eval_date', to + 'T23:59:59')
    if (channel) q = q.eq(p + 'channel', channel)
    if (tl) q = q.eq(p + 'team_lead_email', normEmail(tl))
    if (agent) q = q.eq(p + 'agent_email', normEmail(agent))
    return q
  }

  let evals: EvalRow[] = []

  if (criterion) {
    let q = svc.schema('qa').from('qa_evaluation_responses')
      .select('qa_criteria!inner(label), qa_evaluations!inner(id,ticket_number,agent_email,channel,score,total_critical_errors,coached,eval_date,deleted_at,team_lead_email)')
      .eq('result', 'fail').eq('qa_criteria.label', criterion).limit(2000)
    q = applyFilters(q as never, 'qa_evaluations.')
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const seen = new Set<string>()
    for (const r of (data ?? []) as unknown as { qa_evaluations: EvalRow | null }[]) {
      const e = r.qa_evaluations
      if (e && !seen.has(e.id)) { seen.add(e.id); evals.push(e) }
    }
    // Criterion + bucket combo (rare) — filter the (small) criterion set in JS.
    if (bucket === 'coached') evals = evals.filter(e => e.coached)
    else if (bucket === 'not_coached') evals = evals.filter(e => !e.coached)
    else if (bucket === 'needs') evals = evals.filter(e => !e.coached && (Number(e.score) < threshold || e.total_critical_errors > 0))
  } else {
    let q = svc.schema('qa').from('qa_evaluations')
      .select('id,ticket_number,agent_email,channel,score,total_critical_errors,coached,eval_date')
      .order('eval_date', { ascending: false }).limit(2000)
    q = applyFilters(q as never, '')
    // Apply the bucket in SQL so sparse buckets (e.g. coached) aren't lost behind
    // the 2000-row cap when fetching the most-recent rows.
    if (bucket === 'coached') q = q.eq('coached', true)
    else if (bucket === 'not_coached') q = q.eq('coached', false)
    else if (bucket === 'needs') q = q.eq('coached', false).or(`score.lt.${threshold},total_critical_errors.gt.0`)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    evals = (data ?? []) as EvalRow[]
  }

  evals.sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date)))
  return NextResponse.json({ evaluations: evals })
}
