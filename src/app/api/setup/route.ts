import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normEmail } from '@/lib/utils'
import { CONFIG_KEYS } from '@/lib/app-config'

// ─────────────────────────────────────────────────────────────
// /api/setup — powers the first-run setup wizard (/setup).
// GET  → { connected, dbReady, hasAdmin }
// POST → { action: 'save_branding' | 'create_admin' }
// SECURITY: mutations are allowed ONLY during first-run (no admin exists yet).
// Once a system admin exists, the wizard is locked and POST returns 403 —
// further changes go through the normal admin screens (/admin/settings, /admin/access).
// ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['system_owner', 'super_admin', 'system_admin', 'admin']

async function status() {
  const out = { connected: false, dbReady: false, hasAdmin: false }
  // "connected" = the Supabase env keys are present and the client constructs.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out
  out.connected = true
  try {
    const svc = createServiceClient()
    // dbReady = the core schema exists (app_access table is queryable).
    const { error } = await svc.from('app_access').select('email').limit(1)
    if (!error) {
      out.dbReady = true
      const { data } = await svc.from('app_access')
        .select('email').eq('app', 'quality').in('role', ADMIN_ROLES).limit(1)
      out.hasAdmin = (data?.length ?? 0) > 0
    }
  } catch { /* dbReady stays false */ }
  return out
}

export async function GET() {
  return NextResponse.json(await status())
}

export async function POST(req: NextRequest) {
  const st = await status()
  if (!st.connected) return NextResponse.json({ error: 'Supabase is not configured. Set the environment variables first.' }, { status: 400 })
  if (!st.dbReady) return NextResponse.json({ error: 'Database is not initialized yet. Run supabase/setup.sql first.' }, { status: 400 })
  // First-run only: once an admin exists the wizard is locked.
  if (st.hasAdmin) return NextResponse.json({ error: 'Setup is already complete. Use the admin screens to make changes.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const action = body.action as string
  const svc = createServiceClient()

  if (action === 'save_branding') {
    const rows = [
      [CONFIG_KEYS.companyName, body.companyName],
      [CONFIG_KEYS.allowedEmailDomain, body.allowedEmailDomain],
      [CONFIG_KEYS.ticketUrlTemplate, body.ticketUrlTemplate],
      [CONFIG_KEYS.digestTz, body.digestTz],
    ].filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({ app: 'quality', key, value: value == null ? null : String(value), updated_at: new Date().toISOString() }))
    if (rows.length) {
      const { error } = await svc.from('app_config').upsert(rows, { onConflict: 'app,key' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'create_admin') {
    const email = normEmail(body.email)
    const password = String(body.password ?? '')
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

    const { data: created, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !created?.user) {
      const msg = /already.*registered|exists/i.test(error?.message ?? '')
        ? 'An account with this email already exists — sign in instead.'
        : (error?.message ?? 'Could not create the account.')
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    await svc.from('profiles').upsert({ id: created.user.id, email }, { onConflict: 'email', ignoreDuplicates: true })
    await svc.from('app_access').upsert(
      { email, app: 'quality', role: 'super_admin', archived: false, granted_by: 'setup-wizard' },
      { onConflict: 'email,app' },
    )
    await svc.from('audit_log').insert({
      app: 'quality', actor_email: email, action: 'CREATE', entity: 'app_access', entity_id: email, new_value: 'super_admin (setup)',
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
