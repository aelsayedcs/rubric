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
