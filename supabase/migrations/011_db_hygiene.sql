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
