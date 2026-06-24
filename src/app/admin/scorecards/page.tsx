'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loading } from '@/components/Loading'
import { cn } from '@/lib/utils'

const CH = ['Chat', 'Call', 'Tickets'] as const
interface Crit { id: string; attribute_id: string; label: string; weight: number; is_critical: boolean; sort_order: number; channels: string[]; allow_na: boolean; archived: boolean }
interface Attr { id: string; name: string; sort_order: number; channels: string[]; archived: boolean; criteria: Crit[] }
interface Tree { id: string; name: string; version: number; active: boolean; channels: string[]; attributes: Attr[] }
interface ScRow { id: string; name: string; version: number; active: boolean; channels: string[] }

function Channels({ value, onChange, disabled }: { value: string[]; onChange: (c: string[]) => void; disabled?: boolean }) {
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter(x => x !== c) : [...value, c])
  return (
    <span className="inline-flex gap-1">
      {CH.map(c => (
        <button key={c} type="button" disabled={disabled} onClick={() => toggle(c)}
          className={cn('text-[10px] px-1.5 py-0.5 rounded border', value.includes(c) ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-white/5 text-slate-500 border-white/10', disabled && 'opacity-50')}>
          {c}
        </button>
      ))}
    </span>
  )
}

export default function ScorecardsPage() {
  const [scorecards, setScorecards] = useState<ScRow[]>([])
  const [selected, setSelected] = useState<Tree | null>(null)
  const [selId, setSelId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [newSc, setNewSc] = useState('')
  const [newAttr, setNewAttr] = useState('')

  const load = useCallback((id?: string) => {
    setLoading(true)
    fetch('/api/scorecards' + (id ? `?id=${id}` : '')).then(r => r.json()).then(d => {
      setScorecards(d.scorecards ?? []); setSelected(d.selected ?? null); if (d.selected) setSelId(d.selected.id); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function post(action: string, payload: object = {}) {
    setBusy(true); setMsg('')
    const res = await fetch('/api/scorecards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error ?? 'Failed'); return null }
    load(d.id ?? selId)
    return d
  }

  if (loading && !selected) return <div className="page"><Loading /></div>

  const editable = !!selected && !selected.active
  const attrs = (selected?.attributes ?? [])

  return (
    <div className="page max-w-4xl">
      <div className="mb-4"><h1 className="section-title">Scorecards</h1><p className="section-subtitle">Build & version scorecards · attributes, sub-attributes & channel scope</p></div>
      {msg && <div className="glass p-2 mb-4 text-xs text-red-400">{msg}</div>}

      {/* Picker + version actions */}
      <div className="glass p-3 mb-4 flex flex-wrap items-center gap-2">
        <select value={selId} onChange={e => { setSelId(e.target.value); load(e.target.value) }} className="filter-select text-sm">
          {scorecards.map(s => <option key={s.id} value={s.id}>{s.name} · v{s.version} {s.active ? '(active)' : '(draft)'}</option>)}
        </select>
        {selected && (selected.active
          ? <button disabled={busy} onClick={() => post('create_draft', { name: selected.name })} className="btn btn-secondary text-xs">Create draft to edit</button>
          : <>
              <button disabled={busy} onClick={() => post('publish', { scorecard_id: selected.id })} className="btn btn-primary text-xs">Publish</button>
              <button disabled={busy} onClick={() => { if (confirm('Discard this draft?')) post('discard_draft', { scorecard_id: selected.id }) }} className="btn btn-ghost text-xs text-red-400">Discard draft</button>
            </>)}
        {selected && <span className={cn('text-[10px] px-2 py-0.5 rounded-full ml-auto', selected.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>{selected.active ? 'Published' : 'Draft'}</span>}
      </div>

      {/* New scorecard */}
      <div className="glass p-3 mb-4 flex flex-wrap items-center gap-2">
        <input value={newSc} onChange={e => setNewSc(e.target.value)} placeholder="New scorecard name" className="filter-select text-xs" />
        <button disabled={busy || !newSc.trim()} onClick={() => { post('create_scorecard', { name: newSc }); setNewSc('') }} className="btn btn-secondary text-xs disabled:opacity-40">+ New scorecard (draft)</button>
      </div>

      {selected && (
        <>
          <div className="glass p-3 mb-4 flex items-center gap-2 text-sm">
            <span className="text-slate-400">Scorecard channels:</span>
            <Channels value={selected.channels} disabled={!editable} onChange={c => post('set_scorecard_channels', { scorecard_id: selected.id, channels: c })} />
            {!editable && <span className="text-[11px] text-slate-500 ml-auto">Published versions are read-only — create a draft to edit.</span>}
          </div>

          {/* Attributes */}
          {attrs.filter(a => !a.archived).map((a, ai) => (
            <div key={a.id} className="glass p-4 mb-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <input defaultValue={a.name} disabled={!editable} onBlur={e => e.target.value.trim() && e.target.value !== a.name && post('edit_attribute', { id: a.id, name: e.target.value })}
                  className="font-bold text-white bg-transparent border-b border-white/10 focus:border-sky-500 outline-none px-1" />
                <Channels value={a.channels} disabled={!editable} onChange={c => post('set_attribute_channels', { id: a.id, channels: c })} />
                {editable && <span className="ml-auto flex gap-1">
                  <button disabled={ai === 0} onClick={() => post('reorder_attributes', { ids: swap(attrs.filter(x => !x.archived).map(x => x.id), ai, ai - 1) })} className="btn btn-ghost text-xs">↑</button>
                  <button disabled={ai === attrs.filter(x => !x.archived).length - 1} onClick={() => post('reorder_attributes', { ids: swap(attrs.filter(x => !x.archived).map(x => x.id), ai, ai + 1) })} className="btn btn-ghost text-xs">↓</button>
                  <button onClick={() => post('archive_attribute', { id: a.id, archived: true })} className="btn btn-ghost text-xs text-red-400">archive</button>
                </span>}
              </div>
              {/* Criteria */}
              <div className="space-y-1.5 pl-2">
                {a.criteria.filter(c => !c.archived).map(c => (
                  <div key={c.id} className="flex items-center gap-2 flex-wrap text-sm py-1 border-b border-white/5">
                    <input defaultValue={c.label} disabled={!editable} onBlur={e => e.target.value.trim() && e.target.value !== c.label && post('edit_criterion', { id: c.id, label: e.target.value, weight: c.weight, is_critical: c.is_critical, allow_na: c.allow_na })}
                      className="flex-1 min-w-[200px] bg-transparent text-slate-200 border-b border-transparent focus:border-sky-500 outline-none px-1" />
                    <label className="text-[11px] text-slate-500 flex items-center gap-1">wt
                      <input type="number" min={0} defaultValue={c.weight} disabled={!editable || c.is_critical} onBlur={e => Number(e.target.value) !== c.weight && post('edit_criterion', { id: c.id, label: c.label, weight: Number(e.target.value), is_critical: c.is_critical, allow_na: c.allow_na })}
                        className="w-12 bg-white/5 rounded px-1 text-slate-300 disabled:opacity-40" /></label>
                    <label className="text-[11px] text-red-400 flex items-center gap-1">
                      <input type="checkbox" checked={c.is_critical} disabled={!editable} onChange={e => post('edit_criterion', { id: c.id, label: c.label, weight: c.weight, is_critical: e.target.checked, allow_na: c.allow_na })} /> critical</label>
                    <label className="text-[11px] text-slate-400 flex items-center gap-1">
                      <input type="checkbox" checked={c.allow_na} disabled={!editable} onChange={e => post('edit_criterion', { id: c.id, label: c.label, weight: c.weight, is_critical: c.is_critical, allow_na: e.target.checked })} /> N/A</label>
                    <Channels value={c.channels} disabled={!editable} onChange={ch => post('set_criterion_channels', { id: c.id, channels: ch })} />
                    {editable && <button onClick={() => post('archive_criterion', { id: c.id, archived: true })} className="text-red-400 text-xs">×</button>}
                  </div>
                ))}
                {editable && <AddCriterion onAdd={(label) => post('add_criterion', { attribute_id: a.id, label })} />}
              </div>
            </div>
          ))}

          {editable && (
            <div className="glass p-3 flex gap-2">
              <input value={newAttr} onChange={e => setNewAttr(e.target.value)} placeholder="New attribute name" className="filter-select text-xs" />
              <button disabled={busy || !newAttr.trim()} onClick={() => { post('add_attribute', { scorecard_id: selected.id, name: newAttr }); setNewAttr('') }} className="btn btn-secondary text-xs disabled:opacity-40">+ Add attribute</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AddCriterion({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2 pt-1">
      <input value={v} onChange={e => setV(e.target.value)} placeholder="+ add sub-attribute…" className="flex-1 text-xs bg-white/5 rounded px-2 py-1 text-slate-300 outline-none" />
      <button disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV('') }} className="btn btn-ghost text-xs text-sky-400 disabled:opacity-40">Add</button>
    </div>
  )
}

function swap(ids: string[], i: number, j: number) { const a = [...ids]; [a[i], a[j]] = [a[j], a[i]]; return a }
