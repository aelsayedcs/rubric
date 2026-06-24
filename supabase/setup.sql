-- ============================================================
-- Rubric — full setup (paste into Supabase SQL Editor → Run)
-- Runs every migration in order. Idempotent: safe to re-run.
-- After running, bootstrap your first admin at the bottom of this file.
-- ============================================================


-- ── migrations/001_enums.sql ──
-- ─────────────────────────────────────────────────────────────
-- 001_enums.sql — shared enum types
-- ─────────────────────────────────────────────────────────────

create schema if not exists qa;

do $$ begin
  create type app_key as enum ('cockpit','dsat','quality','adherence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum (
    'system_owner','super_admin','admin','qa_evaluator','team_lead','agent','viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_channel as enum ('Chat','Call','Tickets');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_result as enum ('pass','fail','na');
exception when duplicate_object then null; end $$;

-- Evaluation status. QA-direct submissions are 'archived'; 'pending' supports an
-- optional team-lead-submission review flow.
do $$ begin
  create type qa_eval_status as enum ('pending','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_eval_source as enum ('manual','tl_submission','auto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_dispute_status as enum (
    'pending_tl','approved_tl','rejected_tl',
    'pending_qa','approved_qa','rejected_qa','resolved'
  );
exception when duplicate_object then null; end $$;


-- ── migrations/002_public_identity.sql ──
-- ─────────────────────────────────────────────────────────────
-- 002_public_identity.sql — shared identity & access (public schema)
-- These tables are designed to become the CX Cockpit shared layer unchanged.
-- ─────────────────────────────────────────────────────────────

-- One row per real user. id mirrors auth.users.id.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  status      text not null default 'active',   -- active | disabled
  created_at  timestamptz not null default now()
);

-- Per-tool role grants. A user may hold a different role per app.
create table if not exists public.app_access (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  app         app_key not null,
  role        app_role not null,
  archived    boolean not null default false,
  granted_by  text,
  created_at  timestamptz not null default now(),
  unique (email, app)
);
create index if not exists app_access_app_role_idx on public.app_access (app, role);
create index if not exists app_access_email_idx     on public.app_access (email);

create table if not exists public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  team_lead_email  text,
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Agent directory + team-lead mapping (merges QA Agent_teamLeader_Settings).
create table if not exists public.agents (
  email            text primary key,
  full_name        text,
  team_lead_email  text,
  team_id          uuid references public.teams(id) on delete set null,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists agents_tl_idx     on public.agents (team_lead_email);
create index if not exists agents_active_idx  on public.agents (active);

-- Generic append-only audit trail (QA, later DSAT).
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  app         app_key not null,
  actor_email text not null,
  action      text not null,        -- CREATE | UPDATE | DELETE | COACH | DISPUTE | ...
  entity      text not null,        -- qa_evaluation | qa_dispute | ...
  entity_id   text not null,
  field       text,
  old_value   text,
  new_value   text,
  ts          timestamptz not null default now()
);
create index if not exists audit_log_ts_idx     on public.audit_log (ts desc);
create index if not exists audit_log_entity_idx on public.audit_log (app, entity, entity_id);

-- Key/value settings per app (replaces QA AppConfig).
create table if not exists public.app_config (
  app        app_key not null,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (app, key)
);

-- Registry that will drive the Cockpit tile grid later.
create table if not exists public.tools (
  key         text primary key,
  name        text not null,
  url         text not null,
  icon        text,
  description text,
  enabled     boolean not null default true,
  sort_order  int not null default 0
);


-- ── migrations/003_qa_scorecard.sql ──
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


-- ── migrations/004_qa_evaluations.sql ──
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


-- ── migrations/005_qa_workflow.sql ──
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


-- ── migrations/006_rls_policies.sql ──
-- ─────────────────────────────────────────────────────────────
-- 006_rls_policies.sql — Row-Level Security
-- Admin/QA write paths use the service-role key in API routes (bypass RLS).
-- These policies govern the anon/authenticated (browser) client.
-- ─────────────────────────────────────────────────────────────

-- Helper: email of the current authenticated user (from JWT).
create or replace function public.jwt_email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')
$$;

-- Helper: the caller's role for a given app (null if none / archived).
-- NB: named current_app_role (not app_role) to avoid colliding with the
-- app_role ENUM TYPE — `app_role('quality')` would be parsed as a cast.
create or replace function public.current_app_role(_app app_key) returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.app_access
  where email = public.jwt_email() and app = _app and not archived
  limit 1
$$;

-- Helper: is the caller QA staff (admin tier) for the quality app?
create or replace function public.is_qa_staff() returns boolean
language sql stable as $$
  select public.current_app_role('quality') in ('qa_evaluator','admin','super_admin','system_owner')
$$;

-- ── public identity tables: readable by any authenticated user ──
alter table public.profiles    enable row level security;
alter table public.app_access  enable row level security;
alter table public.teams       enable row level security;
alter table public.agents      enable row level security;
alter table public.app_config  enable row level security;
alter table public.tools       enable row level security;

-- audit_log: RLS on with NO policies → no client (anon/authenticated) access.
-- Only the service-role key (server API routes) can write/read it, bypassing RLS.
alter table public.audit_log enable row level security;

do $$ begin
  create policy profiles_read   on public.profiles   for select using (public.jwt_email() is not null);
  create policy app_access_read on public.app_access for select using (public.jwt_email() is not null);
  create policy teams_read      on public.teams      for select using (public.jwt_email() is not null);
  create policy agents_read     on public.agents     for select using (public.jwt_email() is not null);
  create policy app_config_read on public.app_config for select using (public.jwt_email() is not null);
  create policy tools_read      on public.tools      for select using (public.jwt_email() is not null);
exception when duplicate_object then null; end $$;

-- ── qa.qa_scorecards / qa.qa_criteria: readable by all authenticated ──
alter table qa.qa_scorecards enable row level security;
alter table qa.qa_criteria   enable row level security;
do $$ begin
  create policy scorecards_read on qa.qa_scorecards for select using (public.jwt_email() is not null);
  create policy criteria_read   on qa.qa_criteria   for select using (public.jwt_email() is not null);
exception when duplicate_object then null; end $$;

-- ── qa.qa_evaluations: agent sees own; team_lead sees team; QA staff see all ──
alter table qa.qa_evaluations enable row level security;
do $$ begin
  create policy eval_read on qa.qa_evaluations for select using (
    deleted_at is null and (
      agent_email = public.jwt_email()                       -- own
      or team_lead_email = public.jwt_email()                -- their team
      or public.is_qa_staff()                                -- QA staff
    )
  );
exception when duplicate_object then null; end $$;

-- ── qa.qa_evaluation_responses: visible when the parent evaluation is ──
alter table qa.qa_evaluation_responses enable row level security;
do $$ begin
  create policy resp_read on qa.qa_evaluation_responses for select using (
    exists (
      select 1 from qa.qa_evaluations e
      where e.id = evaluation_id and e.deleted_at is null and (
        e.agent_email = public.jwt_email()
        or e.team_lead_email = public.jwt_email()
        or public.is_qa_staff()
      )
    )
  );
exception when duplicate_object then null; end $$;

-- ── qa.qa_disputes: agent sees/creates own; TL sees team; QA staff all ──
alter table qa.qa_disputes enable row level security;
do $$ begin
  create policy dispute_read on qa.qa_disputes for select using (
    agent_email = public.jwt_email()
    or tl_email = public.jwt_email()
    or public.is_qa_staff()
  );
  create policy dispute_insert on qa.qa_disputes for insert with check (
    agent_email = public.jwt_email() or public.is_qa_staff()
  );
exception when duplicate_object then null; end $$;

-- ── qa.qa_coaching: agent sees own; QA staff all ──
alter table qa.qa_coaching enable row level security;
do $$ begin
  create policy coaching_read on qa.qa_coaching for select using (
    agent_email = public.jwt_email()
    or team_lead_email = public.jwt_email()
    or public.is_qa_staff()
  );
exception when duplicate_object then null; end $$;


-- ── migrations/007_seed_scorecard.sql ──
-- ─────────────────────────────────────────────────────────────
-- 007_seed_scorecard.sql — a generic SAMPLE CX QA scorecard (v1).
-- This is only a starting example — edit it freely in-app at /admin/scorecards
-- (criteria, weights, sections, channels are all runtime-editable).
-- Scored (non-critical) weights total = 100. Critical items deduct nothing but
-- force the final score to 0 on any Fail.
-- ─────────────────────────────────────────────────────────────

insert into qa.qa_scorecards (name, version, channel, active)
values ('Sample QA Scorecard', 1, 'All', true)
on conflict (name, version) do nothing;

with sc as (
  select id from qa.qa_scorecards where name = 'Sample QA Scorecard' and version = 1
)
insert into qa.qa_criteria (scorecard_id, section, label, weight, is_critical, sort_order)
select sc.id, c.section, c.label, c.weight, c.is_critical, c.sort_order
from sc, (values
  -- section, label, weight, is_critical, sort_order
  ('Communication',          'Professional, friendly greeting',                  7,  false,  1),
  ('Communication',          'Clear and concise language',                       8,  false,  2),
  ('Communication',          'Positive, empathetic tone',                        10, false,  3),
  ('Problem Solving',        'Correctly identified the customer''s issue',       10, false,  4),
  ('Problem Solving',        'Accurate and complete solution',                   15, false,  5),
  ('Problem Solving',        'Proactively prevented follow-up contacts',         5,  false,  6),
  ('Live Channel Etiquette', 'Followed hold / wait-time protocol',               5,  false,  7),
  ('Live Channel Etiquette', 'Minimized dead air / response gaps',               5,  false,  8),
  ('Live Channel Etiquette', 'Correct grammar, spelling and punctuation',        8,  false,  9),
  ('Process & Compliance',   'Followed the correct workflow',                    8,  false, 10),
  ('Process & Compliance',   'Logged a clear, accurate summary',                 7,  false, 11),
  ('Process & Compliance',   'Verified customer identity',                       0,  true,  12),
  ('Process & Compliance',   'Followed data-privacy policy',                     0,  true,  13),
  ('Closing',                'Confirmed the issue was resolved',                 7,  false, 14),
  ('Closing',                'Offered further help and closed politely',         5,  false, 15),
  ('Critical Mistakes',      'Gave accurate information (no misinformation)',     0,  true,  16),
  ('Critical Mistakes',      'Stayed professional and respectful throughout',    0,  true,  17),
  ('Critical Mistakes',      'Routed / escalated to the correct team',           0,  true,  18)
) as c(section, label, weight, is_critical, sort_order)
where not exists (
  select 1 from qa.qa_criteria x where x.scorecard_id = sc.id and x.sort_order = c.sort_order
);

-- ── App config defaults (quality app) ───────────────────────
insert into public.app_config (app, key, value) values
  ('quality', 'coaching_threshold', '85'),          -- score < 85 ⇒ "needs coaching" hint
  ('quality', 'scorecard_name',     'Sample QA Scorecard')
on conflict (app, key) do nothing;

-- ── Register this tool for the optional multi-app tile grid ──
insert into public.tools (key, name, url, icon, description, enabled, sort_order) values
  ('quality', 'Quality (QA)', 'https://qa.example.com', 'clipboard-check',
   'Customer-experience quality evaluations, disputes & coaching', true, 10)
on conflict (key) do nothing;


-- ── migrations/008_qa_grants.sql ──
-- ─────────────────────────────────────────────────────────────
-- 008_qa_grants.sql — grant the Supabase API roles access to the qa schema.
-- A newly-created schema does NOT auto-grant to anon/authenticated/service_role.
-- Row access is still governed by RLS (migration 006); service_role bypasses RLS.
-- ─────────────────────────────────────────────────────────────

grant usage on schema qa to anon, authenticated, service_role;

grant all on all tables    in schema qa to anon, authenticated, service_role;
grant all on all sequences in schema qa to anon, authenticated, service_role;
grant all on all functions in schema qa to anon, authenticated, service_role;

-- Future objects in qa inherit the same grants.
alter default privileges in schema qa grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema qa grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema qa grant all on functions to anon, authenticated, service_role;


-- ── migrations/009_team_restructure.sql ──
-- ─────────────────────────────────────────────────────────────
-- 009_sample_team.sql — a tiny GENERIC sample team to get you started.
-- Replace this with your own people via the in-app /team admin page
-- (add/edit/archive agents and team leads at runtime — no SQL needed).
-- `team_lead_email` on agents/teams is a plain text label (no FK), so these
-- sample addresses are safe to seed before any accounts exist.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── Team-lead registry (public.teams) ─────────────────────────
insert into public.teams (name, team_lead_email, archived) values
  ('Team Alpha', 'lead.alpha@example.com', false),
  ('Team Beta',  'lead.beta@example.com',  false)
on conflict (name) do update
  set team_lead_email = excluded.team_lead_email,
      archived        = excluded.archived;

-- ── Sample agents mapped to the two sample team leads ─────────
insert into public.agents (email, full_name, team_lead_email, active) values
  ('alice@example.com',   'Alice Example',   'lead.alpha@example.com', true),
  ('bob@example.com',     'Bob Example',     'lead.alpha@example.com', true),
  ('carol@example.com',   'Carol Example',   'lead.alpha@example.com', true),
  ('dave@example.com',    'Dave Example',    'lead.beta@example.com',  true),
  ('erin@example.com',    'Erin Example',    'lead.beta@example.com',  true),
  ('frank@example.com',   'Frank Example',   'lead.beta@example.com',  true)
on conflict (email) do update
  set full_name       = excluded.full_name,
      team_lead_email = excluded.team_lead_email,
      active          = true;

commit;


-- ── migrations/010_analysis_fn.sql ──
-- ─────────────────────────────────────────────────────────────
-- 010_analysis_fn.sql — server-side analytics aggregation.
-- Returns the exact JSON shape /api/analysis used to build in Node, but computed
-- in Postgres in one round-trip (no 20k-row pulls). Filters: date range, channel,
-- team lead, agent. Coaching threshold read from app_config (default 85).
-- ─────────────────────────────────────────────────────────────

create or replace function qa.analysis(
  p_from    text default null,
  p_to      text default null,
  p_channel text default null,
  p_tl      text default null,
  p_agent   text default null
) returns jsonb
language sql
stable
as $$
with thr as (
  select coalesce(
    (select nullif(value,'')::numeric from public.app_config
      where app = 'quality' and key = 'coaching_threshold'), 85) as t
),
e as (
  select ev.id, ev.agent_email, ev.team_lead_email, ev.channel, ev.score,
         ev.total_critical_errors, ev.coached, ev.disputed, ev.eval_date
  from qa.qa_evaluations ev
  where ev.deleted_at is null
    and (nullif(p_from,'')    is null or ev.eval_date >= (p_from::date)::timestamptz)
    and (nullif(p_to,'')      is null or ev.eval_date <  ((p_to::date) + 1))
    and (nullif(p_channel,'') is null or ev.channel = p_channel::qa_channel)
    and (nullif(p_tl,'')      is null or ev.team_lead_email = p_tl)
    and (nullif(p_agent,'')   is null or ev.agent_email = p_agent)
)
select jsonb_build_object(
  'threshold', (select t from thr),
  'kpis', (
    select jsonb_build_object(
      'total',         count(*),
      'avgScore',      round(coalesce(avg(score),0),1),
      'criticalRate',  case when count(*)=0 then 0 else round(100.0*count(*) filter (where total_critical_errors>0)/count(*)) end,
      'coached',       count(*) filter (where coached),
      'notCoached',    count(*) filter (where not coached),
      'needsCoaching', count(*) filter (where not coached and (score < (select t from thr) or total_critical_errors>0)),
      'openDisputes',  count(*) filter (where disputed)
    ) from e
  ),
  'coaching', (
    select jsonb_build_object(
      'coached',       count(*) filter (where coached),
      'notCoached',    count(*) filter (where not coached),
      'needsCoaching', count(*) filter (where not coached and (score < (select t from thr) or total_critical_errors>0))
    ) from e
  ),
  'trend', coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'count', c, 'avgScore', a) order by m)
    from (select to_char(eval_date,'YYYY-MM') m, count(*) c, round(avg(score),1) a
          from e group by 1) t
  ), '[]'::jsonb),
  'agents', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', agent_email, 'evals', c, 'avgScore', a,
      'criticalErrors', crit, 'coachedPct', cp, 'disputes', disp) order by c desc)
    from (
      select agent_email, count(*) c, round(avg(score),1) a,
             count(*) filter (where total_critical_errors>0) crit,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where coached)/count(*)) end cp,
             count(*) filter (where disputed) disp
      from e group by agent_email
    ) t
  ), '[]'::jsonb),
  'teamLeads', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', team_lead_email, 'evals', c, 'avgScore', a,
      'coachedPct', cp, 'disputeRate', dr) order by c desc)
    from (
      select team_lead_email, count(*) c, round(avg(score),1) a,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where coached)/count(*)) end cp,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where disputed)/count(*)) end dr
      from e where team_lead_email is not null group by team_lead_email
    ) t
  ), '[]'::jsonb),
  'channels', coalesce((
    select jsonb_agg(jsonb_build_object('key', channel, 'evals', c, 'avgScore', a) order by c desc)
    from (select channel, count(*) c, round(avg(score),1) a from e group by channel) t
  ), '[]'::jsonb),
  'mistakes', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'section', section, 'fails', fails) order by fails desc)
    from (
      select c.label, c.section, count(*) fails
      from qa.qa_evaluation_responses r
      join e on e.id = r.evaluation_id
      join qa.qa_criteria c on c.id = r.criterion_id
      where r.result = 'fail'
      group by c.label, c.section
    ) t
  ), '[]'::jsonb)
);
$$;

