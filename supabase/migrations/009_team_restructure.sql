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
