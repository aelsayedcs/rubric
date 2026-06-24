import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isQaStaff, canEdit } from '@/lib/auth'

// GET /api/scorecards[?id=] — scorecard picker list + the selected/active tree.
// POST /api/scorecards {action,…} — manage scorecards/attributes/criteria.
// Channels are text[] over {Chat,Call,Tickets}. Structural edits only touch DRAFT
// (active=false) versions; published versions are immutable (clone → edit → publish).
export const maxDuration = 60
const CH = ['Chat', 'Call', 'Tickets']
const sanCh = (v: unknown): string[] => {
  const a = Array.isArray(v) ? v.filter(x => CH.includes(x)) : []
  return a.length ? [...new Set(a)] : [...CH]
}
type SC = ReturnType<typeof createServiceClient>

async function tree(svc: SC, id: string) {
  const { data: sc } = await svc.schema('qa').from('qa_scorecards')
    .select('id, name, version, active, channels, published_at').eq('id', id).maybeSingle()
  if (!sc) return null
  const { data: attrs } = await svc.schema('qa').from('qa_attributes')
    .select('id, name, sort_order, channels, archived').eq('scorecard_id', id).order('sort_order')
  const { data: crit } = await svc.schema('qa').from('qa_criteria')
    .select('id, attribute_id, label, weight, is_critical, sort_order, channels, allow_na, archived')
    .eq('scorecard_id', id).order('sort_order')
  const byAttr = new Map<string, unknown[]>()
  for (const c of crit ?? []) { const k = c.attribute_id as string; (byAttr.get(k) ?? byAttr.set(k, []).get(k)!).push(c) }
  return { ...sc, attributes: (attrs ?? []).map(a => ({ ...a, criteria: byAttr.get(a.id as string) ?? [] })) }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isQaStaff(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  const { data: list } = await svc.schema('qa').from('qa_scorecards')
    .select('id, name, version, active, channels, published_at').order('name').order('version', { ascending: false })

  let id = req.nextUrl.searchParams.get('id')
  if (!id) id = (list ?? []).find(s => s.active)?.id as string ?? (list ?? [])[0]?.id ?? null
  const selected = id ? await tree(svc, id) : null
  return NextResponse.json({ scorecards: list ?? [], selected })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canEdit(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  const b = await req.json()
  const action = b.action as string
  const audit = (entity_id: string, val: string) =>
    svc.from('audit_log').insert({ app: 'quality', actor_email: user.email, action: 'SCORECARD', entity: 'qa_scorecard', entity_id, new_value: val })

  // Reject structural edits on a published (active) version.
  async function requireDraft(scorecardId: string) {
    const { data } = await svc.schema('qa').from('qa_scorecards').select('active').eq('id', scorecardId).maybeSingle()
    if (data?.active) throw new Error('This version is published — create a draft to edit it.')
  }
  async function scorecardOfAttribute(attribute_id: string) {
    const { data } = await svc.schema('qa').from('qa_attributes').select('scorecard_id, name').eq('id', attribute_id).maybeSingle()
    return data
  }

  try {
    switch (action) {
      case 'create_scorecard': {
        if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
        const { data, error } = await svc.schema('qa').from('qa_scorecards')
          .insert({ name: b.name.trim(), version: 1, channels: sanCh(b.channels), active: false, created_by: user.email })
          .select('id').single()
        if (error) throw error; await audit(data.id, 'create'); return NextResponse.json({ ok: true, id: data.id })
      }
      case 'create_draft': {
        const name = b.name as string
        const { data: rows } = await svc.schema('qa').from('qa_scorecards').select('*').eq('name', name).order('version', { ascending: false })
        if (!rows?.length) return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 })
        if (rows.some(r => !r.active)) return NextResponse.json({ error: 'A draft already exists for this scorecard.' }, { status: 409 })
        const src = rows.find(r => r.active) ?? rows[0]
        const nextV = Math.max(...rows.map(r => r.version as number)) + 1
        const { data: nd, error } = await svc.schema('qa').from('qa_scorecards')
          .insert({ name, version: nextV, channels: src.channels, active: false, created_by: user.email }).select('id').single()
        if (error) throw error
        const { data: attrs } = await svc.schema('qa').from('qa_attributes').select('*').eq('scorecard_id', src.id)
        const idMap = new Map<string, string>()
        for (const a of attrs ?? []) {
          const { data: na } = await svc.schema('qa').from('qa_attributes')
            .insert({ scorecard_id: nd.id, name: a.name, sort_order: a.sort_order, channels: a.channels, archived: a.archived }).select('id').single()
          if (na) idMap.set(a.id as string, na.id as string)
        }
        const { data: crit } = await svc.schema('qa').from('qa_criteria').select('*').eq('scorecard_id', src.id)
        const rowsToInsert = (crit ?? []).map(c => ({
          scorecard_id: nd.id, attribute_id: idMap.get(c.attribute_id as string) ?? null, section: c.section,
          label: c.label, weight: c.weight, is_critical: c.is_critical, sort_order: c.sort_order, channels: c.channels, allow_na: c.allow_na, archived: c.archived,
        }))
        if (rowsToInsert.length) await svc.schema('qa').from('qa_criteria').insert(rowsToInsert)
        await audit(nd.id, `draft v${nextV}`); return NextResponse.json({ ok: true, id: nd.id })
      }
      case 'publish': {
        const { data: sc } = await svc.schema('qa').from('qa_scorecards').select('id, name').eq('id', b.scorecard_id).maybeSingle()
        if (!sc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await svc.schema('qa').from('qa_scorecards').update({ active: false }).eq('name', sc.name).eq('active', true)
        const { error } = await svc.schema('qa').from('qa_scorecards').update({ active: true, published_at: new Date().toISOString() }).eq('id', b.scorecard_id)
        if (error) throw error; await audit(b.scorecard_id, 'publish'); break
      }
      case 'discard_draft': {
        await requireDraft(b.scorecard_id)
        const { error } = await svc.schema('qa').from('qa_scorecards').delete().eq('id', b.scorecard_id).eq('active', false)
        if (error) throw error; await audit(b.scorecard_id, 'discard'); break
      }
      case 'set_scorecard_channels': {
        await requireDraft(b.scorecard_id)
        const { error } = await svc.schema('qa').from('qa_scorecards').update({ channels: sanCh(b.channels) }).eq('id', b.scorecard_id)
        if (error) throw error; break
      }
      case 'add_attribute': {
        await requireDraft(b.scorecard_id)
        const { data: mx } = await svc.schema('qa').from('qa_attributes').select('sort_order').eq('scorecard_id', b.scorecard_id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
        const { error } = await svc.schema('qa').from('qa_attributes').insert({ scorecard_id: b.scorecard_id, name: String(b.name ?? 'New attribute').trim(), sort_order: (mx?.sort_order ?? -1) + 1, channels: sanCh(b.channels) })
        if (error) throw error; break
      }
      case 'edit_attribute': case 'archive_attribute': case 'set_attribute_channels': {
        const sc = await scorecardOfAttribute(b.id); if (!sc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await requireDraft(sc.scorecard_id as string)
        const patch = action === 'edit_attribute' ? { name: String(b.name).trim() }
          : action === 'archive_attribute' ? { archived: !!b.archived } : { channels: sanCh(b.channels) }
        const { error } = await svc.schema('qa').from('qa_attributes').update(patch).eq('id', b.id)
        if (error) throw error; break
      }
      case 'reorder_attributes': {
        const ids = b.ids as string[]
        if (ids.length) { const sc = await scorecardOfAttribute(ids[0]); if (sc) await requireDraft(sc.scorecard_id as string) }
        for (let i = 0; i < ids.length; i++) await svc.schema('qa').from('qa_attributes').update({ sort_order: i }).eq('id', ids[i])
        break
      }
      case 'add_criterion': {
        const sc = await scorecardOfAttribute(b.attribute_id); if (!sc) return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
        await requireDraft(sc.scorecard_id as string)
        const { data: mx } = await svc.schema('qa').from('qa_criteria').select('sort_order').eq('attribute_id', b.attribute_id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
        const { error } = await svc.schema('qa').from('qa_criteria').insert({
          scorecard_id: sc.scorecard_id, attribute_id: b.attribute_id, section: sc.name,
          label: String(b.label ?? 'New criterion').trim(), weight: Number(b.weight ?? 0), is_critical: !!b.is_critical,
          sort_order: (mx?.sort_order ?? -1) + 1, channels: sanCh(b.channels), allow_na: b.allow_na ?? !b.is_critical,
        })
        if (error) throw error; break
      }
      case 'edit_criterion': case 'archive_criterion': case 'set_criterion_channels': {
        const { data: c } = await svc.schema('qa').from('qa_criteria').select('scorecard_id').eq('id', b.id).maybeSingle()
        if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await requireDraft(c.scorecard_id as string)
        const patch = action === 'edit_criterion' ? { label: String(b.label).trim(), weight: Number(b.weight ?? 0), is_critical: !!b.is_critical, allow_na: b.allow_na ?? !b.is_critical }
          : action === 'archive_criterion' ? { archived: !!b.archived } : { channels: sanCh(b.channels) }
        const { error } = await svc.schema('qa').from('qa_criteria').update(patch).eq('id', b.id)
        if (error) throw error; break
      }
      case 'reorder_criteria': {
        const ids = b.ids as string[]
        if (ids.length) { const { data: c } = await svc.schema('qa').from('qa_criteria').select('scorecard_id').eq('id', ids[0]).maybeSingle(); if (c) await requireDraft(c.scorecard_id as string) }
        for (let i = 0; i < ids.length; i++) await svc.schema('qa').from('qa_criteria').update({ sort_order: i }).eq('id', ids[i])
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
