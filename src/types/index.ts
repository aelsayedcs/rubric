export type AppRole =
  | 'system_admin' | 'system_owner' | 'super_admin' | 'admin'
  | 'qa_evaluator' | 'team_lead' | 'agent' | 'viewer'

export type Channel = 'Chat' | 'Call' | 'Tickets'
export type Result  = 'pass' | 'fail' | 'na'
export type EvalStatus = 'pending' | 'archived'
export type EvalSource = 'manual' | 'tl_submission' | 'auto'
export type DisputeStatus =
  | 'pending_tl' | 'approved_tl' | 'rejected_tl'
  | 'pending_qa' | 'approved_qa' | 'rejected_qa' | 'resolved'

export const QA_STAFF_ROLES: AppRole[] = ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin']
// qa_evaluator is granted the full super_admin surface (per product decision 2026-06):
// it sits in ADMIN_ROLES so every requireRole(ADMIN_ROLES) API route accepts it.
// Editing the permissions matrix stays top-tier only (system_admin/system_owner),
// which matches super_admin exactly.
export const ADMIN_ROLES: AppRole[]    = ['qa_evaluator', 'admin', 'super_admin', 'system_owner', 'system_admin']

export interface Criterion {
  id: string
  scorecard_id: string
  section: string
  label: string
  weight: number
  is_critical: boolean
  sort_order: number
  archived: boolean
}

export interface Scorecard {
  id: string
  name: string
  version: number
  channel: string
  active: boolean
}

export interface Evaluation {
  id: string
  scorecard_id: string
  agent_email: string
  evaluator_email: string
  team_lead_email: string | null
  ticket_number: string
  customer_email: string | null
  channel: Channel
  eval_date: string
  solved_date: string | null
  score: number
  total_errors: number
  total_critical_errors: number
  status: EvalStatus
  acknowledged: boolean
  disputed: boolean
  coached: boolean
  coached_by: string | null
  coached_at: string | null
  notes: string | null
  areas_for_improvement: string | null
  source: EvalSource
  created_at: string
  deleted_at: string | null
}

export interface EvaluationResponse {
  id: string
  evaluation_id: string
  criterion_id: string
  result: Result
}

export interface Coaching {
  id: string
  evaluation_id: string | null
  agent_email: string
  coach_email: string
  ticket_id: string | null
  strengths: string | null
  areas_for_improvement: string | null
  action_plan: string | null
  email_sent: boolean
  team_lead_email: string | null
  created_at: string
}

export interface Dispute {
  id: string
  evaluation_id: string | null
  agent_email: string
  ticket_number: string | null
  comment: string | null
  submitted_by: string
  status: DisputeStatus
  response: string | null
  tl_decision: string | null
  tl_comment: string | null
  tl_email: string | null
  tl_action_at: string | null
  qa_decision: string | null
  qa_comment: string | null
  qa_email: string | null
  qa_action_at: string | null
  last_updated_by: string | null
  last_updated_at: string
  created_at: string
}
