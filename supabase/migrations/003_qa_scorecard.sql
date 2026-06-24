-- ─────────────────────────────────────────────────────────────
-- 003_qa_scorecard.sql — versioned scorecard + criteria
-- ─────────────────────────────────────────────────────────────

create table if not exists qa.qa_scorecards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  version     int not null default 1,
  channel     text not null default 'All',   -- Chat | Call | Tickets | All
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (name, version)
);
-- Only one active scorecard at a time.
create unique index if not exists qa_scorecards_one_active
  on qa.qa_scorecards ((active)) where active;

create table if not exists qa.qa_criteria (
  id           uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references qa.qa_scorecards(id) on delete cascade,
  section      text not null,
  label        text not null,
  weight       int not null default 0,        -- points deducted on Fail; 0 for critical
  is_critical  boolean not null default false, -- any Fail ⇒ score 0
  sort_order   int not null default 0,
  archived     boolean not null default false
);
create index if not exists qa_criteria_scorecard_idx
  on qa.qa_criteria (scorecard_id, sort_order);
