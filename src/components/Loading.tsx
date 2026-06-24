// Centered animated spinner used across pages while data loads.
// A glowing gradient ring over a faint track, with a soft pulsing label.
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5 animate-fade-in">
      <Spinner size={44} />
      <span className="text-sm tracking-wide text-slate-400 animate-pulse-soft">{label}</span>
    </div>
  )
}

// Compact inline loader for table cells, modals and drawers (no tall padding).
export function InlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-8 text-slate-500">
      <Spinner size={18} />
      <span className="text-sm animate-pulse-soft">{label}</span>
    </div>
  )
}

// Standalone spinner — reusable inline (buttons, drawers, inline states).
export function Spinner({ size = 20 }: { size?: number }) {
  const s = `${size}px`
  return (
    <span className="relative inline-flex shrink-0" style={{ width: s, height: s }}>
      {/* soft glow */}
      <span className="absolute inset-0 rounded-full blur-md"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.45), transparent 70%)' }} />
      <svg className="animate-spin relative" width={size} height={size} viewBox="0 0 50 50" fill="none">
        <defs>
          <linearGradient id="spinner-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* faint full track */}
        <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        {/* gradient arc */}
        <circle cx="25" cy="25" r="20" stroke="url(#spinner-grad)" strokeWidth="4"
          strokeLinecap="round" strokeDasharray="95 130" />
      </svg>
    </span>
  )
}
