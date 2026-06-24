import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff, canEdit } from '@/lib/auth'
import { computeScore, type Result } from '@/lib/scoring'

// ── GET /api/evaluations/[id] — evaluation + responses (with criteria) ──
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: ev } = await svc.schema('qa').from('qa_evaluations').select('*').eq('id', id).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Non-staff may only view their own / their team's
  if (!isQaStaff(user.role) && ev.agent_email !== user.email && ev.team_lead_email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Which QA did the evaluation is visible only to QA evaluators + system_admin.
  if (!canEdit(user.role)) delete (ev as Record<string, unknown>).evaluator_email

  const { data: responses } = await svc
    .schema('qa').from('qa_evaluation_responses')
    .select('criterion_id, result, qa_criteria(section, label, weight, is_critical, sort_order, channels, allow_na)')
    .eq('evaluation_id', id)

  // Latest dispute (if any) for this evaluation — the UI uses this to decide
  // whether a dispute can still be raised. The evaluation.disputed flag is not
  // reliable on its own (it's toggled off when QA resolves a dispute).
  const { data: dispute } = await svc
    .schema('qa').from('qa_disputes')
    .select('id, status, created_at')
    .eq('evaluation_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ evaluation: ev, responses: responses ?? [], dispute: dispute ?? null })
}

// ── PUT /api/evaluations/[id] — edit (QA staff) ──────────────
// Editing is restricted to QA evaluators + system_admin (canEdit), not the
// broader QA-staff set used for read access elsewhere.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const svc = createServiceClient()

  const { data: ev } = await svc.schema('qa').from('qa_evaluations').select('scorecard_id').eq('id', id).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  for (const f of ['ticket_number', 'customer_email', 'channel', 'eval_date', 'solved_date', 'notes', 'areas_for_improvement'] as const) {
    if (body[f] !== undefined) patch[f] = body[f] || null
  }

  // If responses are supplied, re-score from authoritative criteria + replace rows.
  if (Array.isArray(body.responses)) {
    const { data: criteria } = await svc
      .schema('qa').from('qa_criteria')
      .select('id, weight, is_critical')
      .eq('scorecard_id', ev.scorecard_id).eq('archived', false)
    const responses = body.responses as { criterion_id: string; result: Result }[]
    const sc = computeScore(responses, criteria ?? [])
    patch.score = sc.score
    patch.total_errors = sc.total_errors
    patch.total_critical_errors = sc.total_critical_errors

    await svc.schema('qa').from('qa_evaluation_responses').delete().eq('evaluation_id', id)
    const rows = responses
      .filter(r => (criteria ?? []).some(c => c.id === r.criterion_id))
      .map(r => ({ evaluation_id: id, criterion_id: r.criterion_id, result: r.result }))
    if (rows.length) await svc.schema('qa').from('qa_evaluation_responses').insert(rows)
  }

  if (Object.keys(patch).length) {
    const { error } = await svc.schema('qa').from('qa_evaluations').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'UPDATE',
    entity: 'qa_evaluation', entity_id: id,
  })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/evaluations/[id] — hard delete (QA evaluators + system_admin) ──
// A deleted evaluation must disappear from the entire system, so we explicitly
// remove every dependent row (disputes & coaching are `on delete set null`, so a
// plain row delete would orphan them) before deleting the evaluation itself.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  // Children first (order matters: disputes/coaching FK is set-null, so they
  // must be matched by evaluation_id before the parent row is gone).
  await svc.schema('qa').from('qa_disputes').delete().eq('evaluation_id', id)
  await svc.schema('qa').from('qa_coaching').delete().eq('evaluation_id', id)
  await svc.schema('qa').from('qa_evaluation_responses').delete().eq('evaluation_id', id)
  const { error } = await svc.schema('qa').from('qa_evaluations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'DELETE',
    entity: 'qa_evaluation', entity_id: id,
  })
  return NextResponse.json({ ok: true })
}
