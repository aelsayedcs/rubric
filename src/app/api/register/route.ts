import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normEmail } from '@/lib/utils'
import { getAppConfig, isAllowedEmail } from '@/lib/app-config'

// POST /api/register — public self-signup (email + password).
// Creates an auth user (auto-confirmed) and grants the baseline 'agent' role for
// the quality app. Admins elevate roles via /admin/access. The allowed email
// domain is configured via NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN (blank = any domain).
export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  const e = normEmail(email)

  const { allowedEmailDomain } = await getAppConfig()
  if (!isAllowedEmail(e, allowedEmailDomain)) {
    return NextResponse.json(
      { error: `Use your @${allowedEmailDomain} email address.` },
      { status: 400 },
    )
  }
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const svc = createServiceClient()

  // Create the auth user (email auto-confirmed so they can sign in immediately).
  const { data: created, error } = await svc.auth.admin.createUser({
    email: e,
    password: String(password),
    email_confirm: true,
  })
  if (error || !created?.user) {
    const msg = /already.*registered|exists/i.test(error?.message ?? '')
      ? 'An account with this email already exists. Try signing in or resetting your password.'
      : (error?.message ?? 'Could not create the account.')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Profile + baseline access grant.
  await svc.from('profiles').upsert(
    { id: created.user.id, email: e },
    { onConflict: 'email', ignoreDuplicates: true },
  )
  await svc.from('app_access').upsert(
    { email: e, app: 'quality', role: 'agent', archived: false, granted_by: 'self-signup' },
    { onConflict: 'email,app' },
  )

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: e, action: 'CREATE', entity: 'app_access', entity_id: e, new_value: 'agent (signup)',
  })

  return NextResponse.json({ ok: true })
}
