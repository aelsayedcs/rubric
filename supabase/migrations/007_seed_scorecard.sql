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
  ('Greeting & Closing',            'Using the correct greeting script',                                   5,  false,  1),
  ('Greeting & Closing',            'Using Survey script',                                                 15, false,  2),
  ('Greeting & Closing',            'Call Closure and offering further assistance',                        5,  false,  3),
  ('Handling Skills',               'Showing Willingness to Help, empathy when required',                  15, false,  4),
  ('Handling Skills',               'Proper communication and not using local slang',                      6,  false,  5),
  ('Handling Skills',               'Asking probing / effective questions (Concentration)',                0,  true,   6),
  ('Handling Skills',               'Enabled the customer to speak without interruption',                  5,  false,  7),
  ('Handling Skills',               'Good tone of voice',                                                  5,  false,  8),
  ('Chat/Call Etiquette & Format',  'Following hold protocol',                                             5,  false,  9),
  ('Chat/Call Etiquette & Format',  'Avoiding dead air',                                                   4,  false, 10),
  ('Chat/Call Etiquette & Format',  'Proper message format / thorough responses',                          5,  false, 11),
  ('Chat/Call Etiquette & Format',  'Correct grammar, structure, spelling and punctuation',                10, false, 12),
  ('Chat/Call Etiquette & Format',  'Use templates correctly / customize when needed',                     5,  false, 13),
  ('Chat/Call Etiquette & Format',  'Match the customer''s level of technical sophistication',             5,  false, 14),
  ('Chat/Call Etiquette & Format',  'Effectively use canned replies',                                      5,  false, 15),
  ('Process Documentation',         'Added the proper relevant information in the case',                    5,  false, 16),
  ('Critical Mistakes',             'Be patient, courteous, respectful and professional throughout',       0,  true,  17),
  ('Critical Mistakes',             'Create a ticket or add a summary to the pending ticket',              0,  true,  18),
  ('Critical Mistakes',             'Closed the ticket following the correct contact reason',              0,  true,  19),
  ('Critical Mistakes',             'Assigned to the correct team with full and accurate data',            0,  true,  20),
  ('Critical Mistakes',             'Replied to all inquiries with accurate info & policy / transferred to survey', 0, true, 21),
  ('Critical Mistakes',             'Compliance regulations considered (customer / business impact)',      0,  true,  22)
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
