# QA System — Database & Data Model

**Stack:** Supabase PostgreSQL · two schemas (`public`, `qa`) · migrations `001`–`018`.

## Overview
- **`public`** — identity, access control, audit, config, and cross-cutting tables: `profiles`, `app_access`, `teams`, `agents`, `audit_log`, `app_config`, `tools`, `page_access`, `notifications`, `qa_targets`, `qa_groups`, `qa_group_members`, `qa_rotation_pool`, `qa_rotation_overrides`.
- **`qa`** — domain tables: `qa_scorecards`, `qa_criteria`, `qa_evaluations`, `qa_evaluation_responses`, `qa_disputes`, `qa_coaching`, plus the `qa.analysis()` RPC.

Soft-deletes use `deleted_at` (evaluations) or `active`/`archived` flags. RLS is enabled on all tables; **API routes use the service-role key (bypasses RLS)** and enforce access in code.

## Enums (`001_enums.sql`)
| Enum | Values |
|---|---|
| `app_key` | `cockpit`, `dsat`, `quality`, `adherence` |
| `app_role` | `system_owner`, `super_admin`, `system_admin`, `admin`, `qa_evaluator`, `team_lead`, `agent`, `viewer` |
| `qa_channel` | `Chat`, `Call`, `Tickets` |
| `qa_result` | `pass`, `fail`, `na` |
| `qa_eval_status` | `pending`, `archived` |
| `qa_eval_source` | `manual`, `tl_submission`, `auto` |
| `qa_dispute_status` | `pending_tl`, `approved_tl`, `rejected_tl`, `pending_qa`, `approved_qa`, `rejected_qa`, `resolved` |

> **Adding a channel** (e.g. `Email`, `WhatsApp`): channels are a Postgres enum, so add the value
> with a migration — `alter type qa_channel add value 'Email';` — then include it in the channel
> set used by the scorecard builder (`{Chat,Call,Tickets}` in `019_scorecard_builder.sql` and the
> `/admin/scorecards` UI). Existing scorecards and evaluations are unaffected.

## Core tables (public)
- **profiles** `(id uuid PK→auth.users, email unique, full_name, status, created_at)` — identity.
- **app_access** `(id, email, app app_key, role app_role, archived, granted_by, created_at; unique(email,app))` — per-app role grant. **Role source of truth** for `getCurrentUser()`.
- **teams** `(id, name unique, team_lead_email, archived, created_at)` — TL registry.
- **agents** `(email PK, full_name, team_lead_email, team_id→teams, active, created_at)` — agent directory; `active=false` = archived. Emails normalized lowercase (011).
- **audit_log** `(id bigint, app, actor_email, action, entity, entity_id, field, old_value, new_value, ts)` — append-only; RLS-enabled with **no policies** (service-role only).
- **app_config** `(app, key, value, updated_at; PK(app,key))` — settings. Keys: `coaching_threshold`=85, `scorecard_name`, `rotation_anchor`=2026-01-04 (a Sunday).
- **page_access** `(key PK=route, label, section, roles text[], sort_order, updated_at)` — editable nav/access matrix (drives `/permissions`, nav, and `requirePageAccess`).
- **notifications** `(id bigint, app, recipient_email, type, title, body, link, read_at, created_at)` — in-app bell feed.
- **qa_targets** `(id, scope_type[global|team_lead|agent], scope_value, avg_score, max_critical_rate, min_coached_pct, updated_by, updated_at; unique(scope_type, coalesce(scope_value,'')))` — goals; most-specific scope wins (agent → TL → global).

### Assignment tables (migration 018)
- **qa_groups** `(id, name, sort_order, active, created_at)` — Group A/B/… (seeded A,B).
- **qa_group_members** `(agent_email PK → agents.email ON DELETE CASCADE, group_id → qa_groups ON DELETE CASCADE, updated_at)` — one group per agent; FK link only (no duplicated agent data). Archiving an agent (`active=false`) auto-hides them because reads join `agents.active=true`.
- **qa_rotation_pool** `(qa_email PK, sort_order, active, created_at)` — ordered QA pool driving the weekly cyclic rotation.
- **qa_rotation_overrides** `(week_start date, group_id, qa_email, updated_by, updated_at; PK(week_start,group_id))` — manual per-week override (`week_start` = the Sunday; weeks run Sun→Sat).

