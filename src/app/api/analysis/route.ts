import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff } from '@/lib/auth'
import { normEmail } from '@/lib/utils'

// GET /api/analysis — one Postgres round-trip via qa.analysis(); all aggregation
// happens in the DB (see migration 010) instead of pulling 20k rows into Node.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role) && user.role !== 'team_lead') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  let tl = sp.get('team_lead')
  // Team leads are scoped to their own team regardless of the requested filter.
  if (user.role === 'team_lead' && !isQaStaff(user.role)) tl = user.email

  const svc = createServiceClient()
  const { data, error } = await svc.schema('qa').rpc('analysis', {
    p_from:    sp.get('date_from') || null,
    p_to:      sp.get('date_to') || null,
    p_channel: sp.get('channel') || null,
    p_tl:      tl ? normEmail(tl) : null,
    p_agent:   sp.get('agent') ? normEmail(sp.get('agent')!) : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
