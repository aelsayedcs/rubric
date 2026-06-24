import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { getCurrentUser } from '@/lib/auth'
import { getNavLinks } from '@/lib/nav'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { COMPANY_NAME } from '@/lib/config'

export const metadata: Metadata = {
  title: `${COMPANY_NAME} — Quality System`,
  description: `${COMPANY_NAME} — quality evaluations, disputes & coaching`,
  icons: { icon: '/logo.svg', shortcut: '/logo.svg' },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const links = user ? await getNavLinks(user.role) : []

  return (
    <html lang="en">
      <body>
        {user && <Nav email={user.email} role={user.role} links={links} />}
        <main className={user ? 'pt-14' : ''}>{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
