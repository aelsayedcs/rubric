import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES } from '@/types'
import { normEmail } from '@/lib/utils'

// Shape returned to the client. Agents are keyed by email (the table PK);
// `archived` mirrors the stored `active` flag so the UI matches the DSAT tree.
interface AgentRow {
  email: string
  full_name: string | null
  team_lead_email: string
  active: boolean
  archived: boolean
  created_at: string
}

function mapAgent(a: {
  email: string; full_name: string | null; team_lead_email: string | null; active: boolean; created_at: string
}): AgentRow {
  return {
    email: a.email,
    full_name: a.full_name,
    team_lead_email: a.team_lead_email ?? '',
    active: a.active,
    archived: !a.active,
    created_at: a.created_at,
  }
}

// ── GET /api/team — agent directory (add ?all=1 to include archived) ──────────
export async function GET(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const svc = createServiceClient()
  const all = req.nextUrl.searchParams.get('all') === '1'

  let q = svc.from('agents')
    .select('email, full_name, team_lead_email, active, created_at')
    .order('email')
  if (!all) q = q.eq('active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(mapAgent))
}

// ── POST /api/team — add (or restore) an agent ───────────────────────────────
export async function POST(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const body = await req.json()
  const email = normEmail(body.agent_email)
  const tl    = normEmail(body.team_lead_email)
  if (!email || !tl) return NextResponse.json({ error: 'agent_email and team_lead_email required' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('agents').upsert(
    { email, team_lead_email: tl, active: true },
    { onConflict: 'email' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'agent', entity_id: email, field: 'team_lead_email', new_value: tl,
  })
  return NextResponse.json({ ok: true })
}

// ── PATCH /api/team — archive/restore or reassign an agent ────────────────────
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const body = await req.json()
  // The client may still send `id`; for QA agents the id IS the email.
  const email = normEmail(body.email ?? body.id)
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const patch: { active?: boolean; team_lead_email?: string } = {}
  if (typeof body.archived === 'boolean') patch.active = !body.archived
  if (body.team_lead_email !== undefined) patch.team_lead_email = normEmail(body.team_lead_email)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('agents').update(patch).eq('email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('audit_log').insert({
    app: 'quality', actor_email: guard.user.email, action: 'UPDATE',
    entity: 'agent', entity_id: email,
    field: patch.active !== undefined ? 'active' : 'team_lead_email',
    new_value: patch.active !== undefined ? String(patch.active) : (patch.team_lead_email ?? ''),
  })
  return NextResponse.json({ ok: true })
}
