import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { getCurrentUser } from '@/lib/auth'
import { getNavLinks } from '@/lib/nav'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getAppConfig } from '@/lib/app-config'

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getAppConfig()
  return {
    title: `${companyName} — Quality System`,
    description: `${companyName} — quality evaluations, disputes & coaching`,
    icons: { icon: '/logo.svg', shortcut: '/logo.svg' },
  }
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const links = user ? await getNavLinks(user.role) : []
  const { companyName } = await getAppConfig()

  return (
    <html lang="en">
      <body>
        {user && <Nav email={user.email} role={user.role} links={links} companyName={companyName} />}
        <main className={user ? 'pt-14' : ''}>{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
