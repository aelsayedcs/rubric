-- ─────────────────────────────────────────────────────────────
-- 021_custom_roles.sql — role catalog (custom role types)
--
-- Adds a `roles` table so admins can create/delete role TYPES (not just assign
-- existing roles to users). To allow assigning arbitrary role keys, app_access.role
-- is converted from the app_role enum to text, and current_app_role() now returns
-- text. Built-in roles are seeded as is_system (cannot be deleted). Page-level
-- access for custom roles is granted via the existing page_access matrix.
--
-- Safe ordering: existing app_access values are all built-in enum values, so the
-- text cast is lossless and current_app_role keeps resolving auth throughout.
-- ─────────────────────────────────────────────────────────────

-- 1) Role catalog ------------------------------------------------------------
create table if not exists public.roles (
  key          text primary key,
  display_name text not null,
  description  text,
  is_system    boolean not null default false,
  archived     boolean not null default false,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);
alter table public.roles enable row level security;
-- Readable by any authenticated user (drives dropdowns); writes go through the
-- service-role API which enforces the top-tier / system_admin rules in code.
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);

insert into public.roles (key, display_name, description, is_system, sort_order) values
  ('system_admin','System Admin','Full control — all pages, manages roles & permissions.', true, 1),
  ('system_owner','System Owner','Top-tier owner; same surface as System Admin.', true, 2),
  ('super_admin', 'Super Admin', 'Admin surface across the Quality app.', true, 3),
  ('admin',       'Admin',       'Admin surface (no permissions-matrix editing).', true, 4),
  ('qa_evaluator','QA Evaluator','Score, edit & re-score evaluations; decide disputes.', true, 5),
  ('team_lead',   'Team Lead',   'Reviews their team''s disputes and results.', true, 6),
  ('agent',       'Agent',       'Sees only their own results and disputes.', true, 7),
  ('viewer',      'Viewer',      'Read-only access.', true, 8)
on conflict (key) do nothing;

-- 2) Allow arbitrary role keys in app_access --------------------------------
-- current_app_role() returns app_role and reads this column, so recreate it as
-- text afterwards (step 3). The (app, role) index is rebuilt automatically.
alter table public.app_access alter column role type text using role::text;

-- 3) current_app_role() returns text (so custom keys resolve) ---------------
-- is_qa_staff() calls this and compares the result against built-in keys, which
-- works unchanged once the return type is text.
drop function if exists public.current_app_role(public.app_key);
create function public.current_app_role(_app public.app_key)
returns text language sql stable security definer set search_path to 'public' as $$
  select role from public.app_access
  where email = public.jwt_email() and app = _app and not archived
  limit 1
$$;

-- 4) Nav + page guard row for the catalog page ------------------------------
insert into public.page_access (key, label, section, roles, sort_order) values
  ('/admin/roles','Role Types','Admin', array['system_owner','system_admin'], 11)
on conflict (key) do nothing;
