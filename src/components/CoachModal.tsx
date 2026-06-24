'use client'
import { useEffect, useState } from 'react'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'

interface Props {
  evaluationId: string
  onClose: () => void
  onCoached: () => void
}

interface EvalDetail {
  id: string; agent_email: string; ticket_number: string; channel: string
  score: number; eval_date: string; coached: boolean
  notes: string | null; areas_for_improvement: string | null
}
interface RespRow { result: string; qa_criteria: { label: string; is_critical: boolean } | null }

export function CoachModal({ evaluationId, onClose, onCoached }: Props) {
  const [ev, setEv] = useState<EvalDetail | null>(null)
  const [fails, setFails] = useState<string[]>([])
  const [existing, setExisting] = useState<{ strengths: string | null; areas_for_improvement: string | null; action_plan: string | null; coach_email: string; created_at: string } | null>(null)
  const [strengths, setStrengths] = useState('')
  const [areas, setAreas] = useState('')
  const [plan, setPlan] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [d, c] = await Promise.all([
        fetch(`/api/evaluations/${evaluationId}`).then(r => r.json()),
        fetch(`/api/evaluations/${evaluationId}/coaching`).then(r => r.json()),
      ])
      setEv(d.evaluation)
      setFails((d.responses ?? []).filter((r: RespRow) => r.result === 'fail').map((r: RespRow) => r.qa_criteria?.label).filter(Boolean))
      if (d.evaluation?.areas_for_improvement) setAreas(d.evaluation.areas_for_improvement)
      if (c.coaching?.length) setExisting(c.coaching[0])
      setLoading(false)
    })().catch(() => { setError('Failed to load'); setLoading(false) })
  }, [evaluationId])

  async function send() {
    setSaving(true); setError('')
    const res = await fetch(`/api/evaluations/${evaluationId}/coaching`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strengths, areas_for_improvement: areas, action_plan: plan }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setError(d.error ?? 'Failed'); return }
    onCoached()
  }

  const done = ev?.coached || !!existing

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-md h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">{done ? 'Coaching record' : 'Coach agent'}</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
          </div>

          {loading ? <InlineLoading /> : ev && (
            <>
              {/* Context */}
              <div className="glass p-4 mb-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Agent</span><span className="text-slate-200">{ev.agent_email}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-500">Ticket</span><span className="text-slate-200"><TicketLink ticket={ev.ticket_number} className="text-slate-200" /> · {ev.channel}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-500">Date</span><span className="text-slate-200">{formatDate(ev.eval_date)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-500">Score</span><span className={cn('font-bold', scoreColor(ev.score))}>{ev.score}%</span></div>
              </div>

              {/* Failed criteria */}
              {fails.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">What went wrong ({fails.length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fails.map((f, i) => <span key={i} className="badge badge-critical">{f}</span>)}
                  </div>
                </div>
              )}

              {done && existing ? (
                <div className="space-y-3 text-sm">
                  <Field label="Strengths" value={existing.strengths} />
                  <Field label="Areas for improvement" value={existing.areas_for_improvement} />
                  <Field label="Action plan" value={existing.action_plan} />
                  <p className="text-xs text-slate-500 pt-2">Coached by {existing.coach_email} · {formatDate(existing.created_at)}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Strengths</label>
                    <textarea value={strengths} onChange={e => setStrengths(e.target.value)} rows={3} className="form-control" placeholder="What the agent did well…" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Areas for improvement</label>
                    <textarea value={areas} onChange={e => setAreas(e.target.value)} rows={3} className="form-control" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Action plan <span className="text-slate-600">(optional)</span></label>
                    <textarea value={plan} onChange={e => setPlan(e.target.value)} rows={2} className="form-control" />
                  </div>
                  {error && <div className="text-sm text-red-400">{error}</div>}
                  <button onClick={send} disabled={saving} className="btn btn-success w-full">
                    {saving ? 'Sending…' : 'Send & mark coached ✓'}
                  </button>
                  <p className="text-xs text-slate-500 text-center">An email summary is sent to the agent.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 mb-1">{label}</div>
      <div className="text-slate-300 whitespace-pre-wrap bg-white/5 rounded-lg px-3 py-2">{value}</div>
    </div>
  )
}
