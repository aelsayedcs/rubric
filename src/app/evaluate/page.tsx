'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { computeScore, type Result } from '@/lib/scoring'
import { SearchSelect } from '@/components/SearchSelect'
import { Loading } from '@/components/Loading'
import { scoreColor, cn } from '@/lib/utils'

interface Criterion { id: string; section: string; label: string; weight: number; is_critical: boolean; sort_order: number; channels: string[]; allow_na: boolean }
interface Scorecard { id: string; name: string; version: number; channels: string[]; criteria: Criterion[] }
interface Agent { email: string; full_name: string | null; team_lead_email: string | null }

interface MyGroup { name: string; done: number; total: number; remaining: string[] }

export default function EvaluatePage() {
  const router = useRouter()
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [role, setRole] = useState<string>('')
  const [myEmail, setMyEmail] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [myGroup, setMyGroup] = useState<MyGroup | null>(null)

  // form
  const [agent, setAgent] = useState('')
  const [ticket, setTicket] = useState('')
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Chat')
  const [qaDate, setQaDate] = useState(() => new Date().toISOString().slice(0, 10)) // QA date = when the ticket was evaluated; defaults to today, backdatable
  const [solvedDate, setSolvedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [areas, setAreas] = useState('')
  const [responses, setResponses] = useState<Record<string, Result>>({})
  const [dup, setDup] = useState<{ exists: boolean; eval_date?: string; evaluator?: string } | null>(null)

  useEffect(() => {
    fetch('/api/lookups').then(r => r.json()).then(d => {
      setScorecards(d.scorecards ?? []); setAgents(d.agents ?? []); setRole(d.role ?? ''); setMyEmail(d.email ?? '')
      setLoading(false)
      if (d.email) loadMyGroup(d.email)
    }).catch(() => { setError('Failed to load scorecard'); setLoading(false) })
  }, [])

  // Resolve the scorecard for the selected channel: most-specific active scorecard
  // whose channel set covers it (smallest set wins; tie → first).
  const scorecard = useMemo(() => {
    const matches = scorecards.filter(s => (s.channels ?? []).includes(channel))
    if (!matches.length) return scorecards[0] ?? null
    return [...matches].sort((a, b) => a.channels.length - b.channels.length)[0]
  }, [scorecards, channel])
  const criteria = useMemo(() => scorecard?.criteria ?? [], [scorecard])
  const applicable = (c: Criterion) => (c.channels ?? []).includes(channel)

  // (Re)initialise responses whenever the resolved scorecard or channel changes:
  // applicable critical → pass, applicable others → na, non-applicable → na (locked).
  useEffect(() => {
    if (!scorecard) return
    setResponses(defaultsFor(scorecard.criteria, channel))
  }, [scorecard, channel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Default answer per criterion: not-applicable-to-channel → na (locked); else a
  // critical or no-N/A item → pass; an N/A-allowed item → na.
  function defaultsFor(crits: Criterion[], ch: string): Record<string, Result> {
    const init: Record<string, Result> = {}
    for (const c of crits) {
      const ok = (c.channels ?? []).includes(ch)
      init[c.id] = !ok ? 'na' : (c.is_critical || !c.allow_na) ? 'pass' : 'na'
    }
    return init
  }

  // My assigned group this week + who's left to evaluate (drives the top panel).
  async function loadMyGroup(email: string) {
    try {
      const d = await fetch('/api/assignments').then(r => r.json())
      const a = (d.assignment ?? []).find((x: { qa_email: string | null }) => x.qa_email?.toLowerCase() === email.toLowerCase())
      const g = a && (d.groups ?? []).find((x: { id: string }) => x.id === a.group_id)
      if (!g) { setMyGroup(null); return }
      setMyGroup({ name: g.name, done: g.done, total: g.total, remaining: g.members.filter((m: { done: boolean }) => !m.done).map((m: { email: string }) => m.email) })
    } catch { setMyGroup(null) }
  }

  function resetForm() {
    setAgent(''); setTicket(''); setCustomer(''); setChannel('Chat')
    setQaDate(new Date().toISOString().slice(0, 10)); setSolvedDate(''); setNotes(''); setAreas('')
    setResponses(defaultsFor(criteria, 'Chat')); setDup(null)
  }

  const live = useMemo(() => {
    const resp = Object.entries(responses).map(([criterion_id, result]) => ({ criterion_id, result }))
    return computeScore(resp, criteria)
  }, [responses, criteria])

  const sections = useMemo(() => {
    const m = new Map<string, Criterion[]>()
    for (const c of criteria) { const a = m.get(c.section) ?? []; a.push(c); m.set(c.section, a) }
    return Array.from(m.entries())
  }, [criteria])

  function set(id: string, r: Result) { setResponses(p => ({ ...p, [id]: r })) }

  const selectedTl = agents.find(a => a.email === agent)?.team_lead_email ?? ''

  // Backdating the QA date is restricted to qa_evaluator and system_admin.
  const canSetQaDate = role === 'qa_evaluator' || role === 'system_admin'

  // Advisory duplicate check — does not block submit.
  useEffect(() => {
    if (!agent.trim() || !ticket.trim()) { setDup(null); return }
    const t = setTimeout(() => {
      fetch(`/api/evaluations/check-duplicate?agent=${encodeURIComponent(agent)}&ticket=${encodeURIComponent(ticket)}`)
        .then(r => r.json()).then(setDup).catch(() => setDup(null))
    }, 400)
    return () => clearTimeout(t)
  }, [agent, ticket])

  async function submit() {
    if (!agent || !ticket) { setError('Agent and ticket are required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/evaluations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scorecard_id: scorecard!.id, agent_email: agent, ticket_number: ticket,
        customer_email: customer, channel,
        eval_date: canSetQaDate ? (qaDate || null) : null, solved_date: solvedDate || null,
        notes, areas_for_improvement: areas,
        responses: Object.entries(responses).map(([criterion_id, result]) => ({ criterion_id, result })),
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setError(d.error ?? 'Save failed'); return }
    // Stay on the page for the next ticket: flash success, clear the form,
    // and refresh "who's left" on my group.
    setSaved(`Saved ✓ — ${d.score}%`)
    resetForm()
    if (myEmail) loadMyGroup(myEmail)
    setTimeout(() => setSaved(''), 4000)
  }

  if (loading) return <div className="page"><Loading label="Loading scorecard…" /></div>
  if (!scorecard) return <div className="page"><div className="text-amber-400">No active scorecard found. Seed one first.</div></div>

  return (
    <div className="page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="section-title">New Evaluation</h1>
          <p className="section-subtitle">{scorecard.name} · submitted directly by QA</p>
        </div>
        {/* Live score */}
        <div className="glass px-5 py-3 text-center shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">Live score</div>
          <div className={cn('num-big', scoreColor(live.score))}>{live.score}%</div>
          {live.critical_fail && <div className="text-[11px] text-red-400 font-semibold mt-0.5">Critical fail → 0</div>}
        </div>
      </div>

      {saved && (
        <div className="mb-4 px-3 py-2.5 rounded-xl text-sm text-emerald-300"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>{saved} · ready for the next one</div>
      )}

      {/* My group this week — who's left to evaluate */}
      {myGroup ? (
        <div className="glass p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <span className="text-sm font-bold text-white">Your group this week: <span className="text-sky-400">{myGroup.name}</span></span>
            <span className="text-xs text-slate-400">{myGroup.done} / {myGroup.total} done · <span className="text-amber-400 font-semibold">{myGroup.remaining.length} remaining</span></span>
          </div>
          {myGroup.remaining.length === 0 ? (
            <p className="text-xs text-emerald-400">All done for this week 🎉</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {myGroup.remaining.map(e => (
                <button key={e} type="button" onClick={() => setAgent(e)}
                  className={cn('text-[11px] px-2 py-1 rounded-md transition-colors', agent === e ? 'bg-sky-500/25 text-sky-200' : 'bg-white/5 text-slate-300 hover:bg-white/10')}>
                  {e.split('@')[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : myEmail && (
        <div className="glass p-3 mb-4 text-xs text-slate-500">You're not on the rotation this week.</div>
      )}

      {dup?.exists && (
        <div className="mb-4 px-3 py-2.5 rounded-xl text-sm text-amber-300 flex items-center gap-2"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <span>⚠</span>
          <span>
            Possible duplicate — <strong>{agent.split('@')[0]}</strong> already has an evaluation for ticket <strong>{ticket}</strong>
            {dup.eval_date ? ` (${String(dup.eval_date).slice(0, 10)}` : ''}{dup.evaluator ? `, by ${dup.evaluator.split('@')[0]})` : dup.eval_date ? ')' : ''}.
            You can still submit if this is intentional.
          </span>
        </div>
      )}

      {/* Case metadata */}
      <div className="glass p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Agent</label>
          <SearchSelect value={agent} onChange={setAgent} allowFreeText
            placeholder="agent@example.com"
            options={agents.map(a => ({ value: a.email, label: a.email, sublabel: a.full_name ?? undefined }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team Lead <span className="text-slate-600">(auto)</span></label>
          <input readOnly value={selectedTl || '—'} title="Auto-filled from the agent's current team lead"
            className="form-control opacity-70 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ticket number</label>
          <input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="123456" className="form-control" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Channel</label>
          <select value={channel} onChange={e => setChannel(e.target.value)} className="form-control">
            <option>Chat</option><option>Call</option><option>Tickets</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Customer email</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="optional" className="form-control" />
        </div>
        {canSetQaDate && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              QA date <span className="text-slate-600">(when evaluated)</span>
            </label>
            <input type="date" value={qaDate} onChange={e => setQaDate(e.target.value)} className="form-control"
              onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }}
              title="The date this ticket was evaluated. Defaults to today — set it back if you're logging an earlier evaluation." />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Solved date</label>
          <input type="date" value={solvedDate} onChange={e => setSolvedDate(e.target.value)} className="form-control"
            onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }} />
        </div>
      </div>

      {/* Scorecard sections */}
      <div className="space-y-4">
        {sections.map(([section, items]) => (
          <div key={section} className="glass p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              {section}
              <span className="text-xs font-normal text-slate-500">
                {items.reduce((s, c) => s + c.weight, 0)} pts
              </span>
            </h3>
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
                    {/* Not applicable to the selected channel → locked N/A (no score impact). */}
                    {!applicable(c) ? (
                      <span className="pill pill-na opacity-60" title={`Not applicable to ${channel}`}>N/A · not {channel}</span>
                    ) : (
                      // allow_na controls whether N/A is offered; critical defaults to no-N/A.
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
        <div className="glass p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="mt-6 flex items-center gap-3">
        <button onClick={submit} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Submit evaluation →'}</button>
        <button onClick={() => router.push('/results')} className="btn btn-secondary">Cancel</button>
        <span className="text-sm text-slate-500 ml-auto">Final score: <span className={cn('font-bold', scoreColor(live.score))}>{live.score}%</span> · {live.total_errors} errors</span>
      </div>
    </div>
  )
}
