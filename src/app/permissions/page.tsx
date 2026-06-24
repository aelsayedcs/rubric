'use client'
import { useEffect, useState, useCallback } from 'react'
import type { AppRole } from '@/types'
import { Loading } from '@/components/Loading'
import { cn } from '@/lib/utils'

interface Page { key: string; label: string; section: string; roles: string[]; sort_order: number }

// Editable role columns. system_admin is always-on (never removable → no lock-out).
const ROLE_COLS: AppRole[] = ['system_admin', 'super_admin', 'admin', 'qa_evaluator', 'team_lead', 'agent', 'viewer']
const LOCKED: AppRole[] = ['system_admin']

export default function PermissionsPage() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/permissions').then(async r => {
      if (r.status === 403) { setForbidden(true); setLoading(false); return null }
      return r.json()
    }).then(d => { if (d) { setPages(d.pages ?? []); setLoading(false) } }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(page: Page, role: AppRole) {
    if (LOCKED.includes(role)) return
    const has = page.roles.includes(role)
    const roles = has ? page.roles.filter(r => r !== role) : [...page.roles, role]
    setPages(ps => ps.map(p => p.key === page.key ? { ...p, roles } : p))   // optimistic
    setSavingKey(page.key); setMsg('')
    const res = await fetch('/api/permissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: page.key, roles }),
    })
    setSavingKey('')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Save failed — changes reverted')
      load()  // revert to server truth
    }
  }

  if (forbidden) return <div className="page"><div className="glass p-10 text-center text-slate-400">Admins only.</div></div>

  const sections = Array.from(new Set(pages.map(p => p.section)))

  return (
    <div className="page">
      <div className="mb-5">
        <h1 className="section-title">Permissions</h1>
        <p className="section-subtitle">Control which roles see which pages. <code>system_admin</code> always has access. Editing is limited to the top tier.</p>
        {msg && <p className="text-sm text-amber-400 mt-2">{msg}</p>}
      </div>

      {loading ? <Loading /> : sections.map(section => (
        <div key={section} className="glass overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-white/[0.06]"><h2 className="text-sm font-bold text-white">{section}</h2></div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Page</th>
                  {ROLE_COLS.map(r => <th key={r} className="text-center text-[10px]">{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {pages.filter(p => p.section === section).map(p => (
                  <tr key={p.key} className={savingKey === p.key ? 'opacity-60' : ''}>
                    <td>
                      <p className="text-slate-200 text-sm font-medium">{p.label}</p>
                      <p className="text-slate-600 text-[10px] font-mono">{p.key}</p>
                    </td>
                    {ROLE_COLS.map(role => {
                      const on = p.roles.includes(role)
                      const locked = LOCKED.includes(role)
                      return (
                        <td key={role} className="text-center">
                          <input type="checkbox" checked={on} disabled={locked}
                            onChange={() => toggle(p, role)}
                            className={cn('w-4 h-4 rounded accent-sky-500', locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
