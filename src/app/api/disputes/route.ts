import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { notify } from '@/lib/notify'

// ── GET /api/disputes — list scoped by role ──────────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  let q = svc.schema('qa').from('qa_disputes').select('*').order('last_updated_at', { ascending: false })

  if (!isQaStaff(user.role)) {
    if (user.role === 'team_lead') q = q.eq('tl_email', user.email)
    else q = q.eq('agent_email', user.email)
  }
  const sp = req.nextUrl.searchParams
  const status = sp.get('status'); if (status) q = q.eq('status', status)
  const search = sp.get('search'); if (search) q = q.or(`ticket_number.ilike.%${search}%,agent_email.ilike.%${search}%`)
  const from = sp.get('date_from'); if (from) q = q.gte('created_at', from)
  const to = sp.get('date_to'); if (to) q = q.lte('created_at', to + 'T23:59:59')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Hide disputes whose evaluation has been soft-deleted (deleting an evaluation
  // removes it from every view, including its dispute thread).
  const evalIds = [...new Set((data ?? []).map(d => d.evaluation_id).filter(Boolean))]
  let deleted = new Set<string>()
  if (evalIds.length) {
    const { data: del } = await svc.schema('qa').from('qa_evaluations')
      .select('id').in('id', evalIds).not('deleted_at', 'is', null)
    deleted = new Set((del ?? []).map(e => e.id as string))
  }
  const disputes = (data ?? []).filter(d => !d.evaluation_id || !deleted.has(d.evaluation_id))
  return NextResponse.json({ disputes })
}

// ── POST /api/disputes — file a dispute against an evaluation ─
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { evaluation_id, comment } = await req.json()
  if (!evaluation_id) return NextResponse.json({ error: 'evaluation_id required' }, { status: 400 })

  const svc = createServiceClient()
  const { data: ev } = await svc.schema('qa').from('qa_evaluations')
    .select('id, agent_email, team_lead_email, ticket_number').eq('id', evaluation_id).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })

  // The agent (own evaluation) or that agent's team lead may raise a dispute;
  // QA staff may dispute any evaluation.
  if (!isQaStaff(user.role) && ev.agent_email !== user.email && ev.team_lead_email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // One dispute per evaluation — reject if one already exists (any status).
  const { data: existing } = await svc.schema('qa').from('qa_disputes')
    .select('id').eq('evaluation_id', evaluation_id).limit(1)
  if (existing && existing.length) {
    return NextResponse.json({ error: 'This evaluation has already been disputed.' }, { status: 409 })
  }

  const { data: created, error } = await svc.schema('qa').from('qa_disputes').insert({
    evaluation_id,
    agent_email: ev.agent_email,
    ticket_number: ev.ticket_number,
    comment: comment || null,
    submitted_by: user.email,
    tl_email: ev.team_lead_email,
    status: 'pending_tl',
    last_updated_by: user.email,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.schema('qa').from('qa_evaluations').update({ disputed: true }).eq('id', evaluation_id)
  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'DISPUTE',
    entity: 'qa_evaluation', entity_id: evaluation_id, new_value: 'pending_tl',
  })

  // Notify the team lead that a dispute is waiting for their review.
  if (ev.team_lead_email) {
    await notify({
      recipient_email: ev.team_lead_email,
      type: 'dispute_raised',
      title: `New dispute on ticket ${ev.ticket_number}`,
      body: `${ev.agent_email} disputed their evaluation — awaiting your review.`,
      link: '/disputes',
    })
  }

  return NextResponse.json({ ok: true, id: created.id })
}
