'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { Loading } from '@/components/Loading'
import { EvalDetailDrawer } from '@/components/EvalDetailDrawer'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { TicketLink } from '@/components/TicketLink'
import { DATE_PRESETS, getPresetRange, type DatePreset } from '@/lib/dates'

type Gran = 'week' | 'month' | 'quarter'
interface PeriodStat { period: string; count: number; avgScore: number; critical: number }
interface Comparison {
  granularity: Gran
  current: PeriodStat; previous: PeriodStat
  deltas: { avgScore: number; count: number; critical: number }
}
interface Target { scope: string; avgScore: number | null; maxCriticalRate: number | null; minCoachedPct: number | null }
interface Profile {
  agent: { email: string; full_name: string | null; team_lead_email: string | null; active: boolean | null }
  threshold: number
  kpis: { total: number; avgScore: number; criticalErrors: number; criticalRate: number; coached: number; needsCoaching: number; disputes: number; coachedPct: number }
  target: Target | null
  granularity: Gran
  trend: { key: string; month: string; count: number; avgScore: number; critical: number }[]
  comparison: Comparison | null
  mistakes: { label: string; fails: number }[]
  recent: { id: string; ticket_number: string; channel: string; score: number; total_critical_errors: number; coached: boolean; disputed: boolean; eval_date: string }[]
}

const GRAN_LABEL: Record<Gran, { unit: string; over: string }> = {
  week: { unit: 'Week', over: 'WoW' }, month: { unit: 'Month', over: 'MoM' }, quarter: { unit: 'Quarter', over: 'QoQ' },
}

