'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { formatDate, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'

interface Access { email: string; role: string; archived: boolean; created_at: string }
interface RoleType { key: string; display_name: string; description: string | null; archived: boolean }

export default function AccessPage() {
  const [rows, setRows] = useState<Access[]>([])
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('qa_evaluator')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('qa_evaluator')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/access').then(r => r.json()).catch(() => ({})),
      fetch('/api/roles').then(r => r.ok ? r.json() : { roles: [] }).catch(() => ({ roles: [] })),
    ]).then(([acc, rl]) => {
      setRows(acc.access ?? [])
      setRoleTypes(rl.roles ?? [])
      setLoading(false)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(a =>
      (showArchived || !a.archived) &&
      (!q || a.email.toLowerCase().includes(q) || a.role.includes(q)))
  }, [rows, search, showArchived])

  // Grant a role to a user (creates the role assignment) or update an existing one.
  async function grant() {
    if (!email) return
    setMsg(''); setBusy('grant')
    const res = await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    setBusy('')
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error ?? 'Failed'); return }
    setEmail(''); load()
  }

  // Change an existing user's role inline.
  async function saveRole(a: Access) {
    setBusy(a.email)
    const res = await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, role: editRole, archived: a.archived }),
    })
    setBusy(''); setEditing(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Failed'); return }
    load()
  }

  // Revoke (delete) or restore a user's access.
  async function toggle(a: Access) {
    if (!a.archived && !confirm(`Revoke ${a.role} access for ${a.email}?`)) return
    setBusy(a.email)
    await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, role: a.role, archived: !a.archived }),
    })
    setBusy('')
    load()
  }

  return (
    <div className="page">
      <h1 className="section-title">Roles &amp; Access</h1>
      <p className="section-subtitle mb-5">Grant a role to a user, change their role, or revoke access for the Quality app.</p>

      {/* Grant / create */}
      <div className="glass p-4 mb-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
            onKeyDown={e => { if (e.key === 'Enter') grant() }} className="form-control" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="form-control">
            {roleTypes.filter(r => !r.archived).map(r => <option key={r.key} value={r.key}>{r.display_name} ({r.key})</option>)}
          </select>
        </div>
        <button onClick={grant} disabled={busy === 'grant' || !email} className="btn btn-primary">
          {busy === 'grant' ? '…' : 'Grant / update'}
        </button>
        {msg && <span className="text-sm text-red-400">{msg}</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email / role…"
          className="filter-select flex-1 min-w-[180px]" />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
            className="w-4 h-4 rounded accent-sky-500 cursor-pointer" />
          <span className="text-sm text-slate-400">Show revoked</span>
        </label>
      </div>

      <div className="glass overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Granted</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5}><InlineLoading /></td></tr> :
               visible.length === 0 ? <tr><td colSpan={5} className="text-center text-slate-500 py-8">No users.</td></tr> :
               visible.map(a => (
                <tr key={a.email} className={a.archived ? 'opacity-60' : ''}>
                  <td className="text-slate-200">{a.email}</td>
                  <td>
                    {editing === a.email ? (
                      <select autoFocus value={editRole} onChange={e => setEditRole(e.target.value)} className="filter-select text-xs py-1">
                        {roleTypes.filter(r => !r.archived).map(r => <option key={r.key} value={r.key}>{r.display_name} ({r.key})</option>)}
                      </select>
                    ) : (
                      <span className="badge badge-manual">{a.role}</span>
                    )}
                  </td>
                  <td><span className={cn('badge', a.archived ? 'badge-critical' : 'badge-validated')}>{a.archived ? 'revoked' : 'active'}</span></td>
                  <td className="text-slate-500 text-xs">{formatDate(a.created_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    {editing === a.email ? (
                      <>
                        <button disabled={busy === a.email} onClick={() => saveRole(a)} className="btn btn-ghost text-xs py-1 text-emerald-400">Save</button>
                        <button onClick={() => setEditing(null)} className="btn btn-ghost text-xs py-1 text-slate-500">Cancel</button>
                      </>
                    ) : (
                      <>
                        {!a.archived && (
                          <button onClick={() => { setEditing(a.email); setEditRole(a.role) }} className="btn btn-ghost text-xs py-1 text-sky-400">Change role</button>
                        )}
                        <button disabled={busy === a.email} onClick={() => toggle(a)} className="btn btn-ghost text-xs py-1">{a.archived ? 'Restore' : 'Revoke'}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role reference */}
      <div className="glass p-4">
        <h2 className="text-sm font-bold text-white mb-3">Role reference</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {roleTypes.filter(r => !r.archived).map(r => (
            <div key={r.key} className="flex items-start gap-2 text-xs">
              <span className="badge badge-manual shrink-0">{r.key}</span>
              <span className="text-slate-400">{r.description ?? r.display_name}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-3">Manage role types under <span className="font-mono">Role Types</span>; page-level visibility under <span className="font-mono">Permissions</span>.</p>
      </div>
    </div>
  )
}
