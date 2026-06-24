-- ─────────────────────────────────────────────────────────────
-- 007_seed_scorecard.sql — a generic SAMPLE CX QA scorecard (v1).
-- This is only a starting example — edit it freely in-app at /admin/scorecards
-- (criteria, weights, sections, channels are all runtime-editable).
-- Scored (non-critical) weights total = 100. Critical items deduct nothing but
-- force the final score to 0 on any Fail.
-- ─────────────────────────────────────────────────────────────

insert into qa.qa_scorecards (name, version, channel, active)
values ('Sample QA Scorecard', 1, 'All', true)
on conflict (name, version) do nothing;

with sc as (
  select id from qa.qa_scorecards where name = 'Sample QA Scorecard' and version = 1
)
insert into qa.qa_criteria (scorecard_id, section, label, weight, is_critical, sort_order)
select sc.id, c.section, c.label, c.weight, c.is_critical, c.sort_order
from sc, (values
  -- section, label, weight, is_critical, sort_order
  ('Communication',          'Professional, friendly greeting',                  7,  false,  1),
  ('Communication',          'Clear and concise language',                       8,  false,  2),
  ('Communication',          'Positive, empathetic tone',                        10, false,  3),
  ('Problem Solving',        'Correctly identified the customer''s issue',       10, false,  4),
  ('Problem Solving',        'Accurate and complete solution',                   15, false,  5),
  ('Problem Solving',        'Proactively prevented follow-up contacts',         5,  false,  6),
  ('Live Channel Etiquette', 'Followed hold / wait-time protocol',               5,  false,  7),
  ('Live Channel Etiquette', 'Minimized dead air / response gaps',               5,  false,  8),
  ('Live Channel Etiquette', 'Correct grammar, spelling and punctuation',        8,  false,  9),
  ('Process & Compliance',   'Followed the correct workflow',                    8,  false, 10),
  ('Process & Compliance',   'Logged a clear, accurate summary',                 7,  false, 11),
  ('Process & Compliance',   'Verified customer identity',                       0,  true,  12),
  ('Process & Compliance',   'Followed data-privacy policy',                     0,  true,  13),
  ('Closing',                'Confirmed the issue was resolved',                 7,  false, 14),
  ('Closing',                'Offered further help and closed politely',         5,  false, 15),
  ('Critical Mistakes',      'Gave accurate information (no misinformation)',     0,  true,  16),
  ('Critical Mistakes',      'Stayed professional and respectful throughout',    0,  true,  17),
  ('Critical Mistakes',      'Routed / escalated to the correct team',           0,  true,  18)
) as c(section, label, weight, is_critical, sort_order)
where not exists (
  select 1 from qa.qa_criteria x where x.scorecard_id = sc.id and x.sort_order = c.sort_order
);

-- ── App config defaults (quality app) ───────────────────────
insert into public.app_config (app, key, value) values
  ('quality', 'coaching_threshold', '85'),          -- score < 85 ⇒ "needs coaching" hint
  ('quality', 'scorecard_name',     'Sample QA Scorecard')
on conflict (app, key) do nothing;

-- ── Register this tool for the optional multi-app tile grid ──
insert into public.tools (key, name, url, icon, description, enabled, sort_order) values
  ('quality', 'Quality (QA)', 'https://qa.example.com', 'clipboard-check',
   'Customer-experience quality evaluations, disputes & coaching', true, 10)
on conflict (key) do nothing;
