'use client'
import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'

interface Role {
  key: string; display_name: string; description: string | null
  is_system: boolean; archived: boolean; sort_order: number; users: number
}

export default function RolesPage() {
  const [rows, setRows] = useState<Role[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  // create form
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  // inline edit
  const [editing, setEditing] = useState<string | null>(null)
  const [eName, setEName] = useState('')
  const [eDesc, setEDesc] = useState('')

  const isSystemAdmin = role === 'system_admin'

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/roles').then(async r => {
      if (r.status === 403) { setForbidden(true); setLoading(false); return null }
      return r.json()
    }).then(d => { if (d) { setRows(d.roles ?? []); setRole(d.role ?? null); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!key.trim() || !name.trim()) return
    setBusy('create'); setMsg('')
    const res = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, display_name: name, description: desc }),
    })
    setBusy('')
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error ?? 'Failed'); return }
    setKey(''); setName(''); setDesc(''); load()
  }

  async function saveEdit(r: Role) {
    setBusy(r.key)
    const res = await fetch('/api/roles', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r.key, display_name: eName, description: eDesc }),
    })
    setBusy(''); setEditing(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Failed'); return }
    load()
  }

  async function toggleArchive(r: Role) {
    setBusy(r.key)
    await fetch('/api/roles', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r.key, archived: !r.archived }),
    })
    setBusy(''); load()
  }

  async function remove(r: Role) {
    if (!confirm(`Delete role "${r.display_name}" (${r.key})?` +
      (r.users ? `\n\n${r.users} user(s) currently hold this role — they will keep the raw value but it won't be assignable.` : ''))) return
    setBusy(r.key); setMsg('')
    const res = await fetch(`/api/roles?key=${encodeURIComponent(r.key)}`, { method: 'DELETE' })
    setBusy('')
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Failed'); return }
    load()
  }

  if (forbidden) return <div className="page"><div className="glass p-10 text-center text-slate-400">Top-tier admins only.</div></div>

  return (
    <div className="page">
      <div className="mb-5">
        <h1 className="section-title">Role Types</h1>
        <p className="section-subtitle">Create or delete role types. Assign them to people in <span className="font-mono">Roles &amp; Access</span>; control what each can see in <span className="font-mono">Permissions</span>.</p>
        {msg && <p className="text-sm text-amber-400 mt-2">{msg}</p>}
      </div>

      {/* Create */}
      <div className="glass p-4 mb-5 flex flex-wrap gap-2 items-end">
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Key</label>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="senior_qa" className="form-control" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Display name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Senior QA" className="form-control" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="optional" className="form-control" />
        </div>
        <button onClick={create} disabled={busy === 'create' || !key.trim() || !name.trim()} className="btn btn-primary shrink-0">
          {busy === 'create' ? '…' : 'Create role'}
        </button>
      </div>
      <p className="text-[11px] text-slate-600 mb-4">New roles start with no special powers — grant them page access in <span className="font-mono">Permissions</span>. Built-in roles keep their existing abilities.</p>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Role</th><th>Key</th><th>Users</th><th>Type</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><InlineLoading /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={6} className="text-center text-slate-500 py-8">No roles.</td></tr> :
               rows.map(r => (
                <tr key={r.key} className={r.archived ? 'opacity-60' : ''}>
                  <td>
                    {editing === r.key ? (
                      <input value={eName} onChange={e => setEName(e.target.value)} className="form-control text-xs py-1" />
                    ) : (
                      <div>
                        <p className="text-slate-200 text-sm font-medium">{r.display_name}</p>
                        {r.description && <p className="text-slate-600 text-[11px]">{r.description}</p>}
                      </div>
                    )}
                  </td>
                  <td className="font-mono text-xs text-slate-400">{r.key}</td>
                  <td className="text-slate-400 text-sm">{r.users}</td>
                  <td>
                    <span className={cn('badge', r.is_system ? 'badge-manual' : 'badge-validated')}>{r.is_system ? 'Built-in' : 'Custom'}</span>
                  </td>
                  <td><span className={cn('badge', r.archived ? 'badge-critical' : 'badge-validated')}>{r.archived ? 'archived' : 'active'}</span></td>
                  <td className="text-right whitespace-nowrap">
                    {editing === r.key ? (
                      <>
                        <button disabled={busy === r.key} onClick={() => saveEdit(r)} className="btn btn-ghost text-xs py-1 text-emerald-400">Save</button>
                        <button onClick={() => setEditing(null)} className="btn btn-ghost text-xs py-1 text-slate-500">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditing(r.key); setEName(r.display_name); setEDesc(r.description ?? '') }} className="btn btn-ghost text-xs py-1 text-sky-400">Edit</button>
                        <button disabled={busy === r.key} onClick={() => toggleArchive(r)} className="btn btn-ghost text-xs py-1 text-slate-400">{r.archived ? 'Restore' : 'Archive'}</button>
                        {isSystemAdmin && r.key !== 'system_admin' && (
                          <button disabled={busy === r.key} onClick={() => remove(r)} className="btn btn-ghost text-xs py-1 text-red-400">Delete</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {!isSystemAdmin && <p className="text-[11px] text-slate-600 mt-3">Only a System Admin can delete role types.</p>}
    </div>
  )
}
