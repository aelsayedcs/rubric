-- ─────────────────────────────────────────────────────────────
-- 001_enums.sql — shared enum types
-- ─────────────────────────────────────────────────────────────

create schema if not exists qa;

do $$ begin
  create type app_key as enum ('cockpit','dsat','quality','adherence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum (
    'system_owner','super_admin','admin','qa_evaluator','team_lead','agent','viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_channel as enum ('Chat','Call','Tickets');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_result as enum ('pass','fail','na');
exception when duplicate_object then null; end $$;

-- Evaluation status. QA-direct submissions are 'archived'; 'pending' supports an
-- optional team-lead-submission review flow.
do $$ begin
  create type qa_eval_status as enum ('pending','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_eval_source as enum ('manual','tl_submission','auto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qa_dispute_status as enum (
    'pending_tl','approved_tl','rejected_tl',
    'pending_qa','approved_qa','rejected_qa','resolved'
  );
exception when duplicate_object then null; end $$;
