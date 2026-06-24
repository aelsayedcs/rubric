-- ─────────────────────────────────────────────────────────────
-- 005_qa_workflow.sql — disputes + coaching
-- ─────────────────────────────────────────────────────────────

create table if not exists qa.qa_disputes (
  id               uuid primary key default gen_random_uuid(),
  evaluation_id    uuid references qa.qa_evaluations(id) on delete set null,
  agent_email      text not null,
  ticket_number    text,
  comment          text,
  submitted_by     text not null,
  status           qa_dispute_status not null default 'pending_tl',
  response         text,
  tl_decision      text,
  tl_comment       text,
  tl_email         text,
  tl_action_at     timestamptz,
  qa_decision      text,
  qa_comment       text,
  qa_email         text,
  qa_action_at     timestamptz,
  last_updated_by  text,
  last_updated_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists qa_dispute_status_idx on qa.qa_disputes (status);
create index if not exists qa_dispute_agent_idx  on qa.qa_disputes (agent_email);
create index if not exists qa_dispute_eval_idx   on qa.qa_disputes (evaluation_id);

create table if not exists qa.qa_coaching (
  id                     uuid primary key default gen_random_uuid(),
  evaluation_id          uuid references qa.qa_evaluations(id) on delete set null,
  agent_email            text not null,
  coach_email            text not null,
  ticket_id              text,
  strengths              text,
  areas_for_improvement  text,
  action_plan            text,
  email_sent             boolean not null default false,
  team_lead_email        text,
  created_at             timestamptz not null default now()
);
create index if not exists qa_coaching_agent_idx on qa.qa_coaching (agent_email);
create index if not exists qa_coaching_eval_idx  on qa.qa_coaching (evaluation_id);
create index if not exists qa_coaching_coach_idx on qa.qa_coaching (coach_email);
