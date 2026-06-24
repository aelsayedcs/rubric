import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff, canEdit } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// GET /api/targets — list all configured targets (QA staff + team leads).
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role) && user.role !== 'team_lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const svc = createServiceClient()
  const { data } = await svc.from('qa_targets')
    .select('id, scope_type, scope_value, avg_score, max_critical_rate, min_coached_pct, updated_at')
    .order('scope_type')
  return NextResponse.json({ targets: data ?? [] })
}

const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))

// PUT /api/targets — upsert a target for a scope (QA evaluators + system_admin).
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const scope_type = b.scope_type as string
  if (!['global', 'team_lead', 'agent'].includes(scope_type)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }
  const scope_value = scope_type === 'global' ? null : (b.scope_value ? normEmail(b.scope_value) : null)
  if (scope_type !== 'global' && !scope_value) {
    return NextResponse.json({ error: 'scope_value (email) required' }, { status: 400 })
  }

  const svc = createServiceClient()
  const row = {
    scope_type, scope_value,
    avg_score: num(b.avg_score), max_critical_rate: num(b.max_critical_rate), min_coached_pct: num(b.min_coached_pct),
    updated_by: user.email, updated_at: new Date().toISOString(),
  }
  // Delete-then-insert for this scope (the unique index is on coalesce(scope_value,''),
  // which PostgREST upsert onConflict can't target directly).
  let del = svc.from('qa_targets').delete().eq('scope_type', scope_type)
  del = scope_value === null ? del.is('scope_value', null) : del.eq('scope_value', scope_value)
  await del
  const { error: insErr } = await svc.from('qa_targets').insert(row)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/targets?scope_type=&scope_value= — remove a target.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const scope_type = sp.get('scope_type'); const scope_value = sp.get('scope_value')
  if (scope_type === 'global') return NextResponse.json({ error: 'Cannot delete the global target' }, { status: 400 })
  const svc = createServiceClient()
  let q = svc.from('qa_targets').delete().eq('scope_type', scope_type ?? '')
  q = scope_value ? q.eq('scope_value', normEmail(scope_value)) : q
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
