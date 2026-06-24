import { requirePageAccess } from '@/lib/page-access'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('/admin/scorecards')
  return <>{children}</>
}
