-- ─────────────────────────────────────────────────────────────
-- 017_coaching_ack.sql — agent acknowledgement of coaching.
-- Lets an agent confirm they've read their coaching; coaches/leads can see who
-- has engaged with feedback.
-- ─────────────────────────────────────────────────────────────

alter table qa.qa_coaching add column if not exists acknowledged_at timestamptz;
