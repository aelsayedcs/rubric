-- ─────────────────────────────────────────────────────────────
-- 019_scorecard_builder.sql — versioned, channel-scoped scorecards with
-- first-class attributes (sections) and channel-tagged sub-attributes (criteria).
-- Channels stored as text[] over {Chat,Call,Tickets} (full set = "all channels").
-- ─────────────────────────────────────────────────────────────

-- 1) Scorecards: channel scope + versioning metadata
alter table qa.qa_scorecards
  add column if not exists channels text[] not null default '{Chat,Call,Tickets}',
  add column if not exists published_at timestamptz,
  add column if not exists created_by text;

-- Backfill channels from the legacy single `channel` text column.
update qa.qa_scorecards
  set channels = case when channel is null or channel = 'All'
                      then array['Chat','Call','Tickets'] else array[channel] end;
update qa.qa_scorecards set published_at = coalesce(published_at, created_at) where active;

-- One ACTIVE version per scorecard NAME (replaces the global single-active rule).
drop index if exists qa.qa_scorecards_one_active;
create unique index if not exists qa_scorecards_active_per_name
  on qa.qa_scorecards (name) where active;

-- 2) Attributes (first-class "sections")
create table if not exists qa.qa_attributes (
  id           uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references qa.qa_scorecards(id) on delete cascade,
  name         text not null,
  sort_order   int not null default 0,
  channels     text[] not null default '{Chat,Call,Tickets}',
  archived     boolean not null default false
);
create index if not exists qa_attributes_scorecard_idx on qa.qa_attributes(scorecard_id, sort_order);

-- 3) Criteria (sub-attributes): link to attribute + channel scope
alter table qa.qa_criteria
  add column if not exists attribute_id uuid references qa.qa_attributes(id) on delete cascade,
  add column if not exists channels text[] not null default '{Chat,Call,Tickets}';

-- 4) Backfill attributes from each scorecard's distinct sections, then link criteria.
insert into qa.qa_attributes (scorecard_id, name, sort_order, channels)
select scorecard_id, section,
       (row_number() over (partition by scorecard_id order by min(sort_order))) - 1,
       array['Chat','Call','Tickets']
from qa.qa_criteria
group by scorecard_id, section;

update qa.qa_criteria c
  set attribute_id = a.id
from qa.qa_attributes a
where a.scorecard_id = c.scorecard_id and a.name = c.section and c.attribute_id is null;
