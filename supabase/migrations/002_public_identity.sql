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
