import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

// GET /api/notifications — current user's recent notifications + unread count.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const email = user.email.toLowerCase()
  const { data } = await svc.from('notifications')
    .select('id, type, title, body, link, read_at, created_at')
    .eq('recipient_email', email)
    .order('created_at', { ascending: false })
    .limit(30)
  const { count } = await svc.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', email).is('read_at', null)

  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 })
}

// PATCH /api/notifications — mark read. Body: { id } to mark one, or {} for all.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const svc = createServiceClient()
  const email = user.email.toLowerCase()
  let q = svc.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_email', email).is('read_at', null)
  if (body.id) q = q.eq('id', body.id)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
