-- ─────────────────────────────────────────────────────────────
-- 004_qa_evaluations.sql — evaluations (header) + per-criterion responses
-- ─────────────────────────────────────────────────────────────

create table if not exists qa.qa_evaluations (
  id                     uuid primary key default gen_random_uuid(),
  scorecard_id           uuid not null references qa.qa_scorecards(id) on delete restrict,
  agent_email            text not null,
  evaluator_email        text not null,
  team_lead_email        text,
  ticket_number          text not null,
  customer_email         text,
  channel                qa_channel not null,
  eval_date              timestamptz not null,
  solved_date            date,
  score                  numeric(5,2) not null,
  total_errors           int not null default 0,
  total_critical_errors  int not null default 0,
  status                 qa_eval_status not null default 'archived',
  acknowledged           boolean not null default false,
  disputed               boolean not null default false,
  coached                boolean not null default false,
  coached_by             text,                         -- QA who coached
  coached_at             timestamptz,                  -- one-time in V1
  notes                  text,
  areas_for_improvement  text,
  source                 qa_eval_source not null default 'manual',
  created_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index if not exists qa_eval_agent_idx      on qa.qa_evaluations (agent_email);
create index if not exists qa_eval_evaluator_idx  on qa.qa_evaluations (evaluator_email);
create index if not exists qa_eval_tl_idx         on qa.qa_evaluations (team_lead_email);
create index if not exists qa_eval_status_idx     on qa.qa_evaluations (status);
create index if not exists qa_eval_channel_idx    on qa.qa_evaluations (channel);
create index if not exists qa_eval_date_idx       on qa.qa_evaluations (eval_date desc);
create index if not exists qa_eval_deleted_idx    on qa.qa_evaluations (deleted_at);
create index if not exists qa_eval_coached_idx    on qa.qa_evaluations (coached);

-- Dedupe guard: one live evaluation per (agent, ticket, eval_date).
create unique index if not exists qa_eval_dedupe
  on qa.qa_evaluations (agent_email, ticket_number, eval_date)
  where deleted_at is null;

create table if not exists qa.qa_evaluation_responses (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references qa.qa_evaluations(id) on delete cascade,
  criterion_id  uuid not null references qa.qa_criteria(id) on delete restrict,
  result        qa_result not null default 'na',
  unique (evaluation_id, criterion_id)
);
create index if not exists qa_resp_eval_idx     on qa.qa_evaluation_responses (evaluation_id);
create index if not exists qa_resp_crit_idx     on qa.qa_evaluation_responses (criterion_id, result);
