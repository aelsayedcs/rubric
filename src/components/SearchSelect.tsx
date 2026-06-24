'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface SelectOption { value: string; label: string; sublabel?: string }

interface Props {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  allLabel?: string            // optional top row that resets to '' (for filters)
  allowFreeText?: boolean      // typing updates the value directly (e.g. agent email entry)
  className?: string           // wrapper width/spacing
  inputClassName?: string      // defaults to form-control; pass filter-select in filter bars
}

// A styled, searchable single-select. The dropdown is rendered through a portal
// with fixed positioning so it always sits above sibling cards (glass cards use
// backdrop-filter, which creates stacking contexts that otherwise cover it).
export function SearchSelect({
  value, onChange, options, placeholder = 'Search…',
  allLabel, allowFreeText = false, className, inputClassName = 'form-control',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0) // keyboard-highlighted option index
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fieldName = `ss-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  function reposition() {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const selectedLabel = options.find(o => o.value === value)?.label ?? (allowFreeText ? value : '')
  const display = open ? query : selectedLabel

  const q = query.trim().toLowerCase()
  const filtered = (q
    ? options.filter(o =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sublabel ?? '').toLowerCase().includes(q))
    : options
  ).slice(0, 50)

  function choose(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  // Keep the highlight on the top match as the query changes.
  useEffect(() => { setActive(0) }, [query, open])
  // Scroll the highlighted option into view.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      if (open && filtered.length) { e.preventDefault(); choose(filtered[Math.min(active, filtered.length - 1)].value) }
      else if (allowFreeText) setOpen(false)
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        className={cn(inputClassName, 'w-full')}
        placeholder={value && !allowFreeText ? selectedLabel : placeholder}
        value={display}
        name={fieldName}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore
        data-form-type="other"
        onFocusCapture={() => { setQuery(allowFreeText ? value : ''); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); if (allowFreeText) onChange(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {open && rect && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="overflow-hidden rounded-xl"
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            minWidth: 200,
            zIndex: 9999,
            background: 'rgba(10,14,24,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {allLabel && (
              <button type="button" onClick={() => choose('')}
                className={cn('w-full text-left px-4 py-2 text-sm transition-colors border-b border-white/5',
                  value === '' ? 'text-sky-400 bg-sky-500/10' : 'text-slate-400 hover:bg-white/5')}>
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No matches</p>
            ) : filtered.map((o, i) => (
              <button key={o.value} type="button" data-idx={i} onClick={() => choose(o.value)}
                onMouseEnter={() => setActive(i)}
                className={cn('w-full text-left px-4 py-2 text-sm transition-colors',
                  i === active ? 'bg-white/10' : '',
                  o.value === value ? 'text-sky-400' : 'text-slate-300')}>
                <span className="block">{o.label}</span>
                {o.sublabel && <span className="block text-[11px] text-slate-500">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
