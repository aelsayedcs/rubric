import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

// Managing role TYPES: create/edit limited to the top tier; DELETE is
// system_admin only, and the system_admin role itself can never be deleted.
const TOP = ['system_admin', 'system_owner']

// ── GET /api/roles — catalog + per-role user counts ──────────────────────────
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc.from('roles')
    .select('key, display_name, description, is_system, archived, sort_order')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // How many users currently hold each role (active grants for the quality app).
  const { data: acc } = await svc.from('app_access')
    .select('role').eq('app', 'quality').eq('archived', false)
  const counts: Record<string, number> = {}
  for (const a of acc ?? []) counts[a.role as string] = (counts[a.role as string] ?? 0) + 1

  return NextResponse.json({
    roles: (data ?? []).map(r => ({ ...r, users: counts[r.key as string] ?? 0 })),
    role: user.role,
  })
}

// ── POST /api/roles — create a custom role type ──────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role || !TOP.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { key, display_name, description } = await req.json()
  const k = String(key ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
  if (!k || !display_name) return NextResponse.json({ error: 'key and display_name required' }, { status: 400 })

  const svc = createServiceClient()
  const { data: exists } = await svc.from('roles').select('key').eq('key', k).maybeSingle()
  if (exists) return NextResponse.json({ error: `Role "${k}" already exists` }, { status: 409 })

  const { error } = await svc.from('roles').insert({
    key: k, display_name: String(display_name).trim(), description: description || null, is_system: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'CREATE', entity: 'role', entity_id: k, new_value: display_name,
  })
  return NextResponse.json({ ok: true, key: k })
}

// ── PATCH /api/roles — edit display/description, archive/restore ──────────────
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role || !TOP.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const key = String(body.key ?? '')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.display_name !== undefined) patch.display_name = String(body.display_name).trim()
  if (body.description !== undefined) patch.description = body.description || null
  if (typeof body.archived === 'boolean') patch.archived = body.archived
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('roles').update(patch).eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'UPDATE', entity: 'role', entity_id: key,
    new_value: JSON.stringify(patch),
  })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/roles?key=… — delete a role type (system_admin only) ──────────
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Only system_admin may delete role types.
  if (user.role !== 'system_admin') return NextResponse.json({ error: 'Only a System Admin can delete roles' }, { status: 403 })

  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  // The system_admin role itself can never be deleted (prevents lock-out).
  if (key === 'system_admin') return NextResponse.json({ error: 'The system_admin role cannot be deleted' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('roles').delete().eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: user.email, action: 'DELETE', entity: 'role', entity_id: key,
  })
  return NextResponse.json({ ok: true })
}
