'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COMPANY_NAME, ALLOWED_EMAIL_DOMAIN, RESTRICT_EMAIL_DOMAIN } from '@/lib/config'

const EMAIL_PLACEHOLDER = `you@${ALLOWED_EMAIL_DOMAIN || 'example.com'}`

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [signupMode, setSignupMode] = useState(false)
  const [confirm, setConfirm] = useState('')
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token=')) { router.replace('/set-password' + hash); return }
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      window.history.replaceState(null, '', window.location.pathname)
      createClient().auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError('This link has expired or was already used. Ask your admin for a new one.')
        else router.replace('/set-password')
      })
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    if (resetMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      })
      setLoading(false)
      if (error) setError(error.message); else setResetSent(true)
      return
    }

    if (signupMode) {
      if (password !== confirm) { setError('Passwords do not match.'); setLoading(false); return }
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Sign up failed'); setLoading(false); return }
      // Account created — sign straight in.
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError('Account created. Please sign in.'); setSignupMode(false); setLoading(false) }
      else { router.push('/results'); router.refresh() }
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/results'); router.refresh() }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(14,165,233,0.15), transparent), #080c14' }}>
      <div className="absolute inset-0 bg-grid-pattern" style={{ backgroundSize: '32px 32px', opacity: 0.4 }} />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-10"
        style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

      <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in">
        <div className="glass-strong p-8 shadow-glass-lg relative">
          <div className="absolute top-0 left-8 right-8 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(14,165,233,0.6), transparent)' }} />

          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt={COMPANY_NAME} className="h-14 w-14 rounded-2xl"
                style={{ boxShadow: '0 0 30px rgba(14,165,233,0.5), 0 0 60px rgba(14,165,233,0.2)' }} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              QA <span className="gradient-text">Quality System</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              {resetMode ? 'Reset your password' : signupMode ? `Create your ${COMPANY_NAME} account` : `Sign in with your ${COMPANY_NAME} account`}
            </p>
          </div>

          {resetSent ? (
            <div className="space-y-4">
              <div className="px-4 py-4 rounded-xl text-sm text-emerald-400 text-center"
                style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <p className="font-semibold mb-1">Check your email</p>
                <p className="text-xs text-emerald-300/70">A reset link was sent to <strong>{email}</strong>.</p>
              </div>
              <button type="button" onClick={() => { setResetSent(false); setResetMode(false) }}
                className="btn btn-ghost w-full text-sm">← Back to sign in</button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={EMAIL_PLACEHOLDER} className="form-control" autoFocus autoComplete="email" />
            </div>
            {!resetMode && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="form-control" autoComplete={signupMode ? 'new-password' : 'current-password'} />
              </div>
            )}
            {signupMode && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" className="form-control" autoComplete="new-password" />
              </div>
            )}
            {error && (
              <div className="px-3 py-2.5 rounded-xl text-sm text-red-400"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
              {loading ? '…' : resetMode ? 'Send Reset Link →' : signupMode ? 'Create account →' : 'Sign in →'}
            </button>
            <div className="flex items-center justify-between">
              {!signupMode && (
                <button type="button" onClick={() => { setResetMode(m => !m); setError('') }}
                  className="text-xs text-slate-500 hover:text-sky-400 transition-colors">
                  {resetMode ? '← Back to sign in' : 'Forgot password?'}
                </button>
              )}
              <button type="button" onClick={() => { setSignupMode(m => !m); setResetMode(false); setError('') }}
                className="text-xs text-slate-500 hover:text-sky-400 transition-colors ml-auto">
                {signupMode ? '← Back to sign in' : 'Create account'}
              </button>
            </div>
          </form>
          )}
        </div>
        {RESTRICT_EMAIL_DOMAIN && (
          <p className="text-center text-xs text-slate-600 mt-5">Access restricted to @{ALLOWED_EMAIL_DOMAIN} accounts</p>
        )}
      </div>
    </div>
  )
}
