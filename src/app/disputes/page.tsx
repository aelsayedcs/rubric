'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { EditEvalModal } from '@/components/EditEvalModal'
import { formatDateTime, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'
import { DATE_PRESETS, getPresetRange, type DatePreset } from '@/lib/dates'

interface Dispute {
  id: string; evaluation_id: string | null; agent_email: string; ticket_number: string | null
  comment: string | null; submitted_by: string; status: string
  tl_comment: string | null; qa_comment: string | null
  tl_decision: string | null; qa_decision: string | null
  tl_email: string | null; qa_email: string | null
  tl_action_at: string | null; qa_action_at: string | null
  created_at: string; last_updated_at: string
}

const STATUS_LABEL: Record<string, string> = {
  pending_tl: 'Pending TL', approved_tl: 'Approved by TL', rejected_tl: 'Rejected by TL',
  pending_qa: 'Pending QA', approved_qa: 'Approved by QA', rejected_qa: 'Rejected by QA', resolved: 'Resolved',
}

const statusClass = (s: string) =>
  s === 'resolved' || s.startsWith('approved') ? 'badge-validated'
  : s.startsWith('rejected') ? 'badge-critical' : 'badge-not-validated'

export default function DisputesPage() {
  const [rows, setRows] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [group, setGroup] = useState<'' | 'pending' | 'rejected' | 'approved'>('')
  const [search, setSearch] = useState('')
  const [preset, setPreset] = useState<DatePreset | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Dispute | null>(null)

  function applyPreset(p: DatePreset | '') {
    setPreset(p)
    if (!p || p === 'custom') { if (!p) { setFrom(''); setTo('') } return }
    const r = getPresetRange(p); setFrom(r.from); setTo(r.to)
  }

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (search) p.set('search', search)
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    fetch('/api/disputes?' + p.toString()).then(r => r.json()).then(d => { setRows(d.disputes ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [status, search, from, to])
  useEffect(() => { load() }, [load])

  // Summary breakdown over the loaded rows (disputes are few — always under the cap).
  const summary = useMemo(() => {
    const s = { total: rows.length, pending: 0, rejected: 0, approved: 0 }
    for (const d of rows) {
      if (d.status.startsWith('pending')) s.pending++
      else if (d.status.startsWith('rejected')) s.rejected++
      else s.approved++ // approved_* + resolved
    }
    return s
  }, [rows])

  // Clicking a summary card filters the table to that group (Pending = TL + QA, etc.).
  const groupMatch: Record<string, (s: string) => boolean> = {
    pending: s => s.startsWith('pending'),
    rejected: s => s.startsWith('rejected'),
    approved: s => s.startsWith('approved') || s === 'resolved',
  }
  const displayRows = group ? rows.filter(d => groupMatch[group](d.status)) : rows
  function pickGroup(g: 'pending' | 'rejected' | 'approved') {
    setGroup(prev => prev === g ? '' : g); setStatus('') // group and the status dropdown are mutually exclusive
  }

  async function act(id: string, actor: 'tl' | 'qa', decision: 'approve' | 'reject') {
    const comment = prompt(`${actor.toUpperCase()} ${decision} — add a comment (optional):`) ?? ''
    setBusy(id)
    const res = await fetch(`/api/disputes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor, decision, comment }),
    })
    setBusy(null)
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed') }
    load()
  }

  return (
    <div className="page">
      <div className="mb-4">
        <h1 className="section-title">Disputes</h1>
        <p className="section-subtitle">agent → team lead → QA · click a row to read the full thread</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Disputes" value={summary.total} color="#38bdf8" active={!group && !status}
          onClick={() => { setGroup(''); setStatus('') }} />
        <StatCard label="Pending" value={summary.pending} color="#f59e0b" active={group === 'pending'} onClick={() => pickGroup('pending')} />
        <StatCard label="Rejected" value={summary.rejected} color="#ef4444" active={group === 'rejected'} onClick={() => pickGroup('rejected')} />
        <StatCard label="Approved / Resolved" value={summary.approved} color="#10b981" active={group === 'approved'} onClick={() => pickGroup('approved')} />
      </div>

      {/* Filters */}
      <div className="glass p-3 mb-5 flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket / agent…"
          className="filter-select flex-1 min-w-[180px]" />
        <select value={status} onChange={e => { setStatus(e.target.value); setGroup('') }} className="filter-select">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={preset} onChange={e => applyPreset(e.target.value as DatePreset | '')} className="filter-select">
          <option value="">All time</option>
          {DATE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset('custom') }} className="filter-select" />
        <span className="text-slate-600 text-xs">→</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset('custom') }} className="filter-select" />
        {(search || status || group || from || to) && (
          <button onClick={() => { setSearch(''); setStatus(''); setGroup(''); applyPreset('') }} className="btn btn-ghost text-xs">Clear</button>
        )}
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Ticket</th><th>Agent</th><th>Comment</th><th>Status</th><th>Updated</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><InlineLoading /></td></tr> :
               displayRows.length === 0 ? <tr><td colSpan={6} className="text-center text-slate-500 py-8">No disputes.</td></tr> :
               displayRows.map(d => (
                <tr key={d.id} onClick={() => setDetail(d)} className="cursor-pointer hover:bg-white/[0.03] transition-colors">
                  <td className="text-slate-200"><TicketLink ticket={d.ticket_number} className="text-slate-200" /></td>
                  <td className="text-slate-400">{d.agent_email}</td>
                  <td className="text-slate-400 max-w-xs truncate" title={d.comment ?? ''}>{d.comment ?? '—'}</td>
                  <td><span className={cn('badge', statusClass(d.status))}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                  <td className="text-slate-500 text-xs">{formatDateTime(d.last_updated_at)}</td>
                  <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {d.status === 'pending_tl' && (
                      <>
                        <button disabled={busy === d.id} onClick={() => act(d.id, 'tl', 'approve')} className="btn btn-ghost text-xs py-1 text-emerald-400">TL Approve</button>
                        <button disabled={busy === d.id} onClick={() => act(d.id, 'tl', 'reject')} className="btn btn-ghost text-xs py-1 text-red-400">Reject</button>
                      </>
                    )}
                    {d.status === 'pending_qa' && (
                      <>
                        <button disabled={busy === d.id} onClick={() => act(d.id, 'qa', 'approve')} className="btn btn-ghost text-xs py-1 text-emerald-400">QA Approve</button>
                        <button disabled={busy === d.id} onClick={() => act(d.id, 'qa', 'reject')} className="btn btn-ghost text-xs py-1 text-red-400">Reject</button>
                      </>
                    )}
                    {d.evaluation_id && (
                      <button onClick={() => setEditId(d.evaluation_id)} className="btn btn-ghost text-xs py-1 text-sky-400" title="QA only — edit & re-score the evaluation">
                        Edit &amp; re-score
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <DisputeDetail
          d={detail}
          onClose={() => setDetail(null)}
          onEdit={detail.evaluation_id ? () => { setEditId(detail.evaluation_id); setDetail(null) } : undefined}
        />
      )}

      {editId && (
        <EditEvalModal evaluationId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load() }} />
      )}
    </div>
  )
}

function DisputeDetail({ d, onClose, onEdit }: { d: Dispute; onClose: () => void; onEdit?: () => void }) {
  const decisionBadge = (dec: string | null) =>
    !dec ? null : <span className={cn('badge ml-2', dec === 'approve' ? 'badge-validated' : 'badge-critical')}>{dec === 'approve' ? 'Approved' : 'Rejected'}</span>

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-lg h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Dispute · <TicketLink ticket={d.ticket_number} className="text-white" /></h2>
              <p className="text-sm text-slate-500 mt-0.5">{d.agent_email}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
          </div>

          <div className="glass p-4 mb-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <span className={cn('badge', statusClass(d.status))}>{STATUS_LABEL[d.status] ?? d.status}</span>
          </div>

          {/* Timeline: agent → TL → QA */}
          <div className="space-y-3">
            <ThreadStep
              who={`Agent · ${d.submitted_by?.split('@')[0] ?? '—'}`}
              when={d.created_at} body={d.comment}
              tint="#38bdf8" label="Raised the dispute" />

            <ThreadStep
              who={`Team Lead · ${d.tl_email?.split('@')[0] ?? '—'}`}
              when={d.tl_action_at}
              body={d.tl_comment}
              tint="#a78bfa"
              label={<>TL review {decisionBadge(d.tl_decision)}</>}
              pending={!d.tl_decision && d.status === 'pending_tl'} />

            <ThreadStep
              who={`QA · ${d.qa_email?.split('@')[0] ?? '—'}`}
              when={d.qa_action_at}
              body={d.qa_comment}
              tint="#34d399"
              label={<>QA decision {decisionBadge(d.qa_decision)}</>}
              pending={!d.qa_decision && d.status === 'pending_qa'} />
          </div>

          {onEdit && (
            <button onClick={onEdit} className="btn btn-primary w-full mt-5">Edit &amp; re-score evaluation</button>
          )}
        </div>
      </div>
    </div>
  )
}

function ThreadStep({ who, when, body, tint, label, pending }: {
  who: string; when: string | null; body: string | null; tint: string
  label: React.ReactNode; pending?: boolean
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${tint}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-300">{who}</span>
        <span className="text-[10px] text-slate-500">{when ? formatDateTime(when) : pending ? 'Awaiting…' : '—'}</span>
      </div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
      {body
        ? <p className="text-sm text-slate-300 whitespace-pre-wrap">{body}</p>
        : <p className="text-sm text-slate-600 italic">{pending ? 'Pending review' : 'No comment'}</p>}
    </div>
  )
}

function StatCard({ label, value, color, active, onClick }: {
  label: string; value: number; color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick} type="button"
      className={cn('glass p-4 relative overflow-hidden text-left transition-all',
        onClick && 'cursor-pointer hover:bg-white/[0.04]',
        active && 'ring-1 ring-sky-500/60')}
      style={active ? { boxShadow: `0 0 0 1px ${color}55` } : undefined}>
      <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{label}</div>
      <div className="text-2xl font-extrabold text-white">{value.toLocaleString()}</div>
    </button>
  )
}
