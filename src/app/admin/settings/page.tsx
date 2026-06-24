'use client'
import { useEffect, useState, useCallback } from 'react'
import { formatDateTime } from '@/lib/utils'
import { InlineLoading } from '@/components/Loading'

interface Setting { key: string; value: string | null; updated_at: string }

// Known settings get a friendly label + hint; unknown keys still render generically.
const KNOWN: Record<string, { label: string; hint: string }> = {
  coaching_threshold: { label: 'Coaching threshold', hint: 'Score below this (or any critical error) flags an evaluation as “needs coaching”.' },
}

export default function SettingsPage() {
  const [rows, setRows] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/settings').then(async r => {
      if (r.status === 403) { setForbidden(true); setLoading(false); return null }
      return r.json()
    }).then(d => {
      if (!d) return
      setRows(d.settings ?? [])
      setEdits(Object.fromEntries((d.settings ?? []).map((s: Setting) => [s.key, s.value ?? ''])))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function save(key: string, value: string) {
    setSavingKey(key)
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    setSavingKey('')
    if (key === newKey) { setNewKey(''); setNewVal('') }
    await load()
  }

  if (forbidden) return <div className="page"><div className="glass p-10 text-center text-slate-400">Admins only.</div></div>

  // Ensure coaching_threshold is always shown even if not yet stored.
  const keys = Array.from(new Set([...Object.keys(KNOWN), ...rows.map(r => r.key)]))

  return (
    <div className="page">
      <div className="mb-5">
        <h1 className="section-title">Settings</h1>
        <p className="section-subtitle">Quality app configuration. Changes take effect immediately.</p>
      </div>

      <div className="glass overflow-hidden mb-5">
        <table className="data-table">
          <thead><tr><th>Setting</th><th>Value</th><th>Updated</th><th className="text-right">Action</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4}><InlineLoading /></td></tr> :
              keys.map(key => {
                const row = rows.find(r => r.key === key)
                const meta = KNOWN[key]
                return (
                  <tr key={key}>
                    <td>
                      <p className="text-slate-200 text-sm font-medium">{meta?.label ?? key}</p>
                      <p className="text-slate-600 text-[10px]">{meta?.hint ?? key}</p>
                    </td>
                    <td>
                      <input value={edits[key] ?? ''} onChange={e => setEdits(s => ({ ...s, [key]: e.target.value }))}
                        className="form-control text-sm py-1.5 max-w-[160px]" placeholder={row?.value ?? '—'} />
                    </td>
                    <td className="text-slate-500 text-xs">{row ? formatDateTime(row.updated_at) : 'not set'}</td>
                    <td className="text-right">
                      <button onClick={() => save(key, edits[key] ?? '')} disabled={savingKey === key}
                        className="btn btn-primary text-xs py-1">{savingKey === key ? '…' : 'Save'}</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <div className="glass p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">New setting key</label>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="some_key" className="form-control" />
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Value</label>
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" className="form-control" />
        </div>
        <button onClick={() => save(newKey.trim(), newVal)} disabled={!newKey.trim() || savingKey === newKey}
          className="btn btn-primary shrink-0">Add</button>
      </div>
    </div>
  )
}
