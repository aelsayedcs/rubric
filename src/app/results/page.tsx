'use client'
import { useEffect, useState, useCallback } from 'react'
import { CoachModal } from '@/components/CoachModal'
import { EditEvalModal } from '@/components/EditEvalModal'
import { EvalDetailDrawer } from '@/components/EvalDetailDrawer'
import { SearchSelect } from '@/components/SearchSelect'
import { DATE_PRESETS, getPresetRange, type DatePreset } from '@/lib/dates'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'

interface Evaluation {
  id: string; agent_email: string; team_lead_email: string | null; ticket_number: string
  channel: string; score: number; total_critical_errors: number; eval_date: string
  status: string; coached: boolean; disputed: boolean
}

function StatCard({ label, value, sub, color, icon, valueClass, active, onClick }: {
  label: string; value: string | number; sub: React.ReactNode; color: string; icon: React.ReactNode
  valueClass?: string; active?: boolean; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} type={onClick ? 'button' : undefined}
      className={cn('glass p-4 relative overflow-hidden text-left w-full transition-all',
        onClick && 'cursor-pointer hover:bg-white/[0.04]', active && 'ring-1 ring-sky-500/60')}
      style={active ? { boxShadow: `0 0 0 1px ${color}66` } : undefined}>
      <div className="absolute top-0 left-4 right-4 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ background: `${color}1f`, color }}>{icon}</span>
      </div>
      <div className={cn('num-big mt-2 leading-none', valueClass ?? 'text-white')}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </Tag>
  )
}

