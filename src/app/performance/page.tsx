'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Probe { name: string; path: string }
interface Result { name: string; ms: number; ok: boolean; status: number; note?: string }

const PROBES: Probe[] = [
  { name: 'Analysis (aggregated)', path: '/api/analysis' },
  { name: 'Evaluations (first page)', path: '/api/evaluations?limit=50' },
  { name: 'Lookups', path: '/api/lookups' },
  { name: 'Team', path: '/api/team?all=1' },
  { name: 'Disputes', path: '/api/disputes' },
]

const tone = (ms: number) => ms < 800 ? '#34d399' : ms < 2500 ? '#fbbf24' : '#f87171'

export default function PerformancePage() {
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const [ranAt, setRanAt] = useState('')

  async function runAll() {
    setRunning(true); setResults([])
    const out: Result[] = []
    for (const p of PROBES) {
      const t0 = performance.now()
      try {
        const r = await fetch(p.path, { cache: 'no-store' })
        const ms = Math.round(performance.now() - t0)
        let note = ''
        try {
          const j = await r.json()
          if (Array.isArray(j?.evaluations)) note = `${j.evaluations.length} rows`
          else if (Array.isArray(j)) note = `${j.length} rows`
          else if (j?.kpis) note = `${j.kpis.total} evals aggregated`
        } catch { /* ignore */ }
        out.push({ name: p.name, ms, ok: r.ok, status: r.status, note })
      } catch {
        out.push({ name: p.name, ms: Math.round(performance.now() - t0), ok: false, status: 0, note: 'network error' })
      }
      setResults([...out])
    }
    setRanAt(new Date().toLocaleTimeString())
    setRunning(false)
  }

  return (
    <div className="page">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="section-title">Performance</h1>
          <p className="section-subtitle">Live API response times. Analysis now aggregates in Postgres — expect it well under a second once warm.</p>
        </div>
        <button onClick={runAll} disabled={running} className="btn btn-primary">{running ? 'Running…' : 'Run all tests'}</button>
      </div>

      <div className="glass overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Endpoint</th><th>Status</th><th>Result</th><th className="text-right">Response time</th></tr></thead>
          <tbody>
            {results.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-slate-500 py-10">Click “Run all tests”.</td></tr>
            ) : results.map(r => (
              <tr key={r.name}>
                <td className="text-slate-200 text-sm">{r.name}</td>
                <td>
                  <span className={cn('badge', r.ok ? 'badge-validated' : 'badge-critical')}>
                    {r.status || 'ERR'}
                  </span>
                </td>
                <td className="text-slate-500 text-xs">{r.note ?? '—'}</td>
                <td className="text-right font-mono font-bold" style={{ color: tone(r.ms) }}>{r.ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ranAt && <p className="text-xs text-slate-600 mt-3">Last run {ranAt} · green &lt;0.8s · amber &lt;2.5s · red slower. First run after idle includes cold-start.</p>}
    </div>
  )
}