export default function AgentProfilePage() {
  const { email } = useParams<{ email: string }>()
  const router = useRouter()
  const [data, setData] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  // Filters
  const [preset, setPreset] = useState<DatePreset | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [channel, setChannel] = useState('')
  const [gran, setGran] = useState<Gran>('month')

  function applyPreset(p: DatePreset | '') {
    setPreset(p)
    if (!p || p === 'custom') { if (!p) { setFrom(''); setTo('') } return }
    const r = getPresetRange(p); setFrom(r.from); setTo(r.to)
  }

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (channel) p.set('channel', channel)
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    p.set('granularity', gran)
    fetch(`/api/agents/${encodeURIComponent(email)}?` + p.toString())
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e.message ?? e)); setLoading(false) })
  }, [email, channel, from, to, gran])

  useEffect(() => { load() }, [load])

  if (loading && !data) return <div className="page"><Loading /></div>
  if (error || !data) return <div className="page"><div className="glass p-10 text-center text-slate-400">{error || 'Not found'}</div></div>

  const k = data.kpis
  return (
    <div className="page">
      <button onClick={() => router.back()} className="text-xs text-slate-500 hover:text-sky-400 mb-3">← Back</button>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="section-title">{data.agent.email.split('@')[0]}</h1>
          <p className="section-subtitle">
            {data.agent.email}
            {data.agent.team_lead_email && <span className="ml-2 text-sky-400">· TL: {data.agent.team_lead_email.split('@')[0]}</span>}
            {data.agent.active === false && <span className="ml-2 text-slate-500">· archived</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass p-3 mb-5 flex flex-wrap items-center gap-2">
        <select value={preset} onChange={e => applyPreset(e.target.value as DatePreset | '')} className="filter-select">
          <option value="">All time</option>
          {DATE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset('custom') }} className="filter-select" />
        <span className="text-slate-600 text-xs">→</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset('custom') }} className="filter-select" />
        <select value={channel} onChange={e => setChannel(e.target.value)} className="filter-select">
          <option value="">All channels</option><option>Chat</option><option>Call</option><option>Tickets</option>
        </select>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">Breakdown</span>
          {(['week', 'month', 'quarter'] as Gran[]).map(g => (
            <button key={g} onClick={() => setGran(g)}
              className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-colors',
                gran === g ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40' : 'text-slate-400 hover:text-white')}>
              {GRAN_LABEL[g].unit}
            </button>
          ))}
        </div>
      </div>

      {/* Period-over-period comparison */}
      {data.comparison && (
        <div className="glass p-4 mb-5">
          <h3 className="text-sm font-bold text-white mb-3">
            {GRAN_LABEL[data.comparison.granularity].over} · {data.comparison.current.period}
            <span className="text-slate-500 font-normal"> vs {data.comparison.previous.period}</span>
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <CompareStat label="Avg score" cur={`${data.comparison.current.avgScore}%`} delta={data.comparison.deltas.avgScore} suffix="pts" goodUp />
            <CompareStat label="Evaluations" cur={String(data.comparison.current.count)} delta={data.comparison.deltas.count} />
            <CompareStat label="Critical" cur={String(data.comparison.current.critical)} delta={data.comparison.deltas.critical} goodUp={false} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Evaluations" value={k.total} />
        <Kpi label="Avg score" value={`${k.avgScore}%`} cls={scoreColor(k.avgScore)} />
        <Kpi label="Critical" value={k.criticalErrors} cls="text-red-400" />
        <Kpi label="Coached" value={`${k.coachedPct}%`} cls="text-emerald-400" />
        <Kpi label="Needs coaching" value={k.needsCoaching} cls="text-amber-400" />
        <Kpi label="Disputes" value={k.disputes} />
      </div>

      {/* Targets vs actual */}
      {data.target && (data.target.avgScore !== null || data.target.maxCriticalRate !== null || data.target.minCoachedPct !== null) && (
        <div className="glass p-4 mb-5">
          <h3 className="text-sm font-bold text-white mb-3">
            Targets <span className="text-slate-500 font-normal text-xs">· {data.target.scope === 'agent' ? 'agent-specific' : data.target.scope === 'team_lead' ? 'team' : 'company'} goal</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.target.avgScore !== null && (
              <TargetStat label="Avg score" actual={k.avgScore} target={data.target.avgScore} unit="%" goodWhenAtLeast />
            )}
            {data.target.maxCriticalRate !== null && (
              <TargetStat label="Critical rate" actual={k.criticalRate} target={data.target.maxCriticalRate} unit="%" goodWhenAtLeast={false} />
            )}
            {data.target.minCoachedPct !== null && (
              <TargetStat label="Coaching coverage" actual={k.coachedPct} target={data.target.minCoachedPct} unit="%" goodWhenAtLeast />
            )}
          </div>
        </div>
      )}

      <div className="glass p-5 mb-5">
        <h3 className="text-sm font-bold text-white mb-4">Score trend</h3>
        {data.trend.length === 0 ? <p className="text-slate-500 text-sm py-8 text-center">No data.</p> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
              {data.target?.avgScore != null && (
                <ReferenceLine y={data.target.avgScore} stroke="#22c55e" strokeDasharray="4 4"
                  label={{ value: `Target ${data.target.avgScore}%`, position: 'insideTopRight', fill: '#22c55e', fontSize: 11 }} />
              )}
              <Line type="monotone" dataKey="avgScore" stroke="#38bdf8" strokeWidth={2} dot={false} name="Avg score" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass p-5 space-y-2">
          <h3 className="text-sm font-bold text-white mb-3">Most-failed criteria</h3>
          {data.mistakes.length === 0 ? <p className="text-slate-500 text-sm">No failures.</p> :
            data.mistakes.slice(0, 12).map((m, i) => {
              const max = data.mistakes[0].fails
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-slate-300 truncate" title={m.label}>{m.label}</div>
                  <div className="w-28 h-4 bg-white/5 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(m.fails / max) * 100}%`, background: 'linear-gradient(90deg,#ef4444,#f87171)' }} />
                  </div>
                  <div className="w-8 text-right text-sm font-semibold text-slate-300">{m.fails}</div>
                </div>
              )
            })}
        </div>

        <div className="glass overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]"><h3 className="text-sm font-bold text-white">Recent evaluations</h3></div>
          <div className="overflow-x-auto" style={{ maxHeight: 360 }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Ticket</th><th>Channel</th><th>Score</th></tr></thead>
              <tbody>
                {data.recent.length === 0 ? <tr><td colSpan={4} className="text-center text-slate-500 py-6">No evaluations.</td></tr> :
                  data.recent.map(r => (
                    <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-white/[0.03] transition-colors">
                      <td className="text-slate-500 text-xs">{formatDate(r.eval_date)}</td>
                      <td><TicketLink ticket={r.ticket_number} className="text-slate-300" /></td>
                      <td className="text-slate-400">{r.channel}</td>
                      <td><span className={cn('font-bold', scoreColor(Number(r.score)))}>{r.score}%</span>
                        {r.total_critical_errors > 0 && <span className="badge badge-critical ml-2">critical</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailId && <EvalDetailDrawer evaluationId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// Actual vs target with a met/missed badge. goodWhenAtLeast=true → higher is
// better (score, coverage); false → lower is better (critical rate).
function TargetStat({ label, actual, target, unit, goodWhenAtLeast }: {
  label: string; actual: number; target: number; unit: string; goodWhenAtLeast: boolean
}) {
  const met = goodWhenAtLeast ? actual >= target : actual <= target
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-extrabold', met ? 'text-emerald-400' : 'text-red-400')}>{actual}{unit}</span>
        <span className="text-[11px] text-slate-500">{goodWhenAtLeast ? 'target ≥' : 'target ≤'} {target}{unit}</span>
      </div>
      <div className={cn('text-[11px] font-semibold mt-0.5', met ? 'text-emerald-400' : 'text-red-400')}>
        {met ? '✓ On target' : `✗ ${goodWhenAtLeast ? `${(target - actual).toFixed(0)}${unit} below` : `${(actual - target).toFixed(0)}${unit} over`}`}
      </div>
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

// One metric in the period-over-period card: current value + signed delta vs the
// previous period, coloured by whether the movement is good. `goodUp` flips the
// colour meaning (e.g. fewer critical errors is good, so goodUp={false}).
function CompareStat({ label, cur, delta, suffix = '', goodUp = true }: {
  label: string; cur: string; delta: number; suffix?: string; goodUp?: boolean
}) {
  const flat = delta === 0
  const good = goodUp ? delta > 0 : delta < 0
  const color = flat ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-red-400'
  const arrow = flat ? '→' : delta > 0 ? '▲' : '▼'
  const sign = delta > 0 ? '+' : ''
  return (
    <div className="kpi-card">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-extrabold text-white">{cur}</div>
      <div className={cn('text-xs font-semibold mt-0.5', color)}>{arrow} {sign}{delta}{suffix && ` ${suffix}`}</div>
    </div>
  )
}
