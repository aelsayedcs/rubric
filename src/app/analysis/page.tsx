'use client'
import { useEffect, useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SearchSelect } from '@/components/SearchSelect'
import { AgentDrawer } from '@/components/AgentDrawer'
import { TeamLeadDrawer } from '@/components/TeamLeadDrawer'
import { RecordsDrawer } from '@/components/RecordsDrawer'
import { Loading } from '@/components/Loading'
import { DATE_PRESETS, getPresetRange, type DatePreset } from '@/lib/dates'
import { scoreColor, cn } from '@/lib/utils'

interface Analysis {
  threshold: number
  kpis: { total: number; avgScore: number; criticalRate: number; coached: number; notCoached: number; needsCoaching: number; openDisputes: number }
  trend: { month: string; count: number; avgScore: number }[]
  agents: { key: string; evals: number; avgScore: number; criticalErrors: number; coachedPct: number; disputes: number }[]
  teamLeads: { key: string; evals: number; avgScore: number; coachedPct: number; disputeRate: number }[]
  channels: { key: string; evals: number; avgScore: number }[]
  coaching: { coached: number; notCoached: number; needsCoaching: number }
  mistakes: { label: string; section: string; fails: number }[]
}

export default function AnalysisPage() {
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const initial = getPresetRange('this_month')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [preset, setPreset] = useState<DatePreset | ''>('this_month')
  const [channel, setChannel] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [agent, setAgent] = useState('')
  const [tlOptions, setTlOptions] = useState<string[]>([])
  const [agentOptions, setAgentOptions] = useState<string[]>([])
  const [drawerAgent, setDrawerAgent] = useState<string | null>(null)
  const [drawerTl, setDrawerTl] = useState<string | null>(null)
  const [records, setRecords] = useState<{ title: string; subtitle: string; params: Record<string, string> } | null>(null)

  const filterParams = () => ({
    date_from: from, date_to: to, channel, team_lead: teamLead, agent,
  })

  function applyPreset(p: DatePreset | '') {
    setPreset(p)
    if (!p || p === 'custom') { if (!p) { setFrom(''); setTo('') } return }
    const r = getPresetRange(p)
    setFrom(r.from); setTo(r.to)
  }

  // Stable team-lead options for the filter (independent of the current filtered result).
  useEffect(() => {
    fetch('/api/lookups')
      .then(r => r.json())
      .then(d => {
        setTlOptions(Array.isArray(d.teamLeads) ? d.teamLeads : [])
        setAgentOptions(Array.isArray(d.agents) ? d.agents.map((a: { email: string }) => a.email) : [])
      })
      .catch(() => {})
  }, [])

  // Company-wide target (global scope) for the goal banner.
  const [target, setTarget] = useState<{ avg_score: number | null; max_critical_rate: number | null; min_coached_pct: number | null } | null>(null)
  useEffect(() => {
    fetch('/api/targets').then(r => r.ok ? r.json() : null).then(d => {
      const g = (d?.targets ?? []).find((t: { scope_type: string }) => t.scope_type === 'global')
      if (g) setTarget({ avg_score: g.avg_score, max_critical_rate: g.max_critical_rate, min_coached_pct: g.min_coached_pct })
    }).catch(() => {})
  }, [])

  // Coaching impact — avg score before vs after each agent's first coaching.
  const [impact, setImpact] = useState<{
    summary: { count: number; avgBefore: number; avgAfter: number; avgDelta: number; improved: number; declined: number }
    agents: { email: string; before: number; after: number; delta: number; evalsBefore: number; evalsAfter: number }[]
  } | null>(null)
  useEffect(() => {
    fetch('/api/coaching-impact').then(r => r.ok ? r.json() : null).then(d => { if (d) setImpact(d) }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    if (channel) p.set('channel', channel)
    if (teamLead) p.set('team_lead', teamLead)
    if (agent) p.set('agent', agent)
    fetch('/api/analysis?' + p.toString())
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed to load analytics'); return r.json() })
      .then(d => { setData(d); setError(''); setLoading(false) })
      .catch(e => { setData(null); setError(String(e.message ?? e)); setLoading(false) })
  }, [from, to, channel, teamLead, agent])
  useEffect(() => { load() }, [load])

  const activeCount = [from, to, channel, teamLead, agent].filter(Boolean).length
  const resetFilters = () => { applyPreset('this_month'); setChannel(''); setTeamLead(''); setAgent('') }

  return (
    <div className="page">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="section-title">Analysis</h1>
          <p className="section-subtitle">
            Everything in one place — agents, team leads, coaching, mistakes &amp; trends.
            {activeCount > 0 && <span className="ml-2 text-sky-400">· {activeCount} filter{activeCount > 1 ? 's' : ''} active</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={preset} onChange={e => applyPreset(e.target.value as DatePreset | '')} className="filter-select" style={{ minWidth: 140 }}>
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
            <span className="text-xs text-sky-400 font-mono">{from} → {to}</span>
          )}
          <select value={channel} onChange={e => setChannel(e.target.value)} className="filter-select">
            <option value="">All channels</option><option>Chat</option><option>Call</option><option>Tickets</option>
          </select>
          <SearchSelect value={teamLead} onChange={setTeamLead} className="w-44" inputClassName="filter-select"
            placeholder="All team leads" allLabel="All team leads"
            options={tlOptions.map(tl => ({ value: tl, label: tl.split('@')[0], sublabel: tl }))} />
          <SearchSelect value={agent} onChange={setAgent} className="w-44" inputClassName="filter-select"
            placeholder="All agents" allLabel="All agents"
            options={agentOptions.map(a => ({ value: a, label: a.split('@')[0], sublabel: a }))} />
          {activeCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2">
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Loading label="Loading analytics…" />
      ) : error || !data || !data.kpis ? (
        <div className="glass p-10 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <p className="text-slate-300 font-semibold">{error.includes('Forbidden') || error.includes('403') ? "You don't have access to Analysis" : 'Could not load analytics'}</p>
          <p className="text-slate-500 text-sm mt-1">{error || 'Please try again.'}</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Company target banner ──────────────────────────────────── */}
          {target && (target.avg_score != null || target.max_critical_rate != null || target.min_coached_pct != null) && (() => {
            const coachedPct = data.kpis.total ? Math.round(data.kpis.coached / data.kpis.total * 100) : 0
            const goals = [
              target.avg_score != null && { label: 'Avg score', actual: data.kpis.avgScore, target: target.avg_score, unit: '%', met: data.kpis.avgScore >= target.avg_score, dir: '≥' },
              target.max_critical_rate != null && { label: 'Critical rate', actual: data.kpis.criticalRate, target: target.max_critical_rate, unit: '%', met: data.kpis.criticalRate <= target.max_critical_rate, dir: '≤' },
              target.min_coached_pct != null && { label: 'Coaching coverage', actual: coachedPct, target: target.min_coached_pct, unit: '%', met: coachedPct >= target.min_coached_pct, dir: '≥' },
            ].filter(Boolean) as { label: string; actual: number; target: number; unit: string; met: boolean; dir: string }[]
            const allMet = goals.every(g => g.met)
            return (
              <div className={cn('glass p-4 ring-1', allMet ? 'ring-emerald-500/30' : 'ring-amber-500/30')}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-white">Company target</span>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', allMet ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
                    {allMet ? 'All goals met' : `${goals.filter(g => !g.met).length} below goal`}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {goals.map(g => (
                    <div key={g.label} className="kpi-card">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{g.label}</div>
                      <div className="flex items-baseline gap-2">
                        <span className={cn('text-2xl font-extrabold', g.met ? 'text-emerald-400' : 'text-red-400')}>{g.actual}{g.unit}</span>
                        <span className="text-[11px] text-slate-500">target {g.dir} {g.target}{g.unit}</span>
                      </div>
                      <div className={cn('text-[11px] font-semibold mt-0.5', g.met ? 'text-emerald-400' : 'text-red-400')}>
                        {g.met ? '✓ On target' : '✗ Off target'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── KPI header ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Evaluations" value={data.kpis.total} />
            <Kpi label="Avg score" value={`${data.kpis.avgScore}%`} cls={scoreColor(data.kpis.avgScore)} />
            <Kpi label="Critical rate" value={`${data.kpis.criticalRate}%`} cls="text-red-400" />
            <Kpi label="Coached" value={data.kpis.coached} cls="text-emerald-400" />
            <Kpi label="Needs coaching" value={data.kpis.needsCoaching} cls="text-amber-400" />
            <Kpi label="Open disputes" value={data.kpis.openDisputes} />
          </div>

          {/* ── Score trend ────────────────────────────────────────────── */}
          <div className="glass p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white">Score trend</h3>
              <p className="text-xs text-slate-500 mt-0.5">Average score per month over the selected range</p>
            </div>
            {data.trend.length === 0 ? (
              <p className="text-slate-500 text-sm py-10 text-center">No data in range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="avgScore" stroke="#38bdf8" strokeWidth={2} dot={false} name="Avg score" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Channels + Coaching ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Section title="By Channel" subtitle="Click a channel to see its evaluations">
                <Table head={['Channel', 'Evals', 'Avg score']}
                  rowKeys={data.channels.map(c => c.key)}
                  onRowClick={ch => setRecords({ title: ch, subtitle: 'Channel', params: { ...filterParams(), channel: ch } })}
                  rows={data.channels.map(c => [c.key, c.evals, <span key="s" className={scoreColor(c.avgScore)}>{c.avgScore}%</span>])} />
              </Section>
            </div>
            <div>
              <Section title="Coaching" subtitle="Click a card to see those evaluations">
                <div className="glass p-5 grid grid-cols-1 gap-3">
                  <button onClick={() => setRecords({ title: 'Coached', subtitle: 'Coaching', params: { ...filterParams(), bucket: 'coached' } })} className="text-left">
                    <Kpi label="Coached" value={data.coaching.coached} cls="text-emerald-400" /></button>
                  <button onClick={() => setRecords({ title: 'Not coached', subtitle: 'Coaching', params: { ...filterParams(), bucket: 'not_coached' } })} className="text-left">
                    <Kpi label="Not coached" value={data.coaching.notCoached} cls="text-slate-300" /></button>
                  <button onClick={() => setRecords({ title: 'Needs coaching', subtitle: 'Coaching', params: { ...filterParams(), bucket: 'needs' } })} className="text-left">
                    <Kpi label="Needs coaching" value={data.coaching.needsCoaching} cls="text-amber-400" /></button>
                </div>
              </Section>
            </div>
          </div>

          {/* ── Most-failed criteria ───────────────────────────────────── */}
          <div className="glass p-5 space-y-2">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-white">Most-failed criteria</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click a criterion to see the evaluations that failed it</p>
            </div>
            {data.mistakes.length === 0 ? <p className="text-slate-500 text-sm py-4">No failures in range.</p> :
              data.mistakes.slice(0, 20).map((m, i) => {
                const max = data.mistakes[0].fails
                return (
                  <div key={i}
                    onClick={() => setRecords({ title: m.label, subtitle: 'Failed criterion', params: { ...filterParams(), criterion: m.label } })}
                    className="flex items-center gap-3 cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-white/[0.04] transition-colors">
                    <div className="w-32 sm:w-64 text-sm text-slate-300 truncate" title={`${m.label} · ${m.section}`}>{m.label}</div>
                    <div className="flex-1 h-5 bg-white/5 rounded-md overflow-hidden">
                      <div className="h-full rounded-md" style={{ width: `${(m.fails / max) * 100}%`, background: 'linear-gradient(90deg,#ef4444,#f87171)' }} />
                    </div>
                    <div className="w-12 text-right text-sm font-semibold text-slate-300">{m.fails}</div>
                  </div>
                )
              })}
          </div>

          {/* ── Coaching impact ────────────────────────────────────────── */}
          {impact && impact.summary.count > 0 && (
            <Section title="Coaching impact" subtitle={`Average score before vs after each agent's first coaching · ${impact.summary.count} coached agents with data`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Kpi label="Avg before" value={`${impact.summary.avgBefore}%`} cls={scoreColor(impact.summary.avgBefore)} />
                <Kpi label="Avg after" value={`${impact.summary.avgAfter}%`} cls={scoreColor(impact.summary.avgAfter)} />
                <Kpi label="Avg change" value={`${impact.summary.avgDelta > 0 ? '+' : ''}${impact.summary.avgDelta} pts`} cls={impact.summary.avgDelta >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <Kpi label="Improved / declined" value={`${impact.summary.improved} / ${impact.summary.declined}`} />
              </div>
              <Table head={['Agent', 'Before', 'After', 'Change', 'Evals (b/a)']}
                rows={impact.agents.slice(0, 25).map(a => [
                  a.email.split('@')[0],
                  <span key="b" className={scoreColor(a.before)}>{a.before}%</span>,
                  <span key="af" className={scoreColor(a.after)}>{a.after}%</span>,
                  <span key="d" className={a.delta >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{a.delta > 0 ? '+' : ''}{a.delta} pts</span>,
                  <span key="n" className="text-slate-500">{a.evalsBefore} / {a.evalsAfter}</span>,
                ])} />
            </Section>
          )}

          {/* ── Team Lead breakdown ────────────────────────────────────── */}
          <Section title="Team Lead Breakdown" subtitle="Click a team lead to see their agents & records">
            <Table head={['Team Lead', 'Evals', 'Avg score', 'Coached %', 'Dispute %']}
              rowKeys={data.teamLeads.map(t => t.key)}
              onRowClick={setDrawerTl}
              rows={data.teamLeads.map(t => [
                t.key.split('@')[0], t.evals,
                <span key="s" className={scoreColor(t.avgScore)}>{t.avgScore}%</span>,
                `${t.coachedPct}%`, `${t.disputeRate}%`,
              ])} />
          </Section>

          {/* ── Agent leaderboard ──────────────────────────────────────── */}
          <Section title="Agent Leaderboard" subtitle={`${data.agents.length} agents · click a row for their records`}>
            <Table head={['Agent', 'Evals', 'Avg score', 'Critical', 'Coached %', 'Disputes']}
              rowKeys={data.agents.map(a => a.key)}
              onRowClick={setDrawerAgent}
              rows={data.agents.map(a => [
                <span key="a" className="text-sky-400">{a.key.split('@')[0]}</span>,
                a.evals,
                <span key="s" className={scoreColor(a.avgScore)}>{a.avgScore}%</span>,
                a.criticalErrors, `${a.coachedPct}%`, a.disputes,
              ])} />
          </Section>

        </div>
      )}

      {drawerTl && (
        <TeamLeadDrawer email={drawerTl} from={from} to={to} channel={channel}
          onClose={() => setDrawerTl(null)}
          onAgent={a => { setDrawerTl(null); setDrawerAgent(a) }} />
      )}
      {drawerAgent && (
        <AgentDrawer email={drawerAgent} onClose={() => setDrawerAgent(null)} />
      )}
      {records && (
        <RecordsDrawer title={records.title} subtitle={records.subtitle} params={records.params} onClose={() => setRecords(null)} />
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Kpi({ label, value, cls }: { label: string; value: string | number; cls?: string }) {
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={cn('text-2xl font-extrabold', cls ?? 'text-white')}>{value}</div>
    </div>
  )
}

function Table({ head, rows, rowKeys, onRowClick }: {
  head: string[]; rows: React.ReactNode[][]
  rowKeys?: string[]; onRowClick?: (key: string) => void
}) {
  const clickable = !!(onRowClick && rowKeys)
  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={head.length} className="text-center text-slate-500 py-8">No data.</td></tr> :
              rows.map((r, i) => (
                <tr key={i}
                  onClick={clickable ? () => onRowClick!(rowKeys![i]) : undefined}
                  className={clickable ? 'cursor-pointer hover:bg-white/[0.03] transition-colors' : ''}>
                  {r.map((c, j) => <td key={j}>{c}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