export default function ResultsPage() {
  const [rows, setRows] = useState<Evaluation[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ total: number; avgScore: number; critical: number; coached: number; coachedPct: number; needsCoaching: number; disputed: number; disputedPending: number; disputedFinished: number } | null>(null)
  // Card drill-down: filters the table only (the cards keep showing the full breakdown).
  const [cardFilter, setCardFilter] = useState<'' | 'critical' | 'coached' | 'needs' | 'disputed' | 'disputed_pending' | 'disputed_finished'>('')
  const [agents, setAgents] = useState<{ email: string }[]>([])
  const [teamLeads, setTeamLeads] = useState<string[]>([])
  const [threshold, setThreshold] = useState(85)
  const [role, setRole] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // filters
  const [agent, setAgent] = useState('')
  const [tl, setTl] = useState('')
  const [channel, setChannel] = useState('')
  const [coached, setCoached] = useState('')
  const [search, setSearch] = useState('')
  // Default the date filter to the current month so the page opens scoped to "this month".
  const [from, setFrom] = useState(() => getPresetRange('this_month').from)
  const [to, setTo] = useState(() => getPresetRange('this_month').to)
  const [preset, setPreset] = useState<DatePreset | ''>('this_month')

  function applyPreset(p: DatePreset | '') {
    setPreset(p)
    if (!p || p === 'custom') { if (!p) { setFrom(''); setTo('') } return }
    const r = getPresetRange(p)
    setFrom(r.from); setTo(r.to)
  }

  useEffect(() => {
    fetch('/api/lookups').then(r => r.json()).then(d => {
      setAgents(d.agents ?? []); setTeamLeads(d.teamLeads ?? []); setThreshold(d.coachingThreshold ?? 85)
      setRole(d.role ?? ''); setUserEmail(d.email ?? '')
    })
  }, [])

  // Deep-link from the daily digest email (Review & dispute) — open that eval's drawer.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('eval')
    if (id) setDetailId(id)
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (agent) p.set('agent', agent)
    if (tl) p.set('team_lead', tl)
    if (channel) p.set('channel', channel)
    if (coached) p.set('coached', coached)
    if (search) p.set('search', search)
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    // Accurate KPI cards over the full filtered set (not affected by the card drill-down).
    setStats(null)
    fetch('/api/evaluations/stats?' + p.toString()).then(r => r.json()).then(setStats).catch(() => {})
    // The table additionally applies the clicked-card drill-down.
    const lp = new URLSearchParams(p)
    if (cardFilter === 'critical') lp.set('critical', 'true')
    else if (cardFilter === 'coached') lp.set('coached', 'true')
    else if (cardFilter === 'needs') lp.set('needs_coaching', 'true')
    else if (cardFilter === 'disputed') lp.set('disputed', 'true')
    else if (cardFilter === 'disputed_pending') lp.set('disputed', 'pending')
    else if (cardFilter === 'disputed_finished') lp.set('disputed', 'finished')
    fetch('/api/evaluations?' + lp.toString()).then(r => r.json()).then(d => {
      setRows(d.evaluations ?? []); setTotal(d.total ?? (d.evaluations?.length ?? 0)); setLoading(false)
    }).catch(() => setLoading(false))
  }, [agent, tl, channel, coached, search, from, to, cardFilter])

  useEffect(() => { load() }, [load])

  const needsCoaching = (r: Evaluation) => !r.coached && (r.score < threshold || r.total_critical_errors > 0)

  async function deleteEval(r: Evaluation) {
    if (!window.confirm(`Delete evaluation for ticket ${r.ticket_number}? This removes it from all lists and stats.`)) return
    const res = await fetch(`/api/evaluations/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Failed to delete'); return }
    load()
  }
  // Role-based UI gating (mirrors the server guards).
  const canEdit = ['qa_evaluator', 'system_admin'].includes(role)          // edit / re-score
  const canCoach = ['team_lead', 'qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'].includes(role) // coach: any role above agent
  const isQaStaff = ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'].includes(role)             // create new evaluations
  const canExport = role !== '' && role !== 'agent' && role !== 'viewer'   // bulk export: not for agents

  const [exporting, setExporting] = useState(false)

  function filterParams() {
    const p = new URLSearchParams()
    if (agent) p.set('agent', agent)
    if (tl) p.set('team_lead', tl)
    if (channel) p.set('channel', channel)
    if (coached) p.set('coached', coached)
    if (search) p.set('search', search)
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    return p
  }

  async function exportCsv() {
    if (exporting) return
    setExporting(true)
    try {
      // Server builds the full detailed CSV (all rows + per-criterion breakdown).
      const res = await fetch('/api/evaluations/export?' + filterParams().toString())
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'qa-detailed-export.csv'
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(false)
    }
  }

  const rangeLabel = preset
    ? (DATE_PRESETS.find(p => p.key === preset)?.label ?? 'Filtered')
    : 'All time'

  return (
    <div className="page">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="section-title">Evaluations</h1>
          <p className="section-subtitle">Showing <span className="text-sky-400 font-semibold">{rangeLabel}</span></p>
        </div>
        <div className="flex gap-2">
          {canExport && <button onClick={exportCsv} disabled={exporting} className="btn btn-secondary text-xs">{exporting ? 'Exporting…' : 'Export CSV'}</button>}
          {isQaStaff && <a href="/evaluate" className="btn btn-primary text-xs">+ New evaluation</a>}
        </div>
      </div>

      {/* Stat cards — accurate over the full filtered set; click to drill the table */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard label="Tickets Done" value={stats ? stats.total.toLocaleString() : '—'} sub={rangeLabel} color="#38bdf8" icon="📋"
          active={cardFilter === ''} onClick={() => setCardFilter('')} />
        <StatCard label="Avg Score" value={stats ? `${stats.avgScore}%` : '—'} sub={rangeLabel} color="#22c55e" icon="🎯" valueClass={stats ? scoreColor(stats.avgScore) : undefined} />
        <StatCard label="Critical" value={stats ? stats.critical.toLocaleString() : '—'} sub="with critical error" color="#ef4444" icon="🚫"
          active={cardFilter === 'critical'} onClick={() => setCardFilter(f => f === 'critical' ? '' : 'critical')} />
        <StatCard label="Coached" value={stats ? `${stats.coachedPct}%` : '—'} sub={stats ? `${stats.coached} done` : ''} color="#10b981" icon="✅"
          active={cardFilter === 'coached'} onClick={() => setCardFilter(f => f === 'coached' ? '' : 'coached')} />
        <StatCard label="Needs Coaching" value={stats ? stats.needsCoaching.toLocaleString() : '—'} sub={`< ${threshold}% or critical`} color="#f59e0b" icon="⚠"
          active={cardFilter === 'needs'} onClick={() => setCardFilter(f => f === 'needs' ? '' : 'needs')} />
        <StatCard label="Disputed" value={stats ? stats.disputed.toLocaleString() : '—'} color="#a78bfa" icon="⚖"
          active={cardFilter.startsWith('disputed')} onClick={() => setCardFilter(f => f === 'disputed' ? '' : 'disputed')}
          sub={stats ? (
            <span className="flex gap-2">
              <button type="button"
                onClick={e => { e.stopPropagation(); setCardFilter(f => f === 'disputed_pending' ? '' : 'disputed_pending') }}
                className={cn('hover:text-amber-300', cardFilter === 'disputed_pending' ? 'text-amber-300 font-semibold' : 'text-amber-400/70')}>
                {stats.disputedPending} pending
              </button>
              <span className="text-slate-600">·</span>
              <button type="button"
                onClick={e => { e.stopPropagation(); setCardFilter(f => f === 'disputed_finished' ? '' : 'disputed_finished') }}
                className={cn('hover:text-emerald-300', cardFilter === 'disputed_finished' ? 'text-emerald-300 font-semibold' : 'text-emerald-400/70')}>
                {stats.disputedFinished} finished
              </button>
            </span>
          ) : rangeLabel} />
      </div>

      {/* Filters */}
      <div className="glass p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket…" className="filter-select w-36" />
        <SearchSelect value={agent} onChange={setAgent} className="w-48" inputClassName="filter-select"
          placeholder="All agents" allLabel="All agents"
          options={agents.map(a => ({ value: a.email, label: a.email }))} />
        <SearchSelect value={tl} onChange={setTl} className="w-44" inputClassName="filter-select"
          placeholder="All team leads" allLabel="All team leads"
          options={teamLeads.map(t => ({ value: t, label: t.split('@')[0], sublabel: t }))} />
        <select value={channel} onChange={e => setChannel(e.target.value)} className="filter-select">
          <option value="">All channels</option><option>Chat</option><option>Call</option><option>Tickets</option>
        </select>
        <select value={coached} onChange={e => setCoached(e.target.value)} className="filter-select">
          <option value="">Coached: any</option><option value="true">Coached</option><option value="false">Not coached</option>
        </select>
        <select value={preset} onChange={e => applyPreset(e.target.value as DatePreset | '')} className="filter-select" style={{ minWidth: 130 }}>
          <option value="">All time</option>
          {DATE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="filter-select" style={{ colorScheme: 'dark' }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="filter-select" style={{ colorScheme: 'dark' }} />
          </>
        )}
        {preset && preset !== 'custom' && (from || to) && (
          <span className="text-xs text-sky-400 font-mono self-center">{from} → {to}</span>
        )}
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Ticket</th><th>Agent</th><th>Channel</th><th>Score</th><th>Status</th><th className="text-right">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><InlineLoading /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500 py-8">No evaluations match.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-white/[0.03] transition-colors">
                  <td className="font-medium text-slate-200">
                    <TicketLink ticket={r.ticket_number} className="text-slate-200" />
                    {needsCoaching(r) && <span className="badge badge-needs-coaching ml-2">⚠ needs coaching</span>}
                    {r.disputed && <span className="badge badge-not-validated ml-2">disputed</span>}
                  </td>
                  <td className="text-slate-400">{r.agent_email}</td>
                  <td><span className={cn('badge', `badge-${r.channel.toLowerCase()}`)}>{r.channel}</span></td>
                  <td><span className={cn('font-bold', scoreColor(r.score))}>{r.score}%</span>
                    {r.total_critical_errors > 0 && <span className="badge badge-critical ml-2">critical</span>}</td>
                  <td className="text-slate-500 text-xs">{formatDate(r.eval_date)}</td>
                  <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {canEdit && <button onClick={() => setEditId(r.id)} className="btn btn-ghost text-xs py-1 text-sky-400">Edit</button>}
                    {r.coached ? (
                      canCoach
                        ? <button onClick={() => setCoachId(r.id)} className="badge badge-coached ml-1">✓ Coached</button>
                        : <span className="badge badge-coached ml-1">✓ Coached</span>
                    ) : canCoach ? (
                      <button onClick={() => setCoachId(r.id)} className="btn btn-ghost text-xs py-1 ml-1">Coach</button>
                    ) : null}
                    {canEdit && <button onClick={() => deleteEval(r)} className="btn btn-ghost text-xs py-1 ml-1 text-red-400">Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {coachId && (
        <CoachModal evaluationId={coachId} onClose={() => setCoachId(null)} onCoached={() => { setCoachId(null); load() }} />
      )}

      {editId && (
        <EditEvalModal evaluationId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load() }} />
      )}

      {detailId && (
        <EvalDetailDrawer
          evaluationId={detailId}
          role={role}
          userEmail={userEmail}
          onClose={() => setDetailId(null)}
          onEdit={() => { setEditId(detailId); setDetailId(null) }}
          onCoach={() => { setCoachId(detailId); setDetailId(null) }}
          onDisputed={() => { setDetailId(null); load() }}
          onDeleted={() => { setDetailId(null); load() }}
        />
      )}
    </div>
  )
}
