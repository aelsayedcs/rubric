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
