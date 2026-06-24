import { requirePageAccess } from '@/lib/page-access'

// Server-side gate driven by the page_access matrix: roles not permitted for
// /evaluate (per /permissions) are redirected to /no-access before the form
// renders. The submit API also enforces QA-staff independently.
export default async function EvaluateLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('/evaluate')
  return <>{children}</>
}
