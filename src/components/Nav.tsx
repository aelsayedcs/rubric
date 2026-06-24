'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/NotificationBell'
import { COMPANY_NAME } from '@/lib/config'
import type { AppRole } from '@/types'

interface NavItem { href: string; label: string }
interface NavProps { email: string; role: AppRole | null; links: NavItem[]; companyName?: string }

// Pages tucked under the desktop "More" menu.
const ADMIN_HREFS = new Set(['/admin/targets', '/admin/scorecards', '/team', '/admin/audit', '/admin/settings', '/performance', '/admin/access', '/permissions'])
// Grouping for the mobile hamburger menu.
const GROUPS: { title: string; hrefs: string[] }[] = [
  { title: 'Main', hrefs: ['/results', '/evaluate', '/disputes'] },
  { title: 'Reports', hrefs: ['/analysis', '/insights', '/performance'] },
  { title: 'Admin', hrefs: ['/admin/targets', '/admin/scorecards', '/team', '/admin/audit', '/admin/settings', '/admin/access', '/permissions'] },
]

export function Nav({ email, role, links, companyName }: NavProps) {
  const brand = companyName || COMPANY_NAME
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)   // desktop "More"
  const [mobileOpen, setMobileOpen] = useState(false) // phone hamburger

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const primary = links.filter(l => !ADMIN_HREFS.has(l.href))
  const admin   = links.filter(l => ADMIN_HREFS.has(l.href))
  const adminActive = admin.some(l => isActive(l.href))

  // Grouped links for the mobile menu (anything ungrouped falls under "Main").
  const grouped = GROUPS.map(g => ({ title: g.title, items: links.filter(l => g.hrefs.includes(l.href)) })).filter(g => g.items.length)
  const ungrouped = links.filter(l => !GROUPS.some(g => g.hrefs.includes(l.href)))
  if (ungrouped.length) {
    const main = grouped.find(g => g.title === 'Main')
    if (main) main.items.push(...ungrouped); else grouped.unshift({ title: 'Main', items: ungrouped })
  }

  const linkClass = (active: boolean) => cn(
    'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
    active ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
  )
  const activeStyle = { background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)' }
  const panelBg = { background: 'rgba(15,20,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)' } as const

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14"
      style={{ background: 'rgba(8,12,20,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
    >
      <div className="max-w-screen-2xl mx-auto px-4 h-full flex items-center gap-1">
        {/* Hamburger (phones only) */}
        {role && (
          <button onClick={() => setMobileOpen(o => !o)} aria-label="Menu"
            className="md:hidden w-9 h-9 -ml-1 mr-1 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white/5 shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
            </svg>
          </button>
        )}

        {/* Logo */}
        <Link href="/results" className="flex items-center gap-2 md:mr-4 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt={brand} className="h-7 w-7 rounded-lg" style={{ boxShadow: '0 0 12px rgba(14,165,233,0.4)' }} />
          <span className="font-bold text-white text-sm hidden sm:block tracking-tight">{brand} <span className="text-sky-400">QA</span></span>
        </Link>

        {/* Desktop links (≥ md) */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
          {primary.map(l => (
            <Link key={l.href} href={l.href} className={linkClass(isActive(l.href))} style={isActive(l.href) ? activeStyle : {}}>{l.label}</Link>
          ))}
          {admin.length > 0 && (
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)} className={cn(linkClass(adminActive), 'flex items-center gap-1')} style={adminActive ? activeStyle : {}}>
                More
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={cn('transition-transform', menuOpen && 'rotate-180')}>
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[170px] py-1.5 rounded-xl shadow-glass-lg" style={panelBg}>
                    {admin.map(l => (
                      <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                        className={cn('block px-4 py-2 text-sm transition-colors', isActive(l.href) ? 'text-sky-400 bg-sky-500/10' : 'text-slate-300 hover:text-white hover:bg-white/5')}>{l.label}</Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        {/* spacer on mobile so right-side controls sit at the edge */}
        <div className="flex-1 md:hidden" />

        {!role && <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium hidden sm:block">Pending access</span>}

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {role && <NotificationBell />}
          <div title={email} className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {email.charAt(0).toUpperCase()}
          </div>
          <button onClick={signOut} className="hidden md:block text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1.5">Sign out</button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-14 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden absolute left-0 right-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-2" style={panelBg}>
            {grouped.map(g => (
              <div key={g.title} className="py-1">
                <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>
                {g.items.map(l => (
                  <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                    className={cn('block px-4 py-2.5 text-sm transition-colors', isActive(l.href) ? 'text-sky-400 bg-sky-500/10' : 'text-slate-200 hover:bg-white/5')}>{l.label}</Link>
                ))}
              </div>
            ))}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button onClick={() => { setMobileOpen(false); signOut() }} className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5">Sign out</button>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
