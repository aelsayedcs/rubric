'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface Agent {
  email: string
  full_name: string | null
  team_lead_email: string
  active: boolean
  archived: boolean
  created_at: string
}

interface TeamLead {
  id: string
  email: string
  archived: boolean
}

function Spinner() {
  return (
    <svg className="spinner w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

export default function TeamPage() {
  const [allAgents,         setAllAgents]        = useState<Agent[]>([])
  const [allTls,            setAllTls]           = useState<TeamLead[]>([])
  const [loading,           setLoading]          = useState(true)
  const [forbidden,         setForbidden]        = useState(false)
  const [tab,               setTab]              = useState<'agents' | 'tls'>('agents')
  const [showArchived,      setShowArchived]     = useState(false)
  const [showArchivedTls,   setShowArchivedTls]  = useState(false)
  const [editingId,         setEditingId]        = useState<string | null>(null)
  const [editTl,            setEditTl]           = useState('')
  const [newEmail,          setNewEmail]         = useState('')
  const [newTl,             setNewTl]            = useState('')
  const [newTlEmail,        setNewTlEmail]       = useState('')
  const [saving,            setSaving]           = useState(false)
  const [tlSaving,          setTlSaving]         = useState(false)
  // Bulk selection (by agent email)
  const [selected,          setSelected]        = useState<Set<string>>(new Set())
  const [bulkTl,            setBulkTl]          = useState('')
  const [bulkSaving,        setBulkSaving]      = useState(false)

  // ── Load data ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const [agentRes, tlRes] = await Promise.all([
      fetch('/api/team?all=1'),
      fetch('/api/team-leads?all=1'),
    ])
    if (agentRes.status === 403 || tlRes.status === 403) {
      setForbidden(true)
      setLoading(false)
      return
    }
    const [agentJson, tlJson] = await Promise.all([agentRes.json(), tlRes.json()])
    setAllAgents(Array.isArray(agentJson) ? agentJson : [])
    setAllTls(Array.isArray(tlJson) ? tlJson : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const agents         = showArchived ? allAgents : allAgents.filter(a => !a.archived)
  const activeAgents   = allAgents.filter(a => !a.archived)
  const activeTls      = allTls.filter(tl => !tl.archived)
  const visibleTls     = showArchivedTls ? allTls : activeTls

  // TL summary: join team leads with agent counts
  const tlSummary = visibleTls.map(tl => ({
    id:       tl.id,
    email:    tl.email,
    archived: tl.archived,
    active:   allAgents.filter(a => a.team_lead_email === tl.email && !a.archived).length,
    total:    allAgents.filter(a => a.team_lead_email === tl.email).length,
  }))

  // Catch any TL emails referenced by agents but not registered as a team lead
  const knownTlEmails = new Set(allTls.map(tl => tl.email))
  const extraTlEmails = [...new Set(allAgents.map(a => a.team_lead_email))]
    .filter(e => e && !knownTlEmails.has(e)).sort()

  // Dropdown options: active registered leads + legacy emails (so reassignment works)
  const tlEmailsForDropdown = [...new Set([...activeTls.map(tl => tl.email), ...extraTlEmails])].sort()

  // ── Add agent ────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!newEmail.trim() || !newTl.trim()) return
    setSaving(true)
    await fetch('/api/team', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ agent_email: newEmail.trim(), team_lead_email: newTl.trim() }),
    })
    setNewEmail('')
    setNewTl('')
    await load()
    setSaving(false)
  }

  // ── Add team lead ─────────────────────────────────────────────────────────────
  async function handleAddTl() {
    if (!newTlEmail.trim()) return
    setTlSaving(true)
    const res = await fetch('/api/team-leads', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: newTlEmail.trim() }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Failed to add team lead')
    }
    setNewTlEmail('')
    await load()
    setTlSaving(false)
  }

  // ── Archive / Restore team lead ───────────────────────────────────────────────
  async function handleToggleTlArchive(tl: TeamLead) {
    await fetch('/api/team-leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: tl.id, archived: !tl.archived }),
    })
    await load()
  }

  // ── Edit TL (inline save) ────────────────────────────────────────────────────
  async function handleSaveTl(email: string) {
    if (!editTl.trim()) return
    setSaving(true)
    await fetch('/api/team', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, team_lead_email: editTl }),
    })
    setEditingId(null)
    setEditTl('')
    await load()
    setSaving(false)
  }

  // ── Archive / Restore agent ───────────────────────────────────────────────────
  async function handleToggleArchive(agent: Agent) {
    await fetch('/api/team', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: agent.email, archived: !agent.archived }),
    })
    await load()
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  function toggleSelect(email: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(email)) next.delete(email); else next.add(email)
      return next
    })
  }

  function toggleSelectAll(emails: string[]) {
    setSelected(s => s.size === emails.length ? new Set() : new Set(emails))
  }

  async function bulkArchive(archive: boolean) {
    setBulkSaving(true)
    await Promise.all([...selected].map(email =>
      fetch('/api/team', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, archived: archive }),
      })
    ))
    setSelected(new Set())
    await load()
    setBulkSaving(false)
  }

  async function bulkChangeTl() {
    if (!bulkTl.trim()) return
    setBulkSaving(true)
    await Promise.all([...selected].map(email =>
      fetch('/api/team', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, team_lead_email: bulkTl }),
      })
    ))
    setBulkTl('')
    setSelected(new Set())
    await load()
    setBulkSaving(false)
  }

  if (forbidden) {
    return (
      <div className="page">
        <div className="glass p-10 text-center text-slate-400">
          You don’t have access to Team Management. Contact an admin.
        </div>
      </div>
    )
  }

  return (
    <div className="page">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="section-title">Team Management</h1>
        <p className="section-subtitle">Manage agent–team lead assignments and view team structure.</p>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {(['agents', 'tls'] as const).map(t => {
          const label = t === 'agents'
            ? `Agents (${activeAgents.length})`
            : `Team Leads (${activeTls.length})`
          return (
            <button key={t} onClick={() => setTab(t)} className={cn('tab', tab === t && 'tab-active')}>
              {label}
            </button>
          )
        })}
      </div>

      {/* ══ AGENTS TAB ══════════════════════════════════════════════════════ */}
      {tab === 'agents' && (
        <div className="space-y-4">

          {/* Add agent form */}
          <div className="glass p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Agent Email</label>
              <input type="email" className="form-control" placeholder="agent@example.com"
                value={newEmail} onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team Lead</label>
              {tlEmailsForDropdown.length > 0 ? (
                <select className="form-control" value={newTl} onChange={e => setNewTl(e.target.value)}>
                  <option value="">— Select team lead —</option>
                  {tlEmailsForDropdown.map(tl => <option key={tl} value={tl}>{tl}</option>)}
                </select>
              ) : (
                <input type="email" className="form-control" placeholder="teamlead@example.com"
                  value={newTl} onChange={e => setNewTl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
              )}
            </div>
            <button onClick={handleAdd} disabled={saving || !newEmail.trim() || !newTl.trim()} className="btn btn-primary shrink-0">
              {saving ? <Spinner /> : 'Save Agent'}
            </button>
          </div>

          {/* Show archived toggle */}
          <div className="flex items-center justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500 cursor-pointer" />
              <span className="text-sm text-slate-400">Show archived</span>
            </label>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="glass p-3 flex flex-wrap items-center gap-3" style={{ background: 'rgba(14,165,233,0.06)' }}>
              <span className="text-xs font-semibold text-sky-400">{selected.size} selected</span>
              <div className="flex items-center gap-2 flex-1 min-w-48">
                <select className="form-control text-xs py-1.5 flex-1" value={bulkTl} onChange={e => setBulkTl(e.target.value)}>
                  <option value="">— Change team lead —</option>
                  {tlEmailsForDropdown.map(tl => <option key={tl} value={tl}>{tl}</option>)}
                </select>
                <button onClick={bulkChangeTl} disabled={bulkSaving || !bulkTl} className="btn btn-primary text-xs px-3 py-1.5 shrink-0">
                  {bulkSaving ? <Spinner /> : 'Apply'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => bulkArchive(true)} disabled={bulkSaving}
                  className="btn btn-ghost text-xs px-3 py-1.5 text-red-400">Archive selected</button>
                <button onClick={() => bulkArchive(false)} disabled={bulkSaving}
                  className="btn btn-ghost text-xs px-3 py-1.5 text-emerald-400">Restore selected</button>
                <button onClick={() => setSelected(new Set())} className="btn btn-ghost text-xs px-2 py-1.5 text-slate-500">✕</button>
              </div>
            </div>
          )}

          {/* Agents table */}
          <div className="glass overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                      checked={agents.length > 0 && selected.size === agents.length}
                      onChange={() => toggleSelectAll(agents.map(a => a.email))} />
                  </th>
                  <th>Agent Email</th>
                  <th>Team Lead</th>
                  <th>Status</th>
                  <th className="w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-16 text-center text-slate-500"><div className="flex justify-center"><Spinner /></div></td></tr>
                ) : agents.length === 0 ? (
                  <tr><td colSpan={5} className="py-16 text-center text-slate-500 text-sm">No agents found. Add one above.</td></tr>
                ) : (
                  agents.map(agent => (
                    <tr key={agent.email} className={agent.archived ? 'opacity-50' : ''}>
                      <td>
                        <input type="checkbox" className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                          checked={selected.has(agent.email)} onChange={() => toggleSelect(agent.email)} />
                      </td>
                      <td className="font-mono text-xs text-slate-300">{agent.email}</td>

                      {/* Team Lead — inline edit */}
                      <td>
                        {editingId === agent.email ? (
                          <select autoFocus className="form-control text-xs py-1.5" value={editTl} onChange={e => setEditTl(e.target.value)}>
                            <option value="">— Select team lead —</option>
                            {tlEmailsForDropdown.map(tl => <option key={tl} value={tl}>{tl}</option>)}
                          </select>
                        ) : (
                          <span className="font-mono text-xs text-slate-400">{agent.team_lead_email || '—'}</span>
                        )}
                      </td>

                      <td>
                        <span className={cn('badge', agent.archived ? 'badge-critical' : 'badge-validated')}>
                          <span className={cn('glow-dot', agent.archived ? 'bg-slate-500' : 'glow-dot-green')} />
                          {agent.archived ? 'Archived' : 'Active'}
                        </span>
                      </td>

                      <td>
                        <div className="flex items-center gap-2">
                          {editingId === agent.email ? (
                            <>
                              <button onClick={() => handleSaveTl(agent.email)} disabled={saving || !editTl.trim()}
                                className="text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-40 transition-colors">
                                {saving ? <Spinner /> : 'Save'}
                              </button>
                              <span className="text-slate-700">·</span>
                              <button onClick={() => { setEditingId(null); setEditTl('') }}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
                            </>
                          ) : agent.archived ? (
                            <button onClick={() => handleToggleArchive(agent)}
                              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">Restore</button>
                          ) : (
                            <>
                              <button onClick={() => { setEditingId(agent.email); setEditTl(agent.team_lead_email) }}
                                className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors">Edit TL</button>
                              <span className="text-slate-700">·</span>
                              <button onClick={() => handleToggleArchive(agent)}
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">Archive</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TEAM LEADS TAB ══════════════════════════════════════════════════ */}
      {tab === 'tls' && (
        <div className="space-y-4">

          {/* Add team lead form */}
          <div className="glass p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-64">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team Lead Email</label>
              <input type="email" className="form-control" placeholder="teamlead@example.com"
                value={newTlEmail} onChange={e => setNewTlEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTl() }} />
            </div>
            <button onClick={handleAddTl} disabled={tlSaving || !newTlEmail.trim()} className="btn btn-primary shrink-0">
              {tlSaving ? <Spinner /> : 'Add Team Lead'}
            </button>
          </div>

          {/* Show archived toggle */}
          <div className="flex items-center justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showArchivedTls} onChange={e => setShowArchivedTls(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500 cursor-pointer" />
              <span className="text-sm text-slate-400">Show archived</span>
            </label>
          </div>

          {/* Team Leads table */}
          <div className="glass overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team Lead Email</th>
                  <th className="w-40 text-center">Active Agents</th>
                  <th className="w-40 text-center">Total Agents</th>
                  <th className="w-32 text-center">Status</th>
                  <th className="w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-16 text-center text-slate-500"><div className="flex justify-center"><Spinner /></div></td></tr>
                ) : tlSummary.length === 0 && extraTlEmails.length === 0 ? (
                  <tr><td colSpan={5} className="py-16 text-center text-slate-500 text-sm">No team leads found. Add one above.</td></tr>
                ) : (
                  <>
                    {tlSummary.map(row => (
                      <tr key={row.id} className={row.archived ? 'opacity-50' : ''}>
                        <td className="font-mono text-xs text-slate-300">{row.email}</td>
                        <td className="text-center"><span className="badge badge-validated">{row.active}</span></td>
                        <td className="text-center"><span className="badge badge-manual">{row.total}</span></td>
                        <td className="text-center">
                          <span className={cn('badge', row.archived ? 'badge-critical' : 'badge-validated')}>
                            <span className={cn('glow-dot', row.archived ? 'bg-slate-500' : 'glow-dot-green')} />
                            {row.archived ? 'Archived' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => handleToggleTlArchive(allTls.find(t => t.id === row.id)!)}
                            className={cn('text-xs font-semibold transition-colors',
                              row.archived ? 'text-emerald-400 hover:text-emerald-300' : 'text-red-400 hover:text-red-300')}>
                            {row.archived ? 'Restore' : 'Archive'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Legacy TL emails referenced by agents but not registered */}
                    {extraTlEmails.map(email => (
                      <tr key={email} className="opacity-60">
                        <td className="font-mono text-xs text-slate-400">{email}
                          <span className="ml-2 text-[10px] text-slate-600">(legacy)</span>
                        </td>
                        <td className="text-center">
                          <span className="badge badge-validated">{allAgents.filter(a => a.team_lead_email === email && !a.archived).length}</span>
                        </td>
                        <td className="text-center">
                          <span className="badge badge-manual">{allAgents.filter(a => a.team_lead_email === email).length}</span>
                        </td>
                        <td className="text-center"><span className="badge badge-manual">Unregistered</span></td>
                        <td>
                          <button onClick={() => { setNewTlEmail(email); handleAddTl() }}
                            className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors">Register</button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Design note about TL change history */}
          <div className="glass p-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-400">Historical data is always preserved</p>
            <p>Each evaluation stores the team lead at the time it was created. If an agent moves to a new team lead, past records stay under the original TL in Analysis — only new records go to the new TL.</p>
            <p>Archiving a team lead hides them from assignment dropdowns but never deletes their historical records.</p>
          </div>
        </div>
      )}

    </div>
  )
}
