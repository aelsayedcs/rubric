'use client'
import { useEffect, useState, useCallback } from 'react'
import { formatDate, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'
import type { AppRole } from '@/types'

interface Access { email: string; role: AppRole; archived: boolean; created_at: string }

const ROLES: AppRole[] = ['system_admin', 'super_admin', 'admin', 'qa_evaluator', 'team_lead', 'agent', 'viewer']

export default function AccessPage() {
  const [rows, setRows] = useState<Access[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('qa_evaluator')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/access').then(r => r.json()).then(d => { setRows(d.access ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function grant() {
    if (!email) return
    setMsg('')
    const res = await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const d = await res.json()
    if (!res.ok) { setMsg(d.error ?? 'Failed'); return }
    setEmail(''); load()
  }

  async function toggle(a: Access) {
    await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, role: a.role, archived: !a.archived }),
    })
    load()
  }

  return (
    <div className="page">
      <h1 className="section-title">Access Management</h1>
      <p className="section-subtitle mb-5">Grant per-tool roles for the Quality app. (Becomes shared CX Cockpit access later.)</p>

      <div className="glass p-4 mb-5 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="form-control" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Role</label>
          <select value={role} onChange={e => setRole(e.target.value as AppRole)} className="form-control">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={grant} className="btn btn-primary">Grant / update</button>
        {msg && <span className="text-sm text-red-400">{msg}</span>}
      </div>

      <div className="glass overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Granted</th><th className="text-right">Action</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5}><InlineLoading /></td></tr> :
             rows.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-500 py-8">No users yet.</td></tr> :
             rows.map(a => (
              <tr key={a.email}>
                <td className="text-slate-200">{a.email}</td>
                <td><span className="badge badge-manual">{a.role}</span></td>
                <td><span className={cn('badge', a.archived ? 'badge-critical' : 'badge-validated')}>{a.archived ? 'revoked' : 'active'}</span></td>
                <td className="text-slate-500 text-xs">{formatDate(a.created_at)}</td>
                <td className="text-right">
                  <button onClick={() => toggle(a)} className="btn btn-ghost text-xs py-1">{a.archived ? 'Restore' : 'Revoke'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
