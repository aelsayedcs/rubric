import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AppRole } from '@/types'
import { QA_STAFF_ROLES, ADMIN_ROLES, EDIT_ROLES } from '@/types'

export interface CurrentUser {
  email: string
  role: AppRole | null
}

const APP = 'quality'

/** Resolve the signed-in user and their role for the quality app. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const svc = createServiceClient()
  const { data } = await svc
    .from('app_access')
    .select('role')
    .eq('email', user.email)
    .eq('app', APP)
    .eq('archived', false)
    .maybeSingle()

  return { email: user.email, role: (data?.role as AppRole) ?? null }
}

export function isQaStaff(role: AppRole | null): boolean {
  return !!role && QA_STAFF_ROLES.includes(role)
}

export function isAdmin(role: AppRole | null): boolean {
  return !!role && ADMIN_ROLES.includes(role)
}

// Editing / re-scoring an evaluation is intentionally narrower than the broad
// QA-staff surface: only the QA evaluators and the top-tier system_admin may
// change a scored evaluation (product decision 2026-06). EDIT_ROLES lives in
// @/types so client components can share the same gate.
export { EDIT_ROLES }
export function canEdit(role: AppRole | null): boolean {
  return !!role && EDIT_ROLES.includes(role)
}

// Coaching is available to every role above the agent (team lead and up); an
// agent never coaches.
export const COACH_ROLES: AppRole[] = ['team_lead', 'qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin']
export function canCoach(role: AppRole | null): boolean {
  return !!role && COACH_ROLES.includes(role)
}

/**
 * Guard for API routes. Returns the user if they hold one of `allowed` roles
 * for the quality app, otherwise an HTTP status to return.
 */
export async function requireRole(
  allowed: AppRole[],
): Promise<{ user: CurrentUser } | { status: 401 | 403 }> {
  const user = await getCurrentUser()
  if (!user) return { status: 401 }
  if (!user.role || !allowed.includes(user.role)) return { status: 403 }
  return { user }
}
