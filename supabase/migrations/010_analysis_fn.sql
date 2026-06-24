-- ─────────────────────────────────────────────────────────────
-- 010_analysis_fn.sql — server-side analytics aggregation.
-- Returns the exact JSON shape /api/analysis used to build in Node, but computed
-- in Postgres in one round-trip (no 20k-row pulls). Filters: date range, channel,
-- team lead, agent. Coaching threshold read from app_config (default 85).
-- ─────────────────────────────────────────────────────────────

create or replace function qa.analysis(
  p_from    text default null,
  p_to      text default null,
  p_channel text default null,
  p_tl      text default null,
  p_agent   text default null
) returns jsonb
language sql
stable
as $$
with thr as (
  select coalesce(
    (select nullif(value,'')::numeric from public.app_config
      where app = 'quality' and key = 'coaching_threshold'), 85) as t
),
e as (
  select ev.id, ev.agent_email, ev.team_lead_email, ev.channel, ev.score,
         ev.total_critical_errors, ev.coached, ev.disputed, ev.eval_date
  from qa.qa_evaluations ev
  where ev.deleted_at is null
    and (nullif(p_from,'')    is null or ev.eval_date >= (p_from::date)::timestamptz)
    and (nullif(p_to,'')      is null or ev.eval_date <  ((p_to::date) + 1))
    and (nullif(p_channel,'') is null or ev.channel = p_channel::qa_channel)
    and (nullif(p_tl,'')      is null or ev.team_lead_email = p_tl)
    and (nullif(p_agent,'')   is null or ev.agent_email = p_agent)
)
select jsonb_build_object(
  'threshold', (select t from thr),
  'kpis', (
    select jsonb_build_object(
      'total',         count(*),
      'avgScore',      round(coalesce(avg(score),0),1),
      'criticalRate',  case when count(*)=0 then 0 else round(100.0*count(*) filter (where total_critical_errors>0)/count(*)) end,
      'coached',       count(*) filter (where coached),
      'notCoached',    count(*) filter (where not coached),
      'needsCoaching', count(*) filter (where not coached and (score < (select t from thr) or total_critical_errors>0)),
      'openDisputes',  count(*) filter (where disputed)
    ) from e
  ),
  'coaching', (
    select jsonb_build_object(
      'coached',       count(*) filter (where coached),
      'notCoached',    count(*) filter (where not coached),
      'needsCoaching', count(*) filter (where not coached and (score < (select t from thr) or total_critical_errors>0))
    ) from e
  ),
  'trend', coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'count', c, 'avgScore', a) order by m)
    from (select to_char(eval_date,'YYYY-MM') m, count(*) c, round(avg(score),1) a
          from e group by 1) t
  ), '[]'::jsonb),
  'agents', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', agent_email, 'evals', c, 'avgScore', a,
      'criticalErrors', crit, 'coachedPct', cp, 'disputes', disp) order by c desc)
    from (
      select agent_email, count(*) c, round(avg(score),1) a,
             count(*) filter (where total_critical_errors>0) crit,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where coached)/count(*)) end cp,
             count(*) filter (where disputed) disp
      from e group by agent_email
    ) t
  ), '[]'::jsonb),
  'teamLeads', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', team_lead_email, 'evals', c, 'avgScore', a,
      'coachedPct', cp, 'disputeRate', dr) order by c desc)
    from (
      select team_lead_email, count(*) c, round(avg(score),1) a,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where coached)/count(*)) end cp,
             case when count(*)=0 then 0 else round(100.0*count(*) filter (where disputed)/count(*)) end dr
      from e where team_lead_email is not null group by team_lead_email
    ) t
  ), '[]'::jsonb),
  'channels', coalesce((
    select jsonb_agg(jsonb_build_object('key', channel, 'evals', c, 'avgScore', a) order by c desc)
    from (select channel, count(*) c, round(avg(score),1) a from e group by channel) t
  ), '[]'::jsonb),
  'mistakes', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'section', section, 'fails', fails) order by fails desc)
    from (
      select c.label, c.section, count(*) fails
      from qa.qa_evaluation_responses r
      join e on e.id = r.evaluation_id
      join qa.qa_criteria c on c.id = r.criterion_id
      where r.result = 'fail'
      group by c.label, c.section
    ) t
  ), '[]'::jsonb)
);
$$;

grant execute on function qa.analysis(text, text, text, text, text) to service_role, authenticated;
