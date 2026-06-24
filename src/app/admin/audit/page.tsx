'use client'
import { useEffect, useState, useCallback } from 'react'
import { formatDateTime, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'

interface Log {
  id: number; actor_email: string; action: string; entity: string
  entity_id: string; field: string | null; old_value: string | null; new_value: string | null; ts: string
}

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'COACH', 'DISPUTE']

const actionClass = (a: string) =>
  a === 'CREATE' ? 'badge-validated' : a === 'DELETE' ? 'badge-critical'
  : a === 'DISPUTE' ? 'badge-not-validated' : 'badge-manual'

export default function AuditPage() {
  const [rows, setRows] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (action) p.set('action', action)
    if (actor) p.set('actor', actor)
    if (search) p.set('search', search)
    fetch('/api/audit?' + p.toString()).then(async r => {
      if (r.status === 403) { setForbidden(true); setLoading(false); return null }
      return r.json()
    }).then(d => { if (d) { setRows(d.logs ?? []); setLoading(false) } }).catch(() => setLoading(false))
  }, [action, actor, search])
  useEffect(() => { load() }, [load])

  if (forbidden) return <div className="page"><div className="glass p-10 text-center text-slate-400">Admins only.</div></div>

  return (
    <div className="page">
      <div className="mb-5">
        <h1 className="section-title">Audit Log</h1>
        <p className="section-subtitle">Every create / update / delete / coach / dispute action across the quality app.</p>
      </div>

      <div className="glass p-3 mb-4 flex flex-wrap gap-2 items-center">
        <select value={action} onChange={e => setAction(e.target.value)} className="filter-select">
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={actor} onChange={e => setActor(e.target.value)} placeholder="Actor email…" className="filter-select w-44" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entity id…" className="filter-select w-44" />
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Ref</th><th>Change</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><InlineLoading /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={6} className="text-center text-slate-500 py-8">No audit entries.</td></tr> :
               rows.map(l => (
                <tr key={l.id}>
                  <td className="text-slate-500 text-xs whitespace-nowrap">{formatDateTime(l.ts)}</td>
                  <td className="text-slate-400 text-xs">{l.actor_email?.split('@')[0]}</td>
                  <td><span className={cn('badge', actionClass(l.action))}>{l.action}</span></td>
                  <td className="text-slate-400 text-xs">{l.entity}</td>
                  <td className="text-slate-500 text-xs max-w-[160px] truncate" title={l.entity_id}>{l.entity_id}</td>
                  <td className="text-slate-400 text-xs max-w-xs truncate" title={[l.field, l.old_value, l.new_value].filter(Boolean).join(' · ')}>
                    {l.new_value ?? l.field ?? '—'}
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
