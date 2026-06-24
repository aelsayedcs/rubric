import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { AppRole } from '@/types'

// Top-tier roles always have access (they manage the matrix itself).
const TOP: AppRole[] = ['system_admin', 'system_owner']

// Server-side page guard driven by the editable page_access matrix (the same
// table that controls nav visibility). Used in each protected page's layout so
// that revoking a role in /permissions actually blocks direct navigation —
// not just hiding the nav link. Redirects to /login (no session) or /no-access.
export async function requirePageAccess(path: string) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role && TOP.includes(user.role)) return user

  const svc = createServiceClient()
  const { data } = await svc.from('page_access').select('roles').eq('key', path).maybeSingle()
  // No matrix row → fail open (don't lock anyone out of an unconfigured page).
  if (data && !((data.roles as string[]) ?? []).includes(user.role ?? '')) {
    redirect('/no-access')
  }
  return user
}
