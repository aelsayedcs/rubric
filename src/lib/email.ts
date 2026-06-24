import nodemailer from 'nodemailer'
import { COMPANY_NAME } from '@/lib/config'

const host = process.env.EMAIL_SMTP_HOST
const port = Number(process.env.EMAIL_SMTP_PORT || 465)
const user = process.env.EMAIL_SMTP_USER
const pass = process.env.EMAIL_SMTP_PASS
const from = process.env.EMAIL_FROM || `${COMPANY_NAME} <noreply@example.com>`
const ccLeads = process.env.EMAIL_CC_SUPPORT_LEADS

function transport() {
  if (!host || !user || !pass) return null
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
  })
}

interface CoachingEmailInput {
  to: string
  agentName?: string | null
  ticket?: string | null
  channel?: string | null
  score?: number | null
  strengths?: string | null
  areas?: string | null
  actionPlan?: string | null
  coachEmail: string
}

/**
 * Sends the coaching summary to the agent. Returns true on success.
 * Fire-and-forget friendly — never throws into the request path.
 */
export async function sendCoachingEmail(input: CoachingEmailInput): Promise<boolean> {
  const t = transport()
  if (!t) {
    console.warn('[email] SMTP not configured — skipping coaching email')
    return false
  }
  const block = (title: string, body?: string | null) =>
    body ? `<div style="margin-top:14px"><div style="font-weight:700;color:#0ea5e9;margin-bottom:4px">${title}</div><div style="white-space:pre-wrap;color:#334155">${escapeHtml(body)}</div></div>` : ''

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
    <h2 style="color:#0f172a;margin:0 0 4px">Coaching feedback</h2>
    <p style="color:#64748b;margin:0 0 16px;font-size:13px">
      ${input.ticket ? `Ticket <strong>${escapeHtml(input.ticket)}</strong>` : ''}
      ${input.channel ? ` · ${escapeHtml(input.channel)}` : ''}
      ${typeof input.score === 'number' ? ` · Score <strong>${input.score}%</strong>` : ''}
    </p>
    ${block('Strengths', input.strengths)}
    ${block('Areas for improvement', input.areas)}
    ${block('Action plan', input.actionPlan)}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">Coached by ${escapeHtml(input.coachEmail)} · ${escapeHtml(COMPANY_NAME)} Quality</p>
  </div>`

  try {
    await t.sendMail({
      from,
      to: input.to,
      cc: ccLeads || undefined,
      subject: `Coaching feedback${input.ticket ? ` — Ticket ${input.ticket}` : ''}`,
      html,
    })
    return true
  } catch (e) {
    console.error('[email] coaching send failed:', e)
    return false
  }
}

// Generic HTML email. Fire-and-forget friendly — returns false if SMTP is
// unconfigured or the send fails, never throws.
export async function sendEmail(opts: { to: string; subject: string; html: string; cc?: string }): Promise<boolean> {
  const t = transport()
  if (!t) { console.warn('[email] SMTP not configured — skipping'); return false }
  try {
    // support.leads is CC'd on every outgoing email (plus any caller-supplied cc).
    const cc = [...new Set([opts.cc, ccLeads].filter(Boolean) as string[])].join(',') || undefined
    await t.sendMail({ from, to: opts.to, cc, subject: opts.subject, html: opts.html })
    return true
  } catch (e) {
    console.error('[email] send failed:', e)
    return false
  }
}

export { escapeHtml }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}
