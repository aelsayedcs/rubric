import { requirePageAccess } from '@/lib/page-access'

// Enforces the page_access matrix server-side: roles not permitted for this
// route (per /permissions) are redirected to /no-access before it renders.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('/admin/audit')
  return <>{children}</>
}
