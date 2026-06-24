import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES } from '@/types'

// GET /api/settings — quality app_config key/values (admin only).
export async function GET() {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })
  const svc = createServiceClient()
  const { data, error } = await svc.from('app_config')
    .select('key, value, updated_at').eq('app', 'quality').order('key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data ?? [] })
}

// POST /api/settings — upsert a setting (admin only).
export async function POST(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const { key, value } = await req.json()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('app_config').upsert(
    { app: 'quality', key: String(key), value: value == null ? null : String(value), updated_at: new Date().toISOString() },
    { onConflict: 'app,key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'app_config', entity_id: String(key), new_value: value == null ? null : String(value),
  })
  return NextResponse.json({ ok: true })
}
