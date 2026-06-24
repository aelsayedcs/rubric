'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [ready, setReady]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token })
        .then(() => { window.history.replaceState(null, '', window.location.pathname); setReady(true) })
        .catch(() => setError('Invalid or expired link.'))
    } else {
      // Already has a session (PKCE exchange happened on /login)
      supabase.auth.getUser().then(({ data }) => setReady(!!data.user))
    }
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Use at least 8 characters.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else { router.push('/results'); router.refresh() }
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(14,165,233,0.15), transparent), #080c14' }}>
      <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in">
        <div className="glass-strong p-8 shadow-glass-lg">
          <h1 className="text-xl font-bold text-white mb-6 text-center">Set your password</h1>
          {!ready ? (
            <p className="text-sm text-slate-400 text-center">{error || 'Verifying link…'}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="New password" className="form-control" autoFocus />
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm password" className="form-control" />
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? '…' : 'Save & continue →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
