'use client'
// Global client-side error boundary — replaces Next.js's raw "Application error"
// message with a friendly page and a way to recover.
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="page flex items-center justify-center" style={{ minHeight: '70vh' }}>
      <div className="glass p-10 max-w-md text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h1 className="text-lg font-bold text-white mb-1">Something went wrong</h1>
        <p className="text-sm text-slate-400 mb-5">
          This page hit an unexpected error. Try again, or head back to your evaluations.
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={reset} className="btn btn-primary text-sm">Try again</button>
          <a href="/results" className="btn btn-secondary text-sm">Go to Results</a>
        </div>
      </div>
    </div>
  )
}
