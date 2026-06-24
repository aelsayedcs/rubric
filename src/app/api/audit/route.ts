import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ADMIN_ROLES } from '@/types'

// GET /api/audit — browse the quality audit_log (admin only).
export async function GET(req: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES)
  if ('status' in guard) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status })

  const svc = createServiceClient()
  const sp = req.nextUrl.searchParams

  let q = svc.from('audit_log').select('*').eq('app', 'quality').order('ts', { ascending: false })
  const action = sp.get('action'); if (action) q = q.eq('action', action)
  const entity = sp.get('entity'); if (entity) q = q.eq('entity', entity)
  const actor = sp.get('actor'); if (actor) q = q.ilike('actor_email', `%${actor}%`)
  const search = sp.get('search'); if (search) q = q.ilike('entity_id', `%${search}%`)

  const limit = Math.min(Number(sp.get('limit') ?? 100), 200)
  const offset = Number(sp.get('offset') ?? 0)
  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}
