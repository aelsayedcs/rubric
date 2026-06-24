'use client'
import { useEffect, useState } from 'react'
import { scoreColor, formatDate, cn } from '@/lib/utils'
import { Loading } from '@/components/Loading'
import { TicketLink } from '@/components/TicketLink'
import { EvalDetailDrawer } from '@/components/EvalDetailDrawer'

interface EvalRow {
  id: string; ticket_number: string; agent_email: string; channel: string
  score: number; total_critical_errors: number; coached: boolean; eval_date: string
}

// Generic drill-down list of evaluations behind an analysis section.
export function RecordsDrawer({ title, subtitle, params, onClose }: {
  title: string; subtitle: string; params: Record<string, string>; onClose: () => void
}) {
  const [rows, setRows] = useState<EvalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
    fetch('/api/evaluations/records?' + p.toString()).then(r => r.json())
      .then(d => { setRows(d.evaluations ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="drawer w-full max-w-2xl h-full overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{subtitle}</p>
            <h2 className="text-base font-bold text-white mt-0.5">{title}</h2>
            {!loading && <p className="text-xs text-slate-500 mt-0.5">{rows.length} evaluation{rows.length !== 1 ? 's' : ''} · click a row for details</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {loading ? <Loading /> : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-600 text-sm">No evaluations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: '#0f172a' }}>
                <tr>{['Date', 'Ticket', 'Agent', 'Channel', 'Score'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className="cursor-pointer hover:bg-white/[0.04] transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(r.eval_date)}</td>
                    <td className="px-4 py-2.5 text-slate-300"><TicketLink ticket={r.ticket_number} className="text-slate-300" /></td>
                    <td className="px-4 py-2.5 text-slate-400 max-w-[140px] truncate" title={r.agent_email}>{r.agent_email?.split('@')[0]}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.channel}</td>
                    <td className="px-4 py-2.5"><span className={cn('font-bold', scoreColor(Number(r.score)))}>{r.score}%</span>
                      {r.total_critical_errors > 0 && <span className="badge badge-critical ml-2">critical</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    {detailId && <EvalDetailDrawer evaluationId={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
