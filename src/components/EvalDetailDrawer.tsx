'use client'
import { useEffect, useState } from 'react'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'
import { EDIT_ROLES } from '@/types'

interface Props {
  evaluationId: string
  role?: string
  userEmail?: string
  onClose: () => void
  onEdit?: () => void
  onCoach?: () => void
  onDisputed?: () => void
  onDeleted?: () => void
}

// Coaching is for any role above the agent (mirrors the canCoach guard).
const COACH_ROLES = ['team_lead', 'qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin']

const DISPUTE_STATUS: Record<string, string> = {
  pending_tl: 'pending team lead', approved_tl: 'approved by TL', rejected_tl: 'rejected by TL',
  pending_qa: 'pending QA', approved_qa: 'approved by QA', rejected_qa: 'rejected by QA', resolved: 'resolved',
}

interface EvalDetail {
  agent_email: string; team_lead_email: string | null; ticket_number: string; customer_email: string | null
  channel: string; eval_date: string | null; solved_date: string | null; score: number
  total_critical_errors: number; coached: boolean; disputed: boolean
  notes: string | null; areas_for_improvement: string | null; evaluator_email?: string | null
}
interface RespRow {
  result: 'pass' | 'fail' | 'na'
  qa_criteria: { section: string; label: string; is_critical: boolean; sort_order: number } | null
}

const pillClass = (r: string) => r === 'pass' ? 'pill-pass' : r === 'fail' ? 'pill-fail' : 'pill-na'

