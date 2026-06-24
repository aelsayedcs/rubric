import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { notify, qaStaffEmails } from '@/lib/notify'

// PATCH /api/disputes/[id] — TL or QA decision in the workflow.
// body: { actor: 'tl' | 'qa', decision: 'approve' | 'reject', comment?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actor, decision, comment } = await req.json()
  if (!['tl', 'qa'].includes(actor) || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data: d } = await svc.schema('qa').from('qa_disputes').select('*').eq('id', id).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_updated_by: user.email, last_updated_at: now }

  if (actor === 'tl') {
    // Team lead (or QA staff acting) reviews first.
    if (user.role !== 'team_lead' && !isQaStaff(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (d.status !== 'pending_tl') return NextResponse.json({ error: 'Not awaiting TL review' }, { status: 409 })
    patch.tl_decision = decision
    patch.tl_comment = comment || null
    patch.tl_email = user.email
    patch.tl_action_at = now
    // Approve → escalate to QA; Reject → bounce back as rejected_tl.
    patch.status = decision === 'approve' ? 'pending_qa' : 'rejected_tl'
  } else {
    // QA makes the final call.
    if (!isQaStaff(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (d.status !== 'pending_qa') return NextResponse.json({ error: 'Not awaiting QA review' }, { status: 409 })
    patch.qa_decision = decision
    patch.qa_comment = comment || null
    patch.qa_email = user.email
    patch.qa_action_at = now
    patch.status = decision === 'approve' ? 'approved_qa' : 'rejected_qa'
  }

  const { error } = await svc.schema('qa').from('qa_disputes').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // QA's decision is final and is kept as the dispute status (approved_qa /
  // rejected_qa) — we no longer collapse it to 'resolved', so the status filter
  // reflects the real outcome. The evaluation's disputed flag is updated:
  // an approved dispute clears it; a rejected one leaves the eval flagged.
  if (actor === 'qa' && d.evaluation_id) {
    await svc.schema('qa').from('qa_evaluations')
      .update({ disputed: decision === 'reject' }).eq('id', d.evaluation_id)
  }

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'DISPUTE',
    entity: 'qa_dispute', entity_id: id, new_value: `${actor}:${decision}`,
  })

  // Notifications: tell the submitter the outcome; on TL approval, alert QA that
  // the dispute now needs their decision.
  const ticket = d.ticket_number ?? 'ticket'
  if (actor === 'tl') {
    await notify({
      recipient_email: d.submitted_by,
      type: 'dispute_decision',
      title: `Your dispute on ${ticket} was ${decision === 'approve' ? 'approved by your team lead' : 'rejected by your team lead'}`,
      body: decision === 'approve' ? 'It has been escalated to QA for a final decision.' : (comment || null),
      link: '/disputes',
    })
    if (decision === 'approve') {
      const qa = await qaStaffEmails()
      await notify(qa.map(e => ({
        recipient_email: e, type: 'dispute_raised',
        title: `Dispute on ${ticket} needs QA review`,
        body: `Approved by the team lead — awaiting your final decision.`, link: '/disputes',
      })))
    }
  } else {
    await notify({
      recipient_email: d.submitted_by,
      type: 'dispute_decision',
      title: `Your dispute on ${ticket} was ${decision === 'approve' ? 'approved' : 'rejected'} by QA`,
      body: comment || null,
      link: '/disputes',
    })
  }

  return NextResponse.json({ ok: true })
}
