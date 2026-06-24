import { requirePageAccess } from '@/lib/page-access'

// Enforces the page_access matrix: roles not permitted for /assignments are
// redirected to /no-access before it renders.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('/assignments')
  return <>{children}</>
}
