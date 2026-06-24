'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { Loading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'
import { EvalDetailDrawer } from '@/components/EvalDetailDrawer'

interface Profile {
  agent: { email: string; full_name: string | null; team_lead_email: string | null; active: boolean | null }
  kpis: { total: number; avgScore: number; criticalErrors: number; coached: number; needsCoaching: number; disputes: number; coachedPct: number }
  recent: { id: string; ticket_number: string; channel: string; score: number; total_critical_errors: number; coached: boolean; disputed: boolean; eval_date: string }[]
}

// DSAT-style slide-over: agent KPIs + their recent evaluations.
export function AgentDrawer({ email, onClose }: { email: string; onClose: () => void }) {
  const [data, setData] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agents/${encodeURIComponent(email)}`).then(r => r.json())
      .then(d => { setData(d?.agent ? d : null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [email])

  const k = data?.kpis
  return (
    <>
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-2xl h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <p className="text-lg font-bold text-white">{email.split('@')[0]}</p>
            <p className="text-xs text-slate-500 mt-0.5">{email}</p>
            {data?.agent.team_lead_email && <p className="text-xs text-sky-400 mt-1">Team Lead: {data.agent.team_lead_email.split('@')[0]}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/agent/${encodeURIComponent(email)}`} className="text-xs text-sky-400 hover:text-sky-300 whitespace-nowrap">Full profile →</Link>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        {loading ? <Loading /> : !data ? (
          <div className="p-10 text-center text-slate-500 text-sm">No data for this agent.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-white/[0.06] border-b border-white/[0.06]">
              {[
                { label: 'Evals', value: k!.total, color: '#38bdf8' },
                { label: 'Avg', value: `${k!.avgScore}%`, color: k!.avgScore >= 90 ? '#34d399' : k!.avgScore >= 85 ? '#fbbf24' : '#f87171' },
                { label: 'Critical', value: k!.criticalErrors, color: '#f87171' },
                { label: 'Coached', value: `${k!.coachedPct}%`, color: '#34d399' },
                { label: 'Needs', value: k!.needsCoaching, color: '#fbbf24' },
                { label: 'Disputes', value: k!.disputes, color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="px-3 py-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold font-mono mt-1" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: '#0f172a' }}>
                  <tr>{['Date', 'Ticket', 'Channel', 'Score', 'Flags'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {data.recent.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-slate-600 py-10">No evaluations.</td></tr>
                  ) : data.recent.map((r, i) => (
                    <tr key={r.id} onClick={() => setDetailId(r.id)}
                      className="cursor-pointer hover:bg-white/[0.05] transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(r.eval_date)}</td>
                      <td className="px-4 py-2.5 text-slate-300"><TicketLink ticket={r.ticket_number} className="text-slate-300" /></td>
                      <td className="px-4 py-2.5 text-slate-400">{r.channel}</td>
                      <td className="px-4 py-2.5"><span className={cn('font-bold', scoreColor(Number(r.score)))}>{r.score}%</span></td>
                      <td className="px-4 py-2.5">
                        {r.total_critical_errors > 0 && <span className="badge badge-critical mr-1">critical</span>}
                        {r.coached && <span className="badge badge-validated mr-1">coached</span>}
                        {r.disputed && <span className="badge badge-not-validated">disputed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
    {detailId && <EvalDetailDrawer evaluationId={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
