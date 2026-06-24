import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, canCoach } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { sendCoachingEmail } from '@/lib/email'

// ── GET — read-only coaching view for an evaluation ──────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data } = await svc.schema('qa').from('qa_coaching')
    .select('*').eq('evaluation_id', id).order('created_at', { ascending: false })
  return NextResponse.json({ coaching: data ?? [] })
}

// ── PATCH — the agent acknowledges they've read their coaching ──
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  // Only the coached agent may acknowledge their own coaching.
  const { error } = await svc.schema('qa').from('qa_coaching')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('evaluation_id', id).eq('agent_email', user.email).is('acknowledged_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── POST — create coaching, mark evaluation coached, email agent ──
// One-time per evaluation (rejects if already coached).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCoach(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { strengths, areas_for_improvement, action_plan } = await req.json()

  const svc = createServiceClient()
  const { data: ev } = await svc.schema('qa').from('qa_evaluations')
    .select('id, agent_email, team_lead_email, ticket_number, channel, score, coached')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ev.coached) return NextResponse.json({ error: 'Already coached' }, { status: 409 })

  // Send email (best-effort) before flagging
  const emailed = await sendCoachingEmail({
    to: ev.agent_email,
    ticket: ev.ticket_number,
    channel: ev.channel,
    score: ev.score,
    strengths, areas: areas_for_improvement, actionPlan: action_plan,
    coachEmail: user.email,
  })

  const { error: cErr } = await svc.schema('qa').from('qa_coaching').insert({
    evaluation_id: id,
    agent_email: ev.agent_email,
    coach_email: user.email,
    ticket_id: ev.ticket_number,
    strengths: strengths || null,
    areas_for_improvement: areas_for_improvement || null,
    action_plan: action_plan || null,
    email_sent: emailed,
    team_lead_email: ev.team_lead_email,
  })
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  await svc.schema('qa').from('qa_evaluations').update({
    coached: true, coached_by: user.email, coached_at: new Date().toISOString(),
  }).eq('id', id)

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'COACH',
    entity: 'qa_evaluation', entity_id: id, new_value: emailed ? 'emailed' : 'no-email',
  })

  await notify({
    recipient_email: ev.agent_email,
    type: 'coaching',
    title: `New coaching on ticket ${ev.ticket_number}`,
    body: areas_for_improvement ? `Focus: ${String(areas_for_improvement).slice(0, 120)}` : 'Your team has shared coaching feedback.',
    link: '/results',
  })

  return NextResponse.json({ ok: true, emailed })
}
