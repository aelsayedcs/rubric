-- ─────────────────────────────────────────────────────────────
-- 020_criteria_allow_na.sql — per-criterion control of whether "N/A" is offered.
-- Independent of is_critical (a criterion can be Pass/Fail only, or Pass/Fail/N/A).
-- Default: non-critical allow N/A; critical do not (preserves current behavior).
-- ─────────────────────────────────────────────────────────────
alter table qa.qa_criteria add column if not exists allow_na boolean not null default true;
update qa.qa_criteria set allow_na = false where is_critical;