grant execute on function qa.analysis(text, text, text, text, text) to service_role, authenticated;


-- ── migrations/011_db_hygiene.sql ──
-- ─────────────────────────────────────────────────────────────
-- 011_db_hygiene.sql — indexes for qa.analysis + TL referential tidy-up.
-- ─────────────────────────────────────────────────────────────

-- Composite partial indexes matching the analysis filters (deleted_at is null
-- + eval_date range, optionally scoped by team lead / agent).
create index if not exists qa_eval_live_date_idx
  on qa.qa_evaluations (eval_date) where deleted_at is null;
create index if not exists qa_eval_live_tl_date_idx
  on qa.qa_evaluations (team_lead_email, eval_date) where deleted_at is null;
create index if not exists qa_eval_live_agent_date_idx
  on qa.qa_evaluations (agent_email, eval_date) where deleted_at is null;

-- Normalize identity emails (writes already use normEmail; this fixes legacy rows).
update public.agents set email = lower(btrim(email))
  where email <> lower(btrim(email));
update public.agents set team_lead_email = lower(btrim(team_lead_email))
  where team_lead_email is not null and team_lead_email <> lower(btrim(team_lead_email));
update public.teams set team_lead_email = lower(btrim(team_lead_email))
  where team_lead_email is not null and team_lead_email <> lower(btrim(team_lead_email));

