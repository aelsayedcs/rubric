'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Status { connected: boolean; dbReady: boolean; hasAdmin: boolean }
const STEPS = ['Connect', 'Database', 'Branding', 'Admin'] as const

export default function SetupWizard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Branding form
  const [companyName, setCompanyName] = useState('')
  const [allowedEmailDomain, setAllowedEmailDomain] = useState('')
  const [ticketUrlTemplate, setTicketUrlTemplate] = useState('')
  const [digestTz, setDigestTz] = useState('UTC')
  // Admin form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function refresh() {
    const r = await fetch('/api/setup').then(r => r.json()).catch(() => null)
    if (r) setStatus(r)
    return r as Status | null
  }
  useEffect(() => { refresh() }, [])

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Something went wrong'); return false }
      return true
    } finally { setBusy(false) }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || ''
  const sqlEditorUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'

  if (status?.hasAdmin && !done) {
    return <Shell><div className="text-center">
      <h1 className="text-2xl font-bold text-white mb-2">Setup already complete</h1>
      <p className="text-slate-400 mb-6">This instance is configured. Sign in to continue.</p>
      <Link href="/login" className="btn btn-primary">Go to sign in →</Link>
    </div></Shell>
  }

  if (done) {
    return <Shell><div className="text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-2xl font-bold text-white mb-2">You&apos;re all set</h1>
      <p className="text-slate-400 mb-6">Your admin account is ready. Sign in to start using your QA system.</p>
      <Link href="/login" className="btn btn-primary">Sign in →</Link>
    </div></Shell>
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Welcome — let&apos;s set you up</h1>
        <Link href="/setup/guide" className="text-xs text-sky-400 hover:underline">Need help getting these? · Guide</Link>
      </div>
      {/* Stepper */}
      <div className="flex items-center gap-2 my-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${i <= step ? 'bg-sky-500 text-white' : 'bg-white/10 text-slate-400'}`}>{i + 1}</div>
            <span className={`text-xs font-semibold ${i === step ? 'text-white' : 'text-slate-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-sky-500/50' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {error && <div className="px-3 py-2.5 rounded-xl text-sm text-red-400 mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

      {/* Step 1 — Connect */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Rubric connects to your own Supabase project. Set these environment variables (in <code className="text-sky-300">.env.local</code> locally, or in Vercel → Settings → Environment Variables), then redeploy:</p>
          <ul className="text-sm text-slate-300 space-y-1 font-mono bg-white/5 rounded-xl p-4 border border-white/10">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>SUPABASE_SERVICE_ROLE_KEY</li>
          </ul>
          <StatusLine ok={!!status?.connected} okText="Supabase connection detected" badText="Not connected — set the variables above and reload" />
          <div className="flex justify-between">
            <button onClick={refresh} className="btn btn-ghost">Re-check</button>
            <button onClick={() => setStep(1)} disabled={!status?.connected} className="btn btn-primary">Next →</button>
          </div>
        </div>
      )}

      {/* Step 2 — Database */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Create the database tables and sample data. Open your Supabase SQL editor, paste the contents of <code className="text-sky-300">supabase/setup.sql</code> from the repo, and run it.</p>
          <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Open Supabase SQL editor ↗</a>
          <StatusLine ok={!!status?.dbReady} okText="Database is initialized" badText="Tables not found yet — run setup.sql, then verify" />
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="btn btn-ghost">← Back</button>
            <div className="flex gap-2">
              <button onClick={refresh} className="btn btn-ghost">Verify</button>
              <button onClick={() => setStep(2)} disabled={!status?.dbReady} className="btn btn-primary">Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Branding */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">These appear across the app. You can change them later in Settings.</p>
          <Field label="Company / brand name"><input className="form-control" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Support" /></Field>
          <Field label="Allowed sign-in email domain (blank = allow any)"><input className="form-control" value={allowedEmailDomain} onChange={e => setAllowedEmailDomain(e.target.value)} placeholder="acme.com" /></Field>
          <Field label="Ticket link base URL (optional)"><input className="form-control" value={ticketUrlTemplate} onChange={e => setTicketUrlTemplate(e.target.value)} placeholder="https://acme.freshdesk.com/a/tickets/" /></Field>
          <Field label="Timezone (IANA)"><input className="form-control" value={digestTz} onChange={e => setDigestTz(e.target.value)} placeholder="UTC" /></Field>
          <div className="flex justify-between pt-1">
            <button onClick={() => setStep(1)} className="btn btn-ghost">← Back</button>
            <button disabled={busy} onClick={async () => { if (await post({ action: 'save_branding', companyName, allowedEmailDomain, ticketUrlTemplate, digestTz })) setStep(3) }} className="btn btn-primary">{busy ? 'Saving…' : 'Save & continue →'}</button>
          </div>
        </div>
      )}

      {/* Step 4 — Admin */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Create your administrator account. This is the only account that can manage everything.</p>
          <Field label="Your email"><input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@acme.com" /></Field>
          <Field label="Password (min 8 characters)"><input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          <div className="flex justify-between pt-1">
            <button onClick={() => setStep(2)} className="btn btn-ghost">← Back</button>
            <button disabled={busy} onClick={async () => { if (await post({ action: 'create_admin', email, password })) { await refresh(); setDone(true) } }} className="btn btn-primary">{busy ? 'Creating…' : 'Create admin & finish →'}</button>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(14,165,233,0.15), transparent), #080c14' }}>
      <div className="glass-strong p-8 w-full max-w-lg shadow-glass-lg">{children}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>{children}</div>
}
function StatusLine({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl ${ok ? 'text-emerald-400' : 'text-amber-400'}`}
      style={{ background: ok ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
      <span>{ok ? '✅' : '⏳'}</span><span>{ok ? okText : badText}</span>
    </div>
  )
}
