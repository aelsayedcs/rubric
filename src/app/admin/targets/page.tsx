'use client'
import { useEffect, useState, useCallback } from 'react'
import { Loading } from '@/components/Loading'
import { cn } from '@/lib/utils'

interface Target {
  scope_type: 'global' | 'team_lead' | 'agent'
  scope_value: string | null
  avg_score: number | null
  max_critical_rate: number | null
  min_coached_pct: number | null
  updated_at?: string
}
const blank = { avg_score: '', max_critical_rate: '', min_coached_pct: '' }

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([])
  const [agents, setAgents] = useState<string[]>([])
  const [teamLeads, setTeamLeads] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // override editor
  const [scopeType, setScopeType] = useState<'team_lead' | 'agent'>('team_lead')
  const [scopeValue, setScopeValue] = useState('')
  const [form, setForm] = useState(blank)
  const [globalForm, setGlobalForm] = useState(blank)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/targets').then(r => r.json()),
      fetch('/api/lookups').then(r => r.json()),
    ]).then(([t, l]) => {
      const ts: Target[] = t.targets ?? []
      setTargets(ts)
      setAgents((l.agents ?? []).map((a: { email: string }) => a.email))
      setTeamLeads(l.teamLeads ?? [])
      const g = ts.find(x => x.scope_type === 'global')
      setGlobalForm({
        avg_score: g?.avg_score?.toString() ?? '', max_critical_rate: g?.max_critical_rate?.toString() ?? '',
        min_coached_pct: g?.min_coached_pct?.toString() ?? '',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function save(body: object, ok: string) {
    setMsg('')
    const res = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Failed'); return }
    setMsg(ok); load()
  }
  async function remove(t: Target) {
    if (!window.confirm(`Remove target for ${t.scope_value}?`)) return
    const p = new URLSearchParams({ scope_type: t.scope_type, scope_value: t.scope_value ?? '' })
    await fetch('/api/targets?' + p.toString(), { method: 'DELETE' })
    load()
  }

  const overrides = targets.filter(t => t.scope_type !== 'global')
  const fmt = (v: number | null) => v === null ? '—' : `${v}%`

  if (loading) return <div className="page"><Loading /></div>

  return (
    <div className="page max-w-3xl">
      <div className="mb-5">
        <h1 className="section-title">Targets &amp; Goals</h1>
        <p className="section-subtitle">Set QA goals. The most specific target applies to each agent: agent → team lead → company.</p>
      </div>
      {msg && <div className="glass p-2 mb-4 text-xs text-sky-300">{msg}</div>}

      {/* Global */}
      <div className="glass p-5 mb-5">
        <h3 className="text-sm font-bold text-white mb-3">Company-wide target</h3>
        <Fields form={globalForm} setForm={setGlobalForm} />
        <button onClick={() => save({ scope_type: 'global', ...numify(globalForm) }, 'Company target saved')}
          className="btn btn-primary text-xs mt-3">Save company target</button>
      </div>

      {/* Add override */}
      <div className="glass p-5 mb-5">
        <h3 className="text-sm font-bold text-white mb-3">Add / update an override</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={scopeType} onChange={e => { setScopeType(e.target.value as 'team_lead' | 'agent'); setScopeValue('') }} className="filter-select">
            <option value="team_lead">Team lead</option>
            <option value="agent">Agent</option>
          </select>
          <select value={scopeValue} onChange={e => setScopeValue(e.target.value)} className="filter-select flex-1 min-w-[220px]">
            <option value="">Select {scopeType === 'team_lead' ? 'team lead' : 'agent'}…</option>
            {(scopeType === 'team_lead' ? teamLeads : agents).map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <Fields form={form} setForm={setForm} />
        <button disabled={!scopeValue}
          onClick={() => save({ scope_type: scopeType, scope_value: scopeValue, ...numify(form) }, 'Override saved').then(() => { setForm(blank); setScopeValue('') })}
          className="btn btn-primary text-xs mt-3 disabled:opacity-40">Save override</button>
      </div>

      {/* Existing overrides */}
      <div className="glass overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06]"><h3 className="text-sm font-bold text-white">Overrides ({overrides.length})</h3></div>
        <table className="data-table">
          <thead><tr><th>Scope</th><th>Who</th><th>Avg ≥</th><th>Critical ≤</th><th>Coached ≥</th><th></th></tr></thead>
          <tbody>
            {overrides.length === 0 ? <tr><td colSpan={6} className="text-center text-slate-500 py-6">No overrides — everyone uses the company target.</td></tr> :
              overrides.map(t => (
                <tr key={`${t.scope_type}:${t.scope_value}`}>
                  <td className="text-slate-400">{t.scope_type === 'team_lead' ? 'Team lead' : 'Agent'}</td>
                  <td className="text-slate-200">{t.scope_value}</td>
                  <td>{fmt(t.avg_score)}</td><td>{fmt(t.max_critical_rate)}</td><td>{fmt(t.min_coached_pct)}</td>
                  <td className="text-right">
                    <button onClick={() => remove(t)} className="btn btn-ghost text-xs py-1 text-red-400">Delete</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function numify(f: typeof blank) {
  return { avg_score: f.avg_score, max_critical_rate: f.max_critical_rate, min_coached_pct: f.min_coached_pct }
}

function Fields({ form, setForm }: { form: typeof blank; setForm: (f: typeof blank) => void }) {
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Field label="Min avg score %" value={form.avg_score} onChange={set('avg_score')} />
      <Field label="Max critical rate %" value={form.max_critical_rate} onChange={set('max_critical_rate')} />
      <Field label="Min coaching coverage %" value={form.min_coached_pct} onChange={set('min_coached_pct')} />
    </div>
  )
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <input type="number" min={0} max={100} value={value} onChange={onChange} placeholder="—"
        className={cn('filter-select w-full mt-1')} />
    </label>
  )
}
