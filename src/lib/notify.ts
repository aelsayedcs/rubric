import { createServiceClient } from '@/lib/supabase/server'

export interface NotifyInput {
  recipient_email: string
  type: string
  title: string
  body?: string | null
  link?: string | null
}

// Fire-and-forget notification insert. Never throws — a notification failure must
// not break the action that triggered it.
export async function notify(items: NotifyInput | NotifyInput[]): Promise<void> {
  try {
    const rows = (Array.isArray(items) ? items : [items])
      .filter(i => i.recipient_email)
      .map(i => ({
        app: 'quality',
        recipient_email: i.recipient_email.toLowerCase(),
        type: i.type, title: i.title,
        body: i.body ?? null, link: i.link ?? null,
      }))
    if (!rows.length) return
    const svc = createServiceClient()
    await svc.from('notifications').insert(rows)
  } catch { /* swallow */ }
}

// Emails of all QA reviewers (used to notify QA when a dispute reaches them).
export async function qaStaffEmails(): Promise<string[]> {
  try {
    const svc = createServiceClient()
    const { data } = await svc.from('app_access')
      .select('email').eq('app', 'quality').eq('archived', false)
      .in('role', ['qa_evaluator', 'system_admin', 'super_admin', 'system_owner', 'admin'])
    return [...new Set((data ?? []).map(r => (r.email as string).toLowerCase()))]
  } catch { return [] }
}
