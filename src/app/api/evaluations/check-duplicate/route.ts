import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// GET /api/evaluations/check-duplicate?agent=&ticket= — advisory only.
// Returns whether a live evaluation already exists for this agent + ticket.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const agent = normEmail(sp.get('agent') ?? '')
  const ticket = (sp.get('ticket') ?? '').trim()
  if (!agent || !ticket) return NextResponse.json({ exists: false })

  const svc = createServiceClient()
  const { data } = await svc.schema('qa').from('qa_evaluations')
    .select('id, eval_date, score, evaluator_email')
    .eq('agent_email', agent).eq('ticket_number', ticket).is('deleted_at', null)
    .order('eval_date', { ascending: false }).limit(1)

  const m = data?.[0]
  return NextResponse.json({
    exists: !!m,
    id: m?.id ?? null,
    eval_date: m?.eval_date ?? null,
    score: m?.score ?? null,
    evaluator: m?.evaluator_email ?? null,
  })
}
