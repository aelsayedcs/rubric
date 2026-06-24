'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loading } from '@/components/Loading'
import { DATE_PRESETS, getPresetRange, type DatePreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

type Severity = 'high' | 'medium' | 'positive' | 'info'
interface Insight {
  id: string; severity: Severity; icon: string; category: string
  title: string; detail: string; action?: string; link?: string; linkLabel?: string
  agents?: { email: string; label: string }[]
}
interface InsightsResp { period: { from: string; to: string }; threshold: number; total: number; insights: Insight[] }

const SEV: Record<Severity, { label: string; ring: string; chip: string; bar: string }> = {
  high:     { label: 'Action needed', ring: 'ring-red-500/30',     chip: 'bg-red-500/15 text-red-300',       bar: '#ef4444' },
  medium:   { label: 'Watch',         ring: 'ring-amber-500/30',   chip: 'bg-amber-500/15 text-amber-300',   bar: '#f59e0b' },
  positive: { label: 'Good',          ring: 'ring-emerald-500/30', chip: 'bg-emerald-500/15 text-emerald-300', bar: '#10b981' },
  info:     { label: 'Info',          ring: 'ring-sky-500/20',     chip: 'bg-sky-500/15 text-sky-300',        bar: '#38bdf8' },
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const initial = getPresetRange('last30')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [preset, setPreset] = useState<DatePreset | ''>('last30')
  const [channel, setChannel] = useState('')

  function applyPreset(p: DatePreset | '') {
    setPreset(p)
    if (!p || p === 'custom') { if (!p) { setFrom(''); setTo('') } return }
    const r = getPresetRange(p); setFrom(r.from); setTo(r.to)
  }

  const load = useCallback(() => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    if (channel) p.set('channel', channel)
    fetch('/api/insights?' + p.toString())
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? 'Failed'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e.message ?? e)); setLoading(false) })
  }, [from, to, channel])
  useEffect(() => { load() }, [load])

  const counts = data ? data.insights.reduce((a, i) => { a[i.severity] = (a[i.severity] ?? 0) + 1; return a }, {} as Record<string, number>) : {}

  return (
    <div className="page">
      <div className="mb-4">
        <h1 className="section-title">Insights</h1>
        <p className="section-subtitle">Automated QA recommendations from your evaluation data</p>
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
        <button onClick={load} className="btn btn-secondary text-xs ml-auto">Refresh</button>
      </div>

      {loading ? <Loading /> : error ? (
        <div className="glass p-10 text-center text-slate-400">{error}</div>
      ) : data && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-slate-400">
            <span>{data.total.toLocaleString()} evaluations · target {data.threshold}%</span>
            <span className="text-slate-600">·</span>
            {(['high', 'medium', 'positive', 'info'] as Severity[]).filter(s => counts[s]).map(s => (
              <span key={s} className={cn('px-2 py-0.5 rounded-full font-semibold', SEV[s].chip)}>{counts[s]} {SEV[s].label}</span>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.insights.map(ins => (
              <div key={ins.id} className={cn('glass p-4 relative overflow-hidden ring-1', SEV[ins.severity].ring)}>
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: SEV[ins.severity].bar }} />
                <div className="pl-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg leading-none">{ins.icon}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{ins.category}</span>
                    <span className={cn('ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full', SEV[ins.severity].chip)}>{SEV[ins.severity].label}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white leading-snug">{ins.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{ins.detail}</p>
                  {ins.agents && ins.agents.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ins.agents.map(a => (
                        <Link key={a.email} href={`/agent/${encodeURIComponent(a.email)}`}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
                          {a.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {ins.action && (
                    <p className="text-xs text-slate-300 mt-2"><span className="text-slate-500">→ </span>{ins.action}</p>
                  )}
                  {ins.link && (
                    <Link href={ins.link} className="inline-block mt-2 text-xs font-semibold text-sky-400 hover:text-sky-300">{ins.linkLabel ?? 'View →'}</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
