// Shared date-preset helpers for filter bars (ported from the DSAT analytics page).
// Uses local date components — toISOString() shifts the day in UTC+ timezones.

export const DATE_PRESETS = [
  { key: 'today',        label: 'Today' },
  { key: 'yesterday',    label: 'Yesterday' },
  { key: 'last7',        label: 'Last 7 Days' },
  { key: 'last30',       label: 'Last 30 Days' },
  { key: 'this_week',    label: 'This Week' },
  { key: 'last_week',    label: 'Last Week' },
  { key: 'this_month',   label: 'This Month' },
  { key: 'last_month',   label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'last_quarter', label: 'Last Quarter' },
  { key: 'this_year',    label: 'This Year' },
  { key: 'custom',       label: 'Custom Range' },
] as const

export type DatePreset = typeof DATE_PRESETS[number]['key']

export function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fmt = toYMD

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'yesterday': {
      const d = new Date(today); d.setDate(d.getDate() - 1)
      return { from: fmt(d), to: fmt(d) }
    }
    case 'last7': {
      const d = new Date(today); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: fmt(today) }
    }
    case 'last30': {
      const d = new Date(today); d.setDate(d.getDate() - 29)
      return { from: fmt(d), to: fmt(today) }
    }
    case 'this_week': {
      const d = new Date(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return { from: fmt(d), to: fmt(today) }
    }
    case 'last_week': {
      const mon = new Date(today); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 7)
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
      return { from: fmt(mon), to: fmt(sun) }
    }
    case 'this_month':
      return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'this_quarter': {
      const q = Math.floor(today.getMonth() / 3)
      return { from: fmt(new Date(today.getFullYear(), q * 3, 1)), to: fmt(today) }
    }
    case 'last_quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const first = new Date(today.getFullYear(), (q - 1) * 3, 1)
      const last = new Date(today.getFullYear(), q * 3, 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'this_year':
      return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) }
    default:
      return { from: '', to: '' }
  }
}
