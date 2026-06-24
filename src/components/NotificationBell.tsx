'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Notif { id: number; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); return `${d}d ago`
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    fetch('/api/notifications').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setItems(d.notifications ?? []); setUnread(d.unread ?? 0) }
    }).catch(() => {})
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])

  async function markAll() {
    setUnread(0); setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  }

  async function openItem(n: Notif) {
    if (!n.read_at) {
      setUnread(u => Math.max(0, u - 1))
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }).catch(() => {})
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); if (!open) load() }}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        title="Notifications" aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div ref={panelRef} className="absolute right-0 top-full mt-1.5 z-50 w-[min(340px,calc(100vw-24px))] max-h-[420px] overflow-y-auto rounded-xl shadow-glass-lg"
            style={{ background: 'rgba(15,20,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] sticky top-0" style={{ background: 'rgba(15,20,30,0.98)' }}>
              <span className="text-sm font-bold text-white">Notifications</span>
              {unread > 0 && <button onClick={markAll} className="text-xs text-sky-400 hover:text-sky-300">Mark all read</button>}
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">No notifications.</div>
            ) : items.map(n => (
              <button key={n.id} onClick={() => openItem(n)}
                className={cn('block w-full text-left px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/5 transition-colors', !n.read_at && 'bg-sky-500/[0.06]')}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                  <div className={cn('flex-1 min-w-0', n.read_at && 'pl-3.5')}>
                    <div className="text-xs font-semibold text-slate-200 leading-snug">{n.title}</div>
                    {n.body && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-slate-600 mt-0.5">{ago(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
