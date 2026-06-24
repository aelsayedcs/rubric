import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES } from '@/types'
import { normEmail } from '@/lib/utils'

// ── GET /api/access — users + their quality role ─────────────
export async function GET() {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const svc = createServiceClient()
  const { data: access } = await svc.from('app_access')
    .select('email, role, archived, created_at').eq('app', 'quality').order('email')
  return NextResponse.json({ access: access ?? [] })
}

// ── POST /api/access — grant / update a quality role ─────────
export async function POST(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const { email, role, archived } = await req.json()
  const e = normEmail(email)
  if (!e || !role) return NextResponse.json({ error: 'email and role required' }, { status: 400 })

  const svc = createServiceClient()

  // Ensure a profile row exists (so FKs / RLS resolve).
  await svc.from('profiles').upsert({ id: crypto.randomUUID(), email: e }, { onConflict: 'email', ignoreDuplicates: true })

  const { error } = await svc.from('app_access').upsert(
    { email: e, app: 'quality', role, archived: !!archived, granted_by: guard.user.email },
    { onConflict: 'email,app' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'app_access', entity_id: e, new_value: archived ? `revoked` : role,
  })
  return NextResponse.json({ ok: true })
}
