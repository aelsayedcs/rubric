import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { computeScore, type Result } from '@/lib/scoring'
import { normEmail } from '@/lib/utils'

// ── GET /api/evaluations — filtered list ─────────────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams

  // Only the columns the Results table + CSV export need (skips heavy text like
  // notes/areas_for_improvement) — keeps the list payload small and fast.
  const LIST_COLS = 'id, agent_email, team_lead_email, ticket_number, customer_email, channel, score, total_errors, total_critical_errors, eval_date, solved_date, status, coached, disputed, source'
  let q = svc.schema('qa').from('qa_evaluations')
    .select(LIST_COLS, { count: 'exact' })
    .is('deleted_at', null)
    .order('eval_date', { ascending: false })

  // Role scoping (service-role bypasses RLS, so we scope explicitly)
  if (!isQaStaff(user.role)) {
    if (user.role === 'team_lead') q = q.eq('team_lead_email', user.email)
    else q = q.eq('agent_email', user.email)
  }

  // Filters
  const status = sp.get('status'); if (status) q = q.eq('status', status)
  const agent = sp.get('agent'); if (agent) q = q.eq('agent_email', normEmail(agent))
  const tl = sp.get('team_lead'); if (tl) q = q.eq('team_lead_email', normEmail(tl))
  const channel = sp.get('channel'); if (channel) q = q.eq('channel', channel)
  const coached = sp.get('coached'); if (coached === 'true') q = q.eq('coached', true); else if (coached === 'false') q = q.eq('coached', false)
  const sMin = sp.get('score_min'); if (sMin) q = q.gte('score', Number(sMin))
  const sMax = sp.get('score_max'); if (sMax) q = q.lte('score', Number(sMax))
  const from = sp.get('date_from'); if (from) q = q.gte('eval_date', from)
  const to = sp.get('date_to'); if (to) q = q.lte('eval_date', to + 'T23:59:59')
  const search = sp.get('search'); if (search) q = q.ilike('ticket_number', `%${search}%`)

  // Stat-card drill-downs (used by the Results page cards)
  if (sp.get('critical') === 'true') q = q.gt('total_critical_errors', 0)
  if (sp.get('needs_coaching') === 'true') {
    const { data: cfg } = await svc.from('app_config')
      .select('value').eq('app', 'quality').eq('key', 'coaching_threshold').maybeSingle()
    const threshold = Number(cfg?.value ?? 85)
    q = q.eq('coached', false).or(`score.lt.${threshold},total_critical_errors.gt.0`)
  }
  // Disputed drill-downs are driven by the dispute records (the disputed boolean
  // is cleared on approval, so it can't represent "all disputed" or pending vs finished).
  const disputed = sp.get('disputed')
  if (disputed === 'true' || disputed === 'pending' || disputed === 'finished') {
    const { data: disp } = await svc.schema('qa').from('qa_disputes').select('evaluation_id, status')
    const ids = (disp ?? [])
      .filter(d => d.evaluation_id && (
        disputed === 'true' ? true
        : disputed === 'pending' ? String(d.status).startsWith('pending')
        : !String(d.status).startsWith('pending')))
      .map(d => d.evaluation_id as string)
    q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }

  // Paginate (PostgREST caps ~1000 rows). Default first 1000.
  const limit = Math.min(Number(sp.get('limit') ?? 1000), 1000)
  const offset = Number(sp.get('offset') ?? 0)
  q = q.range(offset, offset + limit - 1)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evaluations: data ?? [], total: count ?? (data?.length ?? 0) })
}

// ── POST /api/evaluations — create (QA staff only, final) ────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    scorecard_id, agent_email, ticket_number, customer_email,
    channel, eval_date, solved_date, notes, areas_for_improvement,
    responses,
  } = body as {
    scorecard_id: string; agent_email: string; ticket_number: string
    customer_email?: string; channel: string; eval_date?: string
    solved_date?: string; notes?: string; areas_for_improvement?: string
    responses: { criterion_id: string; result: Result }[]
  }

  if (!scorecard_id || !agent_email || !ticket_number || !channel || !Array.isArray(responses)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Backdating the QA date is restricted to qa_evaluator and system_admin; everyone
  // else always gets "now" regardless of what the client sends.
  const canSetEvalDate = user.role === 'qa_evaluator' || user.role === 'system_admin'
  const evalDate = (canSetEvalDate && eval_date) ? eval_date : new Date().toISOString()

  const svc = createServiceClient()

  // Authoritative criteria from DB (never trust client weights)
  const { data: criteria } = await svc
    .schema('qa').from('qa_criteria')
    .select('id, weight, is_critical')
    .eq('scorecard_id', scorecard_id)
    .eq('archived', false)
  if (!criteria?.length) return NextResponse.json({ error: 'Invalid scorecard' }, { status: 400 })

  const { score, total_errors, total_critical_errors } = computeScore(responses, criteria)

  // Auto-fill team lead from agents mapping
  const agent = normEmail(agent_email)
  const { data: agentRow } = await svc.from('agents').select('team_lead_email').eq('email', agent).maybeSingle()

  const { data: created, error: insErr } = await svc
    .schema('qa').from('qa_evaluations')
    .insert({
      scorecard_id,
      agent_email: agent,
      evaluator_email: user.email,
      team_lead_email: agentRow?.team_lead_email ?? null,
      ticket_number: String(ticket_number).trim(),
      customer_email: customer_email ? normEmail(customer_email) : null,
      channel,
      eval_date: evalDate,
      solved_date: solved_date || null,
      score, total_errors, total_critical_errors,
      status: 'archived',
      source: 'manual',
      notes: notes || null,
      areas_for_improvement: areas_for_improvement || null,
    })
    .select('id')
    .single()

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Child responses
  const rows = responses
    .filter(r => criteria.some(c => c.id === r.criterion_id))
    .map(r => ({ evaluation_id: created.id, criterion_id: r.criterion_id, result: r.result }))
  if (rows.length) {
    const { error: rErr } = await svc.schema('qa').from('qa_evaluation_responses').insert(rows)
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  }

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'CREATE',
    entity: 'qa_evaluation', entity_id: created.id, new_value: `${ticket_number} · ${score}%`,
  })

  return NextResponse.json({ ok: true, id: created.id, score })
}
