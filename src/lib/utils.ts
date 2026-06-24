import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export function toYMD(date: Date | string): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function formatDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Score → tailwind text colour (matches the >=90 green / >=85 amber / else red rule).
export function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 85) return 'text-amber-400'
  return 'text-red-400'
}
