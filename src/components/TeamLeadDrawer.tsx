'use client'
import { useEffect, useState } from 'react'
import { scoreColor, cn } from '@/lib/utils'
import { Loading } from '@/components/Loading'

interface Resp {
  kpis: { total: number; avgScore: number; criticalRate: number; coached: number; needsCoaching: number; openDisputes: number }
  agents: { key: string; evals: number; avgScore: number; criticalErrors: number; coachedPct: number; disputes: number }[]
}

// Slide-over for a team lead: their KPIs + per-agent breakdown (respects active filters).
export function TeamLeadDrawer({ email, from, to, channel, onClose, onAgent }: {
  email: string; from: string; to: string; channel: string
  onClose: () => void; onAgent: (agentEmail: string) => void
}) {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams({ team_lead: email })
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    if (channel) p.set('channel', channel)
    fetch('/api/analysis?' + p.toString()).then(r => r.json())
      .then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [email, from, to, channel])

  const k = data?.kpis
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-2xl h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Team Lead</p>
            <p className="text-lg font-bold text-white">{email.split('@')[0]}</p>
            <p className="text-xs text-slate-500 mt-0.5">{email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {loading ? <Loading /> : !k ? (
          <div className="p-10 text-center text-slate-500 text-sm">No data.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-white/[0.06] border-b border-white/[0.06]">
              {[
                { label: 'Evals', value: k.total, color: '#38bdf8' },
                { label: 'Avg', value: `${k.avgScore}%`, color: k.avgScore >= 90 ? '#34d399' : k.avgScore >= 85 ? '#fbbf24' : '#f87171' },
                { label: 'Critical%', value: `${k.criticalRate}%`, color: '#f87171' },
                { label: 'Coached', value: k.coached, color: '#34d399' },
                { label: 'Needs', value: k.needsCoaching, color: '#fbbf24' },
                { label: 'Disputes', value: k.openDisputes, color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="px-3 py-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold font-mono mt-1" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-b border-white/[0.06]">
              <p className="text-sm font-semibold text-white">{data!.agents.length} agents · click one for their records</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: '#0f172a' }}>
                  <tr>{['Agent', 'Evals', 'Avg', 'Critical', 'Coached%', 'Disputes'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {data!.agents.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-slate-600 py-10">No agents.</td></tr>
                  ) : data!.agents.map((a, i) => (
                    <tr key={a.key} onClick={() => onAgent(a.key)}
                      className="cursor-pointer hover:bg-white/[0.04] transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td className="px-4 py-2.5 text-sky-400">{a.key.split('@')[0]}</td>
                      <td className="px-4 py-2.5 font-mono text-white">{a.evals}</td>
                      <td className="px-4 py-2.5"><span className={cn('font-bold', scoreColor(a.avgScore))}>{a.avgScore}%</span></td>
                      <td className="px-4 py-2.5 text-red-400">{a.criticalErrors}</td>
                      <td className="px-4 py-2.5 text-slate-400">{a.coachedPct}%</td>
                      <td className="px-4 py-2.5 text-slate-400">{a.disputes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