-- One team-lead registry row per email (teams.name is already unique = email).
create unique index if not exists teams_tl_email_uidx
  on public.teams (team_lead_email);


-- ── migrations/012_system_admin_role.sql ──
-- ─────────────────────────────────────────────────────────────
-- 012_system_admin_role.sql
-- Adds the DSAT-style top admin tier: system_admin > super_admin > admin.
-- (Postgres enums are append-only; system_owner stays valid but is superseded
--  by system_admin as the canonical highest role.)
-- ─────────────────────────────────────────────────────────────
alter type public.app_role add value if not exists 'system_admin' before 'super_admin';


-- ── migrations/013_page_access.sql ──
-- ─────────────────────────────────────────────────────────────
-- 013_page_access.sql — editable page→role visibility matrix.
-- Drives the nav (which pages each role sees). API routes keep their own
-- requireRole guards; this controls visibility, managed from /permissions.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.page_access (
  key         text primary key,         -- route, e.g. '/analysis'
  label       text not null,
  section     text not null default 'Main',
  roles       text[] not null default '{}',
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now()
);

-- Seed with the app's pages and their current default visibility.
insert into public.page_access (key, label, section, roles, sort_order) values
  ('/analysis',       'Analysis',    'Main',  array['qa_evaluator','team_lead','admin','super_admin','system_owner','system_admin'], 1),
  ('/results',        'Results',     'Main',  array['agent','team_lead','qa_evaluator','admin','super_admin','system_owner','system_admin'], 2),
  ('/evaluate',       'Evaluate',    'Main',  array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 3),
  ('/disputes',       'Disputes',    'Main',  array['agent','team_lead','qa_evaluator','admin','super_admin','system_owner','system_admin'], 4),
  ('/team',           'Team',        'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 5),
  ('/admin/audit',    'Audit',       'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 6),
  ('/admin/settings', 'Settings',    'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 7),
  ('/performance',    'Performance', 'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 8),
  ('/admin/access',   'Access',      'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 9),
  ('/permissions',    'Permissions', 'Admin', array['system_owner','system_admin'], 10)
on conflict (key) do nothing;


-- ── migrations/014_qa_evaluator_full_access.sql ──
-- ─────────────────────────────────────────────────────────────
-- 014_qa_evaluator_full_access.sql — grant qa_evaluator the full
-- super_admin surface (product decision 2026-06).
-- Adds 'qa_evaluator' to every page that super_admin can see (i.e. every
-- page except /permissions, which stays top-tier only — matching super_admin).
-- Idempotent: only appends the role where it's missing.
-- ─────────────────────────────────────────────────────────────

update public.page_access
set roles = array_append(roles, 'qa_evaluator'),
    updated_at = now()
where key <> '/permissions'
  and not ('qa_evaluator' = any(roles));


-- ── migrations/015_notifications.sql ──
-- ─────────────────────────────────────────────────────────────
-- 015_notifications.sql — in-app notifications.
-- Lightweight per-user notification feed (bell icon). Written by the app on key
-- events (dispute raised/decided, coaching assigned); read via /api/notifications.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id              bigint generated always as identity primary key,
  app             app_key not null default 'quality',
  recipient_email text not null,
  type            text not null,         -- dispute_raised | dispute_decision | coaching | ...
  title           text not null,
  body            text,
  link            text,                  -- in-app route to open
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_email, read_at);
create index if not exists notifications_created_idx   on public.notifications (created_at desc);

alter table public.notifications enable row level security;
-- Service role (used by the app server) bypasses RLS; this policy lets a signed-in
-- user read their own notifications directly if ever queried client-side.
do $$ begin
  create policy notifications_read_own on public.notifications
    for select using (recipient_email = auth.jwt() ->> 'email');
exception when duplicate_object then null; end $$;


-- ── migrations/016_targets.sql ──
-- ─────────────────────────────────────────────────────────────
-- 016_targets.sql — QA performance targets / goals.
-- One row per scope (global, a team lead, or an agent). The most specific row
-- that matches an agent wins (agent → their team lead → global). Any metric left
-- null means "no target for that metric".
-- ─────────────────────────────────────────────────────────────

create table if not exists public.qa_targets (
  id                uuid primary key default gen_random_uuid(),
  scope_type        text not null check (scope_type in ('global','team_lead','agent')),
  scope_value       text,            -- email for team_lead/agent; null for global
  avg_score         numeric,         -- min average score %
  max_critical_rate numeric,         -- max % of evaluations with a critical error
  min_coached_pct   numeric,         -- min coaching coverage %
  updated_by        text,
  updated_at        timestamptz not null default now()
);

create unique index if not exists qa_targets_scope_idx
  on public.qa_targets (scope_type, coalesce(scope_value, ''));

-- Seed a global target (editable in the Targets admin page). Avg-score target
-- mirrors the current coaching threshold; the rest are sensible starting points.
insert into public.qa_targets (scope_type, scope_value, avg_score, max_critical_rate, min_coached_pct, updated_by)
values ('global', null,
        coalesce((select nullif(value,'')::numeric from public.app_config where app='quality' and key='coaching_threshold'), 85),
        10, 80, 'system')
on conflict (scope_type, coalesce(scope_value, '')) do nothing;


-- ── migrations/017_coaching_ack.sql ──
-- ─────────────────────────────────────────────────────────────
-- 017_coaching_ack.sql — agent acknowledgement of coaching.
-- Lets an agent confirm they've read their coaching; coaches/leads can see who
-- has engaged with feedback.
-- ─────────────────────────────────────────────────────────────

alter table qa.qa_coaching add column if not exists acknowledged_at timestamptz;


-- ── migrations/018_qa_assignments.sql ──
-- ─────────────────────────────────────────────────────────────
-- 018_qa_assignments.sql — QA group assignment + weekly rotation.
-- Agents are split into groups (A/B/…); a pool of QAs rotates weekly across the
-- groups (auto cyclic shift, with optional per-week manual overrides). Weeks run
-- Sunday→Saturday. Membership is a FK link to public.agents (single source of
-- truth) so archived agents auto-disappear from rosters.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.qa_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.qa_group_members (
  agent_email text primary key references public.agents(email) on delete cascade,
  group_id    uuid not null references public.qa_groups(id) on delete cascade,
  updated_at  timestamptz not null default now()
);
create index if not exists qa_group_members_group_idx on public.qa_group_members(group_id);

create table if not exists public.qa_rotation_pool (
  qa_email    text primary key,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.qa_rotation_overrides (
  week_start  date not null,                                   -- the Sunday of the week
  group_id    uuid not null references public.qa_groups(id) on delete cascade,
  qa_email    text not null,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (week_start, group_id)
);

-- Week-index anchor (a SUNDAY); weeks run Sun→Sat. 2026-01-04 is a Sunday.
insert into public.app_config (app, key, value) values ('quality', 'rotation_anchor', '2026-01-04')
  on conflict (app, key) do nothing;

-- ── Seed Group A / Group B ──────────────────────────────────
insert into public.qa_groups (name, sort_order) values ('Group A', 1) on conflict do nothing;
insert into public.qa_groups (name, sort_order) values ('Group B', 2) on conflict do nothing;

-- Seed members (lowercased to match normalized agents.email). Only agents that
-- actually exist in public.agents are inserted (skips typos / missing agents).
insert into public.qa_group_members (agent_email, group_id)
select lower(e), (select id from public.qa_groups where name = 'Group A' limit 1)
from unnest(array[
  'alice@example.com','bob@example.com','carol@example.com'
]) e
where exists (select 1 from public.agents a where a.email = lower(e))
on conflict (agent_email) do update set group_id = excluded.group_id, updated_at = now();

insert into public.qa_group_members (agent_email, group_id)
select lower(e), (select id from public.qa_groups where name = 'Group B' limit 1)
from unnest(array[
  'dave@example.com','erin@example.com','frank@example.com'
]) e
where exists (select 1 from public.agents a where a.email = lower(e))
on conflict (agent_email) do update set group_id = excluded.group_id, updated_at = now();


-- ── migrations/019_scorecard_builder.sql ──
-- ─────────────────────────────────────────────────────────────
-- 019_scorecard_builder.sql — versioned, channel-scoped scorecards with
-- first-class attributes (sections) and channel-tagged sub-attributes (criteria).
-- Channels stored as text[] over {Chat,Call,Tickets} (full set = "all channels").
-- ─────────────────────────────────────────────────────────────

-- 1) Scorecards: channel scope + versioning metadata
alter table qa.qa_scorecards
  add column if not exists channels text[] not null default '{Chat,Call,Tickets}',
  add column if not exists published_at timestamptz,
  add column if not exists created_by text;

-- Backfill channels from the legacy single `channel` text column.
update qa.qa_scorecards
  set channels = case when channel is null or channel = 'All'
                      then array['Chat','Call','Tickets'] else array[channel] end;
update qa.qa_scorecards set published_at = coalesce(published_at, created_at) where active;

-- One ACTIVE version per scorecard NAME (replaces the global single-active rule).
drop index if exists qa.qa_scorecards_one_active;
create unique index if not exists qa_scorecards_active_per_name
  on qa.qa_scorecards (name) where active;

-- 2) Attributes (first-class "sections")
create table if not exists qa.qa_attributes (
  id           uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references qa.qa_scorecards(id) on delete cascade,
  name         text not null,
  sort_order   int not null default 0,
  channels     text[] not null default '{Chat,Call,Tickets}',
  archived     boolean not null default false
);
create index if not exists qa_attributes_scorecard_idx on qa.qa_attributes(scorecard_id, sort_order);

-- 3) Criteria (sub-attributes): link to attribute + channel scope
alter table qa.qa_criteria
  add column if not exists attribute_id uuid references qa.qa_attributes(id) on delete cascade,
  add column if not exists channels text[] not null default '{Chat,Call,Tickets}';

-- 4) Backfill attributes from each scorecard's distinct sections, then link criteria.
insert into qa.qa_attributes (scorecard_id, name, sort_order, channels)
select scorecard_id, section,
       (row_number() over (partition by scorecard_id order by min(sort_order))) - 1,
       array['Chat','Call','Tickets']
from qa.qa_criteria
group by scorecard_id, section;

update qa.qa_criteria c
  set attribute_id = a.id
from qa.qa_attributes a
where a.scorecard_id = c.scorecard_id and a.name = c.section and c.attribute_id is null;


-- ── migrations/020_criteria_allow_na.sql ──
-- ─────────────────────────────────────────────────────────────
-- 020_criteria_allow_na.sql — per-criterion control of whether "N/A" is offered.
-- Independent of is_critical (a criterion can be Pass/Fail only, or Pass/Fail/N/A).
-- Default: non-critical allow N/A; critical do not (preserves current behavior).
-- ─────────────────────────────────────────────────────────────
alter table qa.qa_criteria add column if not exists allow_na boolean not null default true;
update qa.qa_criteria set allow_na = false where is_critical;


-- ── Bootstrap your first admin ──────────────────────────────
-- 1) Sign up once in the app (or create the user in Supabase Auth).
-- 2) Replace the email below with yours and run this block to grant
--    yourself super_admin on the quality app.
insert into public.profiles (id, email)
select id, email from auth.users where lower(email)='you@example.com'
on conflict (email) do nothing;
insert into public.app_access (email, app, role)
values ('you@example.com','quality','super_admin')
on conflict (email, app) do update set role='super_admin', archived=false;
