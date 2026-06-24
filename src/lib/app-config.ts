import { createServiceClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────
// Runtime app configuration. Values are stored in public.app_config
// (set via the /setup wizard or /admin/settings) and fall back to
// environment variables, which fall back to safe defaults.
// Server-only (uses the service-role client). For client components,
// the values are injected via ConfigProvider (see src/app/layout.tsx)
// or fetched from /api/public-config (login page).
// ─────────────────────────────────────────────────────────────

export interface AppConfig {
  companyName: string
  allowedEmailDomain: string   // '' = allow any domain
  ticketUrlTemplate: string    // '' = render ticket numbers as plain text
  digestTz: string
}

const normDomain = (s: string) => s.trim().toLowerCase().replace(/^@/, '')

function envConfig(): AppConfig {
  return {
    companyName: process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || 'Rubric',
    allowedEmailDomain: normDomain(process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || ''),
    ticketUrlTemplate: process.env.NEXT_PUBLIC_TICKET_URL_TEMPLATE?.trim() || '',
    digestTz: process.env.DIGEST_TZ?.trim() || 'UTC',
  }
}

// Config keys stored in app_config (app = 'quality').
export const CONFIG_KEYS = {
  companyName: 'company_name',
  allowedEmailDomain: 'allowed_email_domain',
  ticketUrlTemplate: 'ticket_url_template',
  digestTz: 'digest_tz',
} as const

/**
 * Reads runtime config from the database, overlaying env-var fallbacks.
 * Never throws — if the DB is unreachable (e.g. before setup) it returns
 * the env/default config so the app still renders.
 */
export async function getAppConfig(): Promise<AppConfig> {
  const env = envConfig()
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from('app_config')
      .select('key, value')
      .eq('app', 'quality')
      .in('key', Object.values(CONFIG_KEYS))
    const m = Object.fromEntries((data ?? []).map(r => [r.key, r.value as string | null]))
    return {
      companyName: m[CONFIG_KEYS.companyName]?.trim() || env.companyName,
      allowedEmailDomain: m[CONFIG_KEYS.allowedEmailDomain] != null
        ? normDomain(m[CONFIG_KEYS.allowedEmailDomain]!) : env.allowedEmailDomain,
      ticketUrlTemplate: m[CONFIG_KEYS.ticketUrlTemplate] != null
        ? m[CONFIG_KEYS.ticketUrlTemplate]!.trim() : env.ticketUrlTemplate,
      digestTz: m[CONFIG_KEYS.digestTz]?.trim() || env.digestTz,
    }
  } catch {
    return env
  }
}

export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  if (!allowedDomain) return true
  return email.trim().toLowerCase().endsWith('@' + allowedDomain)
}
