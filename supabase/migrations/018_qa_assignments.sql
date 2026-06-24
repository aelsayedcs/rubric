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