export function EvalDetailDrawer({ evaluationId, role, userEmail, onClose, onEdit, onCoach, onDisputed, onDeleted }: Props) {
  const [ev, setEv] = useState<EvalDetail | null>(null)
  const [resp, setResp] = useState<RespRow[]>([])
  const [dispute, setDispute] = useState<{ id: string; status: string } | null>(null)
  const [coaching, setCoaching] = useState<{ strengths: string | null; areas_for_improvement: string | null; action_plan: string | null; coach_email: string; agent_email: string; acknowledged_at: string | null } | null>(null)
  const [acking, setAcking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [disputing, setDisputing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/evaluations/${evaluationId}`).then(r => r.json()).then(d => {
      setEv(d.evaluation); setResp(d.responses ?? []); setDispute(d.dispute ?? null); setLoading(false)
    }).catch(() => setLoading(false))
    fetch(`/api/evaluations/${evaluationId}/coaching`).then(r => r.json()).then(d => setCoaching(d.coaching?.[0] ?? null)).catch(() => {})
  }, [evaluationId])

  async function acknowledge() {
    if (acking) return
    setAcking(true)
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/coaching`, { method: 'PATCH' })
      if (res.ok && coaching) setCoaching({ ...coaching, acknowledged_at: new Date().toISOString() })
    } finally { setAcking(false) }
  }

  const canEdit = !!role && (EDIT_ROLES as string[]).includes(role)
  const canCoach = !!role && COACH_ROLES.includes(role)
  // The agent (own eval) or their team lead may raise a dispute — but only if one
  // doesn't already exist (a dispute can be raised once per evaluation, ever).
  const canDispute = !!ev && !dispute &&
    (ev.agent_email === userEmail || ev.team_lead_email === userEmail)

  async function raiseDispute() {
    if (!ev || disputing) return
    const comment = window.prompt('Raise a dispute — explain why (this goes to the team lead, then QA):')
    if (comment === null) return // cancelled
    setDisputing(true)
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluation_id: evaluationId, comment }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Failed to raise dispute'); return }
      const created = await res.json().catch(() => ({}))
      setEv({ ...ev, disputed: true })
      setDispute({ id: created.id ?? 'new', status: 'pending_tl' })
      onDisputed?.()
    } finally {
      setDisputing(false)
    }
  }

  async function deleteEval() {
    if (!ev || deleting) return
    if (!window.confirm(`Delete evaluation for ticket ${ev.ticket_number}? This removes it from all lists and stats.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Failed to delete'); return }
      onDeleted?.()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const sections = Array.from(
    resp.reduce((m, r) => {
      const s = r.qa_criteria?.section ?? '—'
      const a = m.get(s) ?? []; a.push(r); m.set(s, a); return m
    }, new Map<string, RespRow[]>()).entries()
  )

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-xl h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Evaluation{ev ? <> · <TicketLink ticket={ev.ticket_number} className="text-white" /></> : ''}</h2>
              {ev && <p className="text-sm text-slate-500 mt-0.5">{ev.agent_email}</p>}
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
          </div>

          {loading ? <InlineLoading /> : ev && (
            <>
              <div className="glass p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
                <Field label="Score" value={<span className={cn('font-bold', scoreColor(Number(ev.score)))}>{ev.score}%</span>} />
                <Field label="Channel" value={ev.channel} />
                <Field label="Team Lead" value={ev.team_lead_email?.split('@')[0] ?? '—'} />
                <Field label="Eval date" value={formatDate(ev.eval_date)} />
                <Field label="Critical errors" value={String(ev.total_critical_errors)} />
                <Field label="Coached" value={ev.coached ? 'Yes' : 'No'} />
                <Field label="Customer" value={ev.customer_email || '—'} />
                <Field label="Solved date" value={formatDate(ev.solved_date)} />
                {canEdit && ev.evaluator_email && <Field label="Evaluated by" value={ev.evaluator_email.split('@')[0]} />}
              </div>

              <div className="space-y-3">
                {sections.map(([section, items]) => (
                  <div key={section} className="glass p-4">
                    <h3 className="text-sm font-bold text-white mb-2">{section}</h3>
                    <div className="space-y-1.5">
                      {items.sort((a, b) => (a.qa_criteria?.sort_order ?? 0) - (b.qa_criteria?.sort_order ?? 0)).map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 py-1 border-b border-white/5 last:border-0">
                          <span className="text-sm text-slate-300">{r.qa_criteria?.label}
                            {r.qa_criteria?.is_critical && <span className="badge badge-critical ml-2">Critical</span>}</span>
                          <span className={cn('pill', pillClass(r.result))}>{r.result === 'na' ? 'N/A' : r.result.charAt(0).toUpperCase() + r.result.slice(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {(ev.notes || ev.areas_for_improvement) && (
                <div className="glass p-4 mt-3 space-y-3 text-sm">
                  {ev.notes && <Field label="Notes" value={<span className="whitespace-pre-wrap">{ev.notes}</span>} />}
                  {ev.areas_for_improvement && <Field label="Areas for improvement" value={<span className="whitespace-pre-wrap">{ev.areas_for_improvement}</span>} />}
                </div>
              )}

              {coaching && (
                <div className="glass p-4 mt-3 space-y-3 text-sm border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-emerald-300">Coaching</span>
                    {coaching.acknowledged_at
                      ? <span className="text-[11px] text-emerald-400">✓ Acknowledged {formatDate(coaching.acknowledged_at)}</span>
                      : <span className="text-[11px] text-slate-500">Not yet acknowledged</span>}
                  </div>
                  {coaching.strengths && <Field label="Strengths" value={<span className="whitespace-pre-wrap">{coaching.strengths}</span>} />}
                  {coaching.areas_for_improvement && <Field label="Areas for improvement" value={<span className="whitespace-pre-wrap">{coaching.areas_for_improvement}</span>} />}
                  {coaching.action_plan && <Field label="Action plan" value={<span className="whitespace-pre-wrap">{coaching.action_plan}</span>} />}
                  {userEmail && coaching.agent_email?.toLowerCase() === userEmail.toLowerCase() && !coaching.acknowledged_at && (
                    <button onClick={acknowledge} disabled={acking} className="btn btn-primary text-xs">
                      {acking ? 'Saving…' : 'Acknowledge coaching'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                {onEdit && canEdit && <button onClick={onEdit} className="btn btn-primary flex-1">Edit &amp; re-score</button>}
                {onCoach && canCoach && <button onClick={onCoach} className="btn btn-secondary flex-1">Coach</button>}
                {canDispute && (
                  <button onClick={raiseDispute} disabled={disputing} className="btn btn-secondary flex-1">
                    {disputing ? 'Raising…' : 'Raise dispute'}
                  </button>
                )}
              </div>
              {canEdit && (
                <button onClick={deleteEval} disabled={deleting}
                  className="btn text-xs mt-3 w-full border border-red-500/50 text-red-400 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.08)' }}>
                  {deleting ? 'Deleting…' : '🗑 Delete evaluation'}
                </button>
              )}
              {dispute && (
                <p className="text-xs text-amber-400 mt-3">This evaluation has already been disputed{DISPUTE_STATUS[dispute.status] ? ` (${DISPUTE_STATUS[dispute.status]})` : ''} — track it on the Disputes page.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  )
}
