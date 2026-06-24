import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES, type AppRole } from '@/types'

// Only the top tier may edit the visibility matrix.
const TOP_ROLES: AppRole[] = ['system_admin', 'system_owner']

// GET /api/permissions — the page→role matrix (admins can view).
export async function GET() {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })
  const svc = createServiceClient()
  const { data, error } = await svc.from('page_access').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data ?? [] })
}

// POST /api/permissions — update one page's allowed roles (top tier only).
export async function POST(req: NextRequest) {
  const guard = await requireRole(TOP_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden — top admin only' }, { status: guard.status })

  const { key, roles } = await req.json()
  if (!key || !Array.isArray(roles)) return NextResponse.json({ error: 'key and roles[] required' }, { status: 400 })

  // Never allow a page to drop the top tier — prevents lock-out.
  const finalRoles = Array.from(new Set([...roles, ...TOP_ROLES]))

  const svc = createServiceClient()
  const { error } = await svc.from('page_access')
    .update({ roles: finalRoles, updated_at: new Date().toISOString() }).eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'page_access', entity_id: key, new_value: finalRoles.join(','),
  })
  return NextResponse.json({ ok: true })
}
