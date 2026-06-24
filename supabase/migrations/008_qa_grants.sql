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
