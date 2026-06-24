import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

// Returns the active scorecard + its criteria, plus agents & team leads —
// everything the Evaluate form and the filter bars need.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()

  // All ACTIVE scorecards with their attributes + criteria + channel scopes. The
  // evaluate form resolves which one to use from the selected channel.
  const { data: scsRaw } = await svc.schema('qa').from('qa_scorecards')
    .select('id, name, version, channels').eq('active', true).order('name')
  const scs = scsRaw ?? []
  const ids = scs.map(s => s.id as string)
  const ALL = ['Chat', 'Call', 'Tickets']
  let scorecards: unknown[] = []
  if (ids.length) {
    const [{ data: attrs }, { data: crit }] = await Promise.all([
      svc.schema('qa').from('qa_attributes').select('id, scorecard_id, name, sort_order, channels').in('scorecard_id', ids).eq('archived', false),
      svc.schema('qa').from('qa_criteria').select('id, scorecard_id, attribute_id, label, weight, is_critical, sort_order, channels, allow_na').in('scorecard_id', ids).eq('archived', false),
    ])
    const attrById = new Map((attrs ?? []).map(a => [a.id as string, a]))
    scorecards = scs.map(s => ({
      id: s.id, name: s.name, version: s.version, channels: (s.channels as string[]) ?? ALL,
      criteria: (crit ?? []).filter(c => c.scorecard_id === s.id).map(c => {
        const a = c.attribute_id ? attrById.get(c.attribute_id as string) : null
        const attrCh = (a?.channels as string[]) ?? ALL
        const critCh = (c.channels as string[]) ?? ALL
        return {
          id: c.id, section: (a?.name as string) ?? 'General', attr_sort: (a?.sort_order as number) ?? 0,
          label: c.label, weight: c.weight, is_critical: c.is_critical, sort_order: c.sort_order, allow_na: c.allow_na,
          channels: ALL.filter(ch => attrCh.includes(ch) && critCh.includes(ch)), // effective
        }
      }).sort((x, y) => x.attr_sort - y.attr_sort || x.sort_order - y.sort_order),
    }))
  }
  // Back-compat default (all-channel scorecard or first), for any legacy consumer.
  const def = scs.find(s => ((s.channels as string[]) ?? ALL).length === 3) ?? scs[0]
  const scorecard = def ? { id: def.id, name: def.name, version: def.version } : null
  const criteria = (scorecards.find((s: { id: string }) => s.id === def?.id) as { criteria?: unknown[] } | undefined)?.criteria ?? []

  const { data: agents } = await svc
    .from('agents')
    .select('email, full_name, team_lead_email, active')
    .eq('active', true)
    .order('email')

  // Distinct team leads (from agents mapping)
  const teamLeads = Array.from(
    new Set((agents ?? []).map(a => a.team_lead_email).filter(Boolean))
  ).sort()

  // Coaching threshold from config
  const { data: cfg } = await svc
    .from('app_config')
    .select('value')
    .eq('app', 'quality').eq('key', 'coaching_threshold')
    .maybeSingle()

  return NextResponse.json({
    role: user.role,
    email: user.email,
    scorecards,
    scorecard: scorecard ?? null,
    criteria,
    agents: agents ?? [],
    teamLeads,
    coachingThreshold: Number(cfg?.value ?? 85),
  })
}
