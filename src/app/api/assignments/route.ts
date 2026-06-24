import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff, canEdit } from '@/lib/auth'
import { normEmail } from '@/lib/utils'
import { toYMD } from '@/lib/dates'

// GET /api/assignments?week=YYYY-MM-DD — this-week QA→group assignment, group
// rosters with weekly progress, the rotation pool, and unassigned agents.
// POST /api/assignments {action,…} — manage groups / members / pool / overrides.
export const maxDuration = 60
// Timezone for the weekly (Sunday→Saturday) rotation boundaries. Shares DIGEST_TZ
// with the daily digest so all scheduling stays in one configured timezone.
const TZ = process.env.DIGEST_TZ || 'UTC'

// The Sunday (in TZ calendar) of the week containing `d`, as YYYY-MM-DD.
function weekSunday(d: Date): string {
  const c = new Date(d.toLocaleString('en-US', { timeZone: TZ }))
  c.setDate(c.getDate() - c.getDay()) // getDay: 0=Sun → back to Sunday
  return toYMD(c)
}
// UTC instant of local (DIGEST_TZ) 00:00 on the given calendar date (DST-aware).
function tzMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12))
  const offsetMs = new Date(probe.toLocaleString('en-US', { timeZone: TZ })).getTime()
    - new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs)
}
const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(...a.split('-').map((n, i) => i === 1 ? +n - 1 : +n) as [number, number, number])
    - Date.UTC(...b.split('-').map((n, i) => i === 1 ? +n - 1 : +n) as [number, number, number])) / 86400000)

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  const weekParam = req.nextUrl.searchParams.get('week')
  const weekStart = weekSunday(weekParam ? new Date(weekParam + 'T12:00:00Z') : new Date())

  // rotation anchor (a Sunday)
  const { data: cfg } = await svc.from('app_config').select('value').eq('app', 'quality').eq('key', 'rotation_anchor').maybeSingle()
  const anchor = (cfg?.value as string) || '2026-01-04'
  const weekIndex = Math.floor(daysBetween(weekStart, anchor) / 7)

  const [{ data: groupsRaw }, { data: poolRaw }, { data: memRaw }, { data: activeAgents }, { data: overrides }] = await Promise.all([
    svc.from('qa_groups').select('id, name, sort_order, active').eq('active', true).order('sort_order'),
    svc.from('qa_rotation_pool').select('qa_email, sort_order').eq('active', true).order('sort_order'),
    svc.from('qa_group_members').select('agent_email, group_id, agents!inner(active)').eq('agents.active', true),
    svc.from('agents').select('email').eq('active', true),
    svc.from('qa_rotation_overrides').select('group_id, qa_email').eq('week_start', weekStart),
  ])

  // Agents evaluated this week (UTC Sun→Sat) → "done". Keyed on eval_date (the
  // QA evaluation date), NOT created_at — the historical rows were bulk-imported
  // so their created_at all falls in the import week and would mark everyone done.
  const fromIso = tzMidnightUtc(weekStart).toISOString()
  const toD = new Date(tzMidnightUtc(weekStart).getTime() + 7 * 86400000)
  const done = new Set<string>()
  for (let off = 0; ; off += 1000) {
    const { data } = await svc.schema('qa').from('qa_evaluations')
      .select('agent_email').is('deleted_at', null).gte('eval_date', fromIso).lt('eval_date', toD.toISOString())
      .range(off, off + 999)
    if (!data?.length) break
    for (const e of data) done.add((e.agent_email as string).toLowerCase())
    if (data.length < 1000) break
  }

  const membersByGroup = new Map<string, string[]>()
  const assigned = new Set<string>()
  for (const m of memRaw ?? []) {
    const arr = membersByGroup.get(m.group_id as string) ?? []
    arr.push((m.agent_email as string).toLowerCase()); membersByGroup.set(m.group_id as string, arr)
    assigned.add((m.agent_email as string).toLowerCase())
  }

  const pool = (poolRaw ?? []).map(p => ({ qa_email: p.qa_email as string, sort_order: p.sort_order as number }))
  const ovMap = new Map<string, string>(); for (const o of overrides ?? []) ovMap.set(o.group_id as string, o.qa_email as string)
  const m = pool.length

  const groups = (groupsRaw ?? []).map((g, i) => {
    const members = (membersByGroup.get(g.id as string) ?? []).sort()
      .map(email => ({ email, done: done.has(email) }))
    const autoQa = m ? pool[(((i + weekIndex) % m) + m) % m].qa_email : null
    return {
      id: g.id as string, name: g.name as string, sort_order: g.sort_order as number, active: g.active as boolean,
      members, total: members.length, done: members.filter(x => x.done).length,
      qa_email: ovMap.get(g.id as string) ?? autoQa,
      source: ovMap.has(g.id as string) ? 'override' as const : 'auto' as const,
    }
  })

  const unassigned = (activeAgents ?? []).map(a => (a.email as string).toLowerCase()).filter(e => !assigned.has(e)).sort()

  return NextResponse.json({
    weekStart, weekIndex,
    groups: groups.map(({ qa_email, source, ...g }) => ({ ...g })),
    assignment: groups.map(g => ({ group_id: g.id, qa_email: g.qa_email, source: g.source })),
    pool, unassigned,
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  const b = await req.json()
  const action = b.action as string
  const audit = (entity: string, entity_id: string, val?: string) =>
    svc.from('audit_log').insert({ app: 'quality', actor_email: user.email, action: 'ASSIGN', entity, entity_id, new_value: val ?? null })

  try {
    switch (action) {
      case 'create_group': {
        if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
        const { data: maxRow } = await svc.from('qa_groups').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
        const { error } = await svc.from('qa_groups').insert({ name: b.name.trim(), sort_order: (maxRow?.sort_order ?? 0) + 1 })
        if (error) throw error; await audit('qa_group', b.name.trim(), 'create'); break
      }
      case 'rename_group': {
        const { error } = await svc.from('qa_groups').update({ name: String(b.name).trim() }).eq('id', b.id)
        if (error) throw error; await audit('qa_group', b.id, 'rename'); break
      }
      case 'archive_group': {
        const { error } = await svc.from('qa_groups').update({ active: !!b.active }).eq('id', b.id)
        if (error) throw error; await audit('qa_group', b.id, b.active ? 'restore' : 'archive'); break
      }
      case 'reorder_groups': {
        const ids = b.ids as string[]
        for (let i = 0; i < ids.length; i++) await svc.from('qa_groups').update({ sort_order: i + 1 }).eq('id', ids[i])
        await audit('qa_group', 'reorder'); break
      }
      case 'set_member': {
        const email = normEmail(b.agent_email)
        if (b.group_id) {
          const { error } = await svc.from('qa_group_members').upsert({ agent_email: email, group_id: b.group_id, updated_at: new Date().toISOString() }, { onConflict: 'agent_email' })
          if (error) throw error
        } else {
          const { error } = await svc.from('qa_group_members').delete().eq('agent_email', email)
          if (error) throw error
        }
        await audit('qa_group_member', email, b.group_id ? 'set' : 'unset'); break
      }
      case 'bulk_set_members': {
        const emails = (b.agent_emails as string[]).map(normEmail)
        const rows = emails.map(agent_email => ({ agent_email, group_id: b.group_id, updated_at: new Date().toISOString() }))
        const { error } = await svc.from('qa_group_members').upsert(rows, { onConflict: 'agent_email' })
        if (error) throw error; await audit('qa_group_member', `${emails.length} agents`, 'bulk'); break
      }
      case 'set_pool': {
        const emails = (b.qa_emails as string[]).map(normEmail)
        await svc.from('qa_rotation_pool').delete().neq('qa_email', '___none___')
        if (emails.length) {
          const { error } = await svc.from('qa_rotation_pool').insert(emails.map((qa_email, i) => ({ qa_email, sort_order: i + 1, active: true })))
          if (error) throw error
        }
        await audit('qa_rotation_pool', `${emails.length} QAs`, 'set'); break
      }
      case 'set_override': {
        const week_start = b.week_start as string
        if (b.qa_email) {
          const { error } = await svc.from('qa_rotation_overrides').upsert(
            { week_start, group_id: b.group_id, qa_email: normEmail(b.qa_email), updated_by: user.email, updated_at: new Date().toISOString() },
            { onConflict: 'week_start, group_id' })
          if (error) throw error
        } else {
          const { error } = await svc.from('qa_rotation_overrides').delete().eq('week_start', week_start).eq('group_id', b.group_id)
          if (error) throw error
        }
        await audit('qa_rotation_override', `${week_start}:${b.group_id}`, b.qa_email ? 'set' : 'reset'); break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
