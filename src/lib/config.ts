// ─────────────────────────────────────────────────────────────
// Company-specific configuration, sourced from environment variables.
// Every value has a safe, generic default so the app runs with zero config.
// NEXT_PUBLIC_* vars are inlined at build time and readable on both client & server.
// See .env.example for documentation of each variable.
// ─────────────────────────────────────────────────────────────

/** Brand name shown in the UI header, page titles and outgoing emails. */
export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || 'QA System'

/**
 * Restrict sign-in / self-registration to this email domain (e.g. "acme.com").
 * Empty string = allow any email domain. Leading "@" and casing are normalized.
 */
export const ALLOWED_EMAIL_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || '')
  .trim()
  .toLowerCase()
  .replace(/^@/, '')

/** True if email-domain restriction is active. */
export const RESTRICT_EMAIL_DOMAIN = ALLOWED_EMAIL_DOMAIN.length > 0

/** Returns true if `email` is allowed to register/sign in under the domain policy. */
export function isAllowedEmail(email: string): boolean {
  if (!RESTRICT_EMAIL_DOMAIN) return true
  return email.trim().toLowerCase().endsWith('@' + ALLOWED_EMAIL_DOMAIN)
}

/**
 * Base URL a ticket number is appended to for deep-links (e.g.
 * "https://acme.freshdesk.com/a/tickets/"). Empty = render ticket as plain text.
 */
export const TICKET_URL_TEMPLATE = process.env.NEXT_PUBLIC_TICKET_URL_TEMPLATE?.trim() || ''