## Domain tables (qa)
- **qa_scorecards** `(id, name, version, channel, active, created_at; unique(name,version); partial unique index → only one active)`.
- **qa_criteria** `(id, scorecard_id→qa_scorecards CASCADE, section, label, weight int, is_critical bool, sort_order, archived)`. `is_critical=true` → any fail zeroes the score. Live scorecard = "Sample QA Scorecard" with sections Greeting & Closing, Handling Skills, Chat/Call Etiquette & Format, Process Documentation, Critical Mistakes.
- **qa_evaluations** `(id, scorecard_id→ RESTRICT, agent_email, evaluator_email, team_lead_email, ticket_number, customer_email, channel, eval_date, solved_date, score numeric(5,2), total_errors, total_critical_errors, status, acknowledged, disputed, coached, coached_by, coached_at, notes, areas_for_improvement, source, created_at, deleted_at)`. Rich indexing incl. partial indexes on `deleted_at IS NULL` and a dedupe index `(agent_email, ticket_number, eval_date)`.
- **qa_evaluation_responses** `(id, evaluation_id→ CASCADE, criterion_id→ RESTRICT, result; unique(evaluation_id,criterion_id))` — per-criterion pass/fail/na.
- **qa_disputes** `(id, evaluation_id→ SET NULL, agent_email, ticket_number, comment, submitted_by, status qa_dispute_status, response, tl_decision/tl_comment/tl_email/tl_action_at, qa_decision/qa_comment/qa_email/qa_action_at, last_updated_by, last_updated_at, created_at)` — agent→TL→QA workflow.
- **qa_coaching** `(id, evaluation_id→ SET NULL, agent_email, coach_email, ticket_id, strengths, areas_for_improvement, action_plan, email_sent, team_lead_email, acknowledged_at, created_at)`.

## `qa.analysis(p_from, p_to, p_channel, p_tl, p_agent) → jsonb` (010)
Server-side analytics in one round-trip. Returns `{ threshold, kpis{total,avgScore,criticalRate,coached,notCoached,needsCoaching,openDisputes}, coaching{…}, trend[], agents[], teamLeads[], channels[], mistakes[] }`. Filters by date range, channel, TL, agent; reads `coaching_threshold` from `app_config`. Granted to `service_role, authenticated`.

## RLS (006)
Enabled on all tables. Identity/config tables: readable by any authenticated user. `audit_log`: service-role only. `qa_evaluations`/responses/disputes/coaching: agent sees own, team_lead sees their team, QA staff see all (excluding `deleted_at`). Helper fns: `jwt_email()`, `current_app_role(app)`, `is_qa_staff()`. App writes use the service-role client and enforce access in code.

## Migration history
| # | Adds |
|---|---|
| 001 | enums |
| 002 | profiles, app_access, teams, agents, audit_log, app_config, tools |
| 003 | qa_scorecards, qa_criteria |
| 004 | qa_evaluations, qa_evaluation_responses |
| 005 | qa_disputes, qa_coaching |
| 006 | RLS policies + helper fns |
| 007 | seed scorecard + config |
| 008 | qa schema grants |
| 009 | sample team seed (generic starter agents + team leads) |
| 010 | `qa.analysis()` RPC |
| 011 | hygiene: partial indexes, email normalize |
| 012 | `system_admin` role tier |
| 013 | `page_access` table |
| 014 | qa_evaluator full access |
| 015 | notifications |
| 016 | qa_targets |
| 017 | qa_coaching.acknowledged_at |
| 018 | qa_groups, qa_group_members, qa_rotation_pool, qa_rotation_overrides |
| 019 | scorecard builder: `qa_attributes`, scorecard `channels`, criterion `channels`, draft/publish versioning |
| 020 | `qa_criteria.allow_na` (per-criterion N/A toggle) |

## Key FK behaviors
scorecard→evaluation `RESTRICT`; evaluation→responses `CASCADE`; criteria→responses `RESTRICT`; evaluation→disputes/coaching `SET NULL`; agents→qa_group_members `CASCADE`; qa_groups→members/overrides `CASCADE`.
