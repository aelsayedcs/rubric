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
