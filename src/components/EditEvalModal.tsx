'use client'
import { useEffect, useMemo, useState } from 'react'
import { computeScore, type Result } from '@/lib/scoring'
import { scoreColor, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'

interface Props {
  evaluationId: string
  onClose: () => void
  onSaved: () => void
}

interface EvalDetail {
  id: string; agent_email: string; ticket_number: string; customer_email: string | null
  channel: string; eval_date: string | null; solved_date: string | null; score: number
  notes: string | null; areas_for_improvement: string | null
}

const ALL = ['Chat', 'Call', 'Tickets']
// The join returns qa_criteria as a to-one object.
interface RespRow {
  criterion_id: string
  result: Result
  qa_criteria: { section: string; label: string; weight: number; is_critical: boolean; sort_order: number; channels?: string[]; allow_na?: boolean } | null
}

interface Crit { id: string; section: string; label: string; weight: number; is_critical: boolean; sort_order: number; channels: string[]; allow_na: boolean }

const ymd = (d: string | null) => (d ? String(d).slice(0, 10) : '')

export function EditEvalModal({ evaluationId, onClose, onSaved }: Props) {
  const [ev, setEv] = useState<EvalDetail | null>(null)
  const [criteria, setCriteria] = useState<Crit[]>([])
  const [responses, setResponses] = useState<Record<string, Result>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // editable fields
  const [ticket, setTicket] = useState('')
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Chat')
  const [evalDate, setEvalDate] = useState('')
  const [solvedDate, setSolvedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [areas, setAreas] = useState('')

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}`)
      if (!res.ok) { setError(res.status === 403 ? 'Only QA staff can edit evaluations.' : 'Failed to load'); setLoading(false); return }
      const d = await res.json()
      const e: EvalDetail = d.evaluation
      setEv(e)
      setTicket(e.ticket_number ?? '')
      setCustomer(e.customer_email ?? '')
      setChannel(e.channel ?? 'Chat')
      setEvalDate(ymd(e.eval_date))
      setSolvedDate(ymd(e.solved_date))
      setNotes(e.notes ?? '')
      setAreas(e.areas_for_improvement ?? '')

      const rows: RespRow[] = d.responses ?? []
      const crits: Crit[] = rows
        .filter(r => r.qa_criteria)
        .map(r => ({
          id: r.criterion_id, section: r.qa_criteria!.section, label: r.qa_criteria!.label,
          weight: r.qa_criteria!.weight, is_critical: r.qa_criteria!.is_critical, sort_order: r.qa_criteria!.sort_order,
          channels: r.qa_criteria!.channels ?? ALL, allow_na: r.qa_criteria!.allow_na ?? !r.qa_criteria!.is_critical,
        }))
        .sort((a, b) => a.section.localeCompare(b.section) || a.sort_order - b.sort_order)
      setCriteria(crits)
      const init: Record<string, Result> = {}
      rows.forEach(r => { init[r.criterion_id] = r.result })
      setResponses(init)
      setLoading(false)
    })().catch(() => { setError('Failed to load'); setLoading(false) })
  }, [evaluationId])

  const applicable = (c: Crit) => (c.channels ?? ALL).includes(channel)
  // Effective answer: items not applicable to the channel count as N/A (ignored).
  const effective = (c: Crit): Result => applicable(c) ? (responses[c.id] ?? 'na') : 'na'

  const live = useMemo(() => {
    const resp = criteria.map(c => ({ criterion_id: c.id, result: effective(c) }))
    return computeScore(resp, criteria)
  }, [responses, criteria, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    const m = new Map<string, Crit[]>()
    for (const c of criteria) { const a = m.get(c.section) ?? []; a.push(c); m.set(c.section, a) }
    return Array.from(m.entries())
  }, [criteria])

  function set(id: string, r: Result) { setResponses(p => ({ ...p, [id]: r })) }

  async function save() {
    if (!ticket.trim()) { setError('Ticket number is required'); return }
    setSaving(true); setError('')
    const res = await fetch(`/api/evaluations/${evaluationId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_number: ticket, customer_email: customer, channel,
        eval_date: evalDate || null, solved_date: solvedDate || null,
        notes, areas_for_improvement: areas,
        responses: criteria.map(c => ({ criterion_id: c.id, result: effective(c) })),
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(d.error ?? 'Save failed'); return }
    onSaved()
  }

  const scoreDelta = ev ? live.score - ev.score : 0

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-2xl h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Edit &amp; re-score</h2>
              {ev && <p className="text-sm text-slate-500 mt-0.5">{ev.agent_email}</p>}
            </div>
            <div className="flex items-center gap-4">
              {ev && (
                <div className="text-center">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">New score</div>
                  <div className={cn('text-2xl font-extrabold', scoreColor(live.score))}>{live.score}%</div>
                  {scoreDelta !== 0 && (
                    <div className={cn('text-[11px] font-semibold', scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {scoreDelta > 0 ? '▲' : '▼'} {Math.abs(scoreDelta)} from {ev.score}%
                    </div>
                  )}
                  {live.critical_fail && <div className="text-[11px] text-red-400 font-semibold">Critical fail → 0</div>}
                </div>
              )}
              <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
            </div>
          </div>

          {loading ? <InlineLoading /> : error && !ev ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : ev && (
            <>
              {/* Case metadata */}
              <div className="glass p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ticket number</label>
                  <input value={ticket} onChange={e => setTicket(e.target.value)} className="form-control" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Channel</label>
                  <select value={channel} onChange={e => setChannel(e.target.value)} className="form-control">
                    <option>Chat</option><option>Call</option><option>Tickets</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Customer email</label>
                  <input value={customer} onChange={e => setCustomer(e.target.value)} className="form-control" placeholder="optional" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Evaluation date</label>
                  <input type="date" value={evalDate} onChange={e => setEvalDate(e.target.value)} className="form-control" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Solved date</label>
                  <input type="date" value={solvedDate} onChange={e => setSolvedDate(e.target.value)} className="form-control" />
                </div>
              </div>

              {/* Scorecard sections */}
              <div className="space-y-3">
                {sections.map(([section, items]) => (
                  <div key={section} className="glass p-4">
                    <h3 className="text-sm font-bold text-white mb-3">{section}</h3>
                    <div className="space-y-2">
                      {items.map(c => (
                        <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                          <div className="flex-1 text-sm text-slate-300">
                            {c.label}
                            {c.is_critical
                              ? <span className="badge badge-critical ml-2">Critical</span>
                              : <span className="text-xs text-slate-500 ml-2">{c.weight} pts</span>}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {!applicable(c) ? (
                              <span className="pill pill-na opacity-60" title={`Not applicable to ${channel}`}>N/A · not {channel}</span>
                            ) : (
                              ((c.allow_na ? ['pass', 'fail', 'na'] : ['pass', 'fail']) as Result[]).map(r => (
                                <button key={r} onClick={() => set(c.id, r)}
                                  className={cn('pill', responses[c.id] === r
                                    ? (r === 'pass' ? 'pill-pass' : r === 'fail' ? 'pill-fail' : 'pill-na')
                                    : 'pill-idle')}>
                                  {r === 'na' ? 'N/A' : r.charAt(0).toUpperCase() + r.slice(1)}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Notes */}
                <div className="glass p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Notes / comments</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="form-control" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Areas for improvement</label>
                    <textarea value={areas} onChange={e => setAreas(e.target.value)} rows={3} className="form-control" />
                  </div>
                </div>
              </div>

              {error && <div className="mt-4 px-3 py-2.5 rounded-xl text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

              <div className="mt-5 flex items-center gap-3">
                <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save & re-score'}</button>
                <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                <span className="text-sm text-slate-500 ml-auto">{live.total_errors} errors · {live.total_critical_errors} critical</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
