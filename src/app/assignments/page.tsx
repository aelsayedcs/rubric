'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loading } from '@/components/Loading'
import { cn } from '@/lib/utils'

interface Member { email: string; done: boolean }
interface Group { id: string; name: string; sort_order: number; active: boolean; members: Member[]; done: number; total: number }
interface Assignment { group_id: string; qa_email: string | null; source: 'auto' | 'override' }
interface Resp { weekStart: string; weekIndex: number; groups: Group[]; assignment: Assignment[]; pool: { qa_email: string; sort_order: number }[]; unassigned: string[] }

const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10) }
const fmt = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

export default function AssignmentsPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [week, setWeek] = useState<string>('')      // selected week's Sunday (server-normalized)
  const [reqWeek, setReqWeek] = useState<string>('') // what we ask the server for
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newGroup, setNewGroup] = useState('')
  const [newQa, setNewQa] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback((w: string) => {
    setLoading(true)
    fetch('/api/assignments' + (w ? `?week=${w}` : ''))
      .then(r => r.json()).then((d: Resp) => { setData(d); setWeek(d.weekStart); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  useEffect(() => { load(reqWeek) }, [load, reqWeek])

  async function post(action: string, payload: object = {}) {
    setBusy(true); setMsg('')
    const res = await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
    setBusy(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); setMsg(e.error ?? 'Failed'); return }
    load(week)
  }

  if (loading && !data) return <div className="page"><Loading /></div>
  if (!data) return <div className="page"><div className="glass p-10 text-center text-slate-400">Could not load assignments.</div></div>

  const qaOf = (gid: string) => data.assignment.find(a => a.group_id === gid)
  const poolEmails = data.pool.map(p => p.qa_email)
  // All active agents with their current group (for the membership table)
  const agentRows = [
    ...data.groups.flatMap(g => g.members.map(m => ({ email: m.email, group_id: g.id }))),
    ...data.unassigned.map(e => ({ email: e, group_id: '' })),
  ].sort((a, b) => a.email.localeCompare(b.email))
  const toggle = (e: string) => setSelected(s => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n })

  return (
    <div className="page">
      <div className="mb-4">
        <h1 className="section-title">Assignments</h1>
        <p className="section-subtitle">Weekly QA rotation (Sun→Sat) · groups, rosters & progress</p>
      </div>
      {msg && <div className="glass p-2 mb-4 text-xs text-red-400">{msg}</div>}

      {/* Week navigator */}
      <div className="glass p-3 mb-4 flex items-center justify-center gap-4">
        <button onClick={() => setReqWeek(addDays(week, -7))} className="btn btn-ghost text-sm">◀</button>
        <span className="text-sm font-semibold text-white">{fmt(week)} – {fmt(addDays(week, 6))}</span>
        <button onClick={() => setReqWeek(addDays(week, 7))} className="btn btn-ghost text-sm">▶</button>
        <button onClick={() => setReqWeek('')} className="btn btn-ghost text-xs text-sky-400">This week</button>
      </div>

      {/* This week's assignment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {data.groups.map(g => {
          const a = qaOf(g.id)
          const pct = g.total ? Math.round(g.done / g.total * 100) : 0
          return (
            <div key={g.id} className="glass p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-white">{g.name}</span>
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', a?.source === 'override' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300')}>{a?.source ?? 'auto'}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">QA:</span>
                <select value={a?.qa_email ?? ''} onChange={e => post('set_override', { week_start: week, group_id: g.id, qa_email: e.target.value || null })}
                  disabled={busy} className="filter-select text-xs flex-1">
                  <option value="">{poolEmails.length ? '— auto —' : '(add QAs to the pool below)'}</option>
                  {poolEmails.map(q => <option key={q} value={q}>{q.split('@')[0]}</option>)}
                </select>
                {a?.source === 'override' && <button onClick={() => post('set_override', { week_start: week, group_id: g.id, qa_email: null })} className="text-[11px] text-sky-400">reset</button>}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                <span className="text-xs font-semibold text-slate-300">{g.done} / {g.total}</span>
              </div>
              <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="text-[11px] text-sky-400 hover:text-sky-300">{expanded === g.id ? 'hide' : 'show'} agents</button>
              {expanded === g.id && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.members.map(m => (
                    <span key={m.email} className={cn('text-[11px] px-2 py-0.5 rounded-md', m.done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-400')}>
                      {m.done ? '✓ ' : ''}{m.email.split('@')[0]}
                    </span>
                  ))}
                  {g.members.length === 0 && <span className="text-[11px] text-slate-500">No agents.</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Rotation pool */}
      <div className="glass p-4 mb-6">
        <h3 className="text-sm font-bold text-white mb-2">QA rotation pool</h3>
        <p className="text-xs text-slate-500 mb-3">Order matters — QAs rotate across groups by this order each week.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.pool.map((p, i) => (
            <span key={p.qa_email} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white/5 text-slate-200">
              <span className="text-slate-500">{i + 1}.</span> {p.qa_email}
              <button onClick={() => post('set_pool', { qa_emails: poolEmails.filter(e => e !== p.qa_email) })} className="text-red-400 ml-1">×</button>
            </span>
          ))}
          {data.pool.length === 0 && <span className="text-xs text-slate-500">No QAs yet — add the rotating evaluators.</span>}
        </div>
        <div className="flex gap-2">
          <input value={newQa} onChange={e => setNewQa(e.target.value)} placeholder="qa@example.com" className="filter-select text-xs flex-1 max-w-xs" />
          <button disabled={busy || !newQa.includes('@')} onClick={() => { post('set_pool', { qa_emails: [...poolEmails, newQa.trim()] }); setNewQa('') }} className="btn btn-secondary text-xs disabled:opacity-40">Add QA</button>
        </div>
      </div>

      {/* Groups & members */}
      <div className="glass p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white">Groups &amp; members</h3>
          <div className="flex gap-2">
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="New group name" className="filter-select text-xs" />
            <button disabled={busy || !newGroup.trim()} onClick={() => { post('create_group', { name: newGroup }); setNewGroup('') }} className="btn btn-secondary text-xs disabled:opacity-40">Add group</button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-sky-500/10">
            <span className="text-xs text-sky-300 font-semibold">{selected.size} selected</span>
            <select onChange={e => { if (e.target.value) { post('bulk_set_members', { agent_emails: [...selected], group_id: e.target.value }); setSelected(new Set()) } }} className="filter-select text-xs" defaultValue="">
              <option value="">Move to…</option>
              {data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th className="w-8"></th><th>Agent</th><th>Group</th></tr></thead>
            <tbody>
              {agentRows.map(r => (
                <tr key={r.email}>
                  <td><input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} /></td>
                  <td className="text-slate-200">{r.email}</td>
                  <td>
                    <select value={r.group_id} disabled={busy} onChange={e => post('set_member', { agent_email: r.email, group_id: e.target.value || null })} className="filter-select text-xs">
                      <option value="">— Unassigned —</option>
                      {data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
