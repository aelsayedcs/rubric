import { createServiceClient } from '@/lib/supabase/server'
import type { AppRole } from '@/types'

export interface NavItem { href: string; label: string }

// Default visibility — used if the page_access table is empty/unavailable so the
// nav never disappears. Mirrors migration 013 seed.
const FALLBACK: { href: string; label: string; roles: AppRole[] }[] = [
  { href: '/analysis',       label: 'Analysis',    roles: ['qa_evaluator', 'team_lead', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/insights',       label: 'Insights',    roles: ['qa_evaluator', 'team_lead', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/results',        label: 'Results',     roles: ['agent', 'team_lead', 'qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/evaluate',       label: 'Evaluate',    roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/disputes',       label: 'Disputes',    roles: ['agent', 'team_lead', 'qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/assignments',    label: 'Assignments', roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/admin/targets',  label: 'Targets',     roles: ['qa_evaluator', 'system_admin'] },
  { href: '/admin/scorecards', label: 'Scorecards', roles: ['qa_evaluator', 'system_admin'] },
  { href: '/team',           label: 'Team',        roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/admin/audit',    label: 'Audit',       roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/admin/settings', label: 'Settings',    roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/performance',    label: 'Performance', roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/admin/access',   label: 'Access',      roles: ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin'] },
  { href: '/permissions',    label: 'Permissions', roles: ['system_owner', 'system_admin'] },
]

const TOP: AppRole[] = ['system_admin', 'system_owner']

// Resolve which nav links a role can see, from the editable page_access table.
export async function getNavLinks(role: AppRole | null): Promise<NavItem[]> {
  if (!role) return []
  const isTop = TOP.includes(role)

  try {
    const svc = createServiceClient()
    const { data } = await svc.from('page_access').select('key, label, roles, sort_order').order('sort_order')
    if (data && data.length) {
      return data
        .filter(p => isTop || (p.roles as string[]).includes(role))
        .map(p => ({ href: p.key as string, label: p.label as string }))
    }
  } catch { /* fall through to defaults */ }

  return FALLBACK.filter(l => isTop || l.roles.includes(role)).map(l => ({ href: l.href, label: l.label }))
}
