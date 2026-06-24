import { cn } from '@/lib/utils'
import { TICKET_URL_TEMPLATE } from '@/lib/config'

// Renders a ticket number. If NEXT_PUBLIC_TICKET_URL_TEMPLATE is set, it becomes
// a link that opens the ticket in your helpdesk (new tab); otherwise plain text.
// stopPropagation so it works inside clickable rows/cards without triggering them.
export function TicketLink({ ticket, className }: { ticket: string | number | null | undefined; className?: string }) {
  const t = ticket == null ? '' : String(ticket).trim()
  if (!t) return <span className={className}>—</span>
  if (!TICKET_URL_TEMPLATE) return <span className={className}>{t}</span>
  return (
    <a
      href={`${TICKET_URL_TEMPLATE}${encodeURIComponent(t)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="Open ticket"
      className={cn('hover:text-sky-400 hover:underline underline-offset-2 transition-colors', className)}
    >
      {t}
    </a>
  )
}
