import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES } from '@/types'
import { normEmail } from '@/lib/utils'

// Team leads are stored in public.teams — one row per lead, with `name` set to
// the lead's email so the unique constraint enforces one team per lead.
interface TlRow { id: string; email: string; archived: boolean }

function mapTeam(t: { id: string; team_lead_email: string | null; name: string; archived: boolean }): TlRow {
  return { id: t.id, email: t.team_lead_email ?? t.name, archived: t.archived }
}

// ── GET /api/team-leads — leads (add ?all=1 to include archived) ──────────────
export async function GET(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const svc = createServiceClient()
  const all = req.nextUrl.searchParams.get('all') === '1'

  let q = svc.from('teams')
    .select('id, name, team_lead_email, archived')
    .order('team_lead_email')
  if (!all) q = q.eq('archived', false)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(mapTeam))
}

// ── POST /api/team-leads — register a new team lead ──────────────────────────
export async function POST(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const email = normEmail((await req.json()).email)
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const svc = createServiceClient()

  // Already present (by name or lead email)? Treat as success / un-archive.
  const { data: existing } = await svc.from('teams')
    .select('id').or(`name.eq.${email},team_lead_email.eq.${email}`).maybeSingle()
  if (existing) {
    await svc.from('teams').update({ archived: false }).eq('id', existing.id)
    return NextResponse.json({ ok: true })
  }

  const { error } = await svc.from('teams')
    .insert({ name: email, team_lead_email: email, archived: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'CREATE',
    entity: 'team_lead', entity_id: email, new_value: email,
  })
  return NextResponse.json({ ok: true })
}

// ── PATCH /api/team-leads — archive / restore a team lead ────────────────────
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const body = await req.json()
  if (!body.id || typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: 'id and archived required' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc.from('teams').update({ archived: body.archived }).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'team_lead', entity_id: body.id, field: 'archived', new_value: String(body.archived),
  })
  return NextResponse.json({ ok: true })
}
