-- ─────────────────────────────────────────────────────────────
-- 015_notifications.sql — in-app notifications.
-- Lightweight per-user notification feed (bell icon). Written by the app on key
-- events (dispute raised/decided, coaching assigned); read via /api/notifications.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id              bigint generated always as identity primary key,
  app             app_key not null default 'quality',
  recipient_email text not null,
  type            text not null,         -- dispute_raised | dispute_decision | coaching | ...
  title           text not null,
  body            text,
  link            text,                  -- in-app route to open
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_email, read_at);
create index if not exists notifications_created_idx   on public.notifications (created_at desc);

alter table public.notifications enable row level security;
-- Service role (used by the app server) bypasses RLS; this policy lets a signed-in
-- user read their own notifications directly if ever queried client-side.
do $$ begin
  create policy notifications_read_own on public.notifications
    for select using (recipient_email = auth.jwt() ->> 'email');
exception when duplicate_object then null; end $$;
