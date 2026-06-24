-- ─────────────────────────────────────────────────────────────
-- 013_page_access.sql — editable page→role visibility matrix.
-- Drives the nav (which pages each role sees). API routes keep their own
-- requireRole guards; this controls visibility, managed from /permissions.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.page_access (
  key         text primary key,         -- route, e.g. '/analysis'
  label       text not null,
  section     text not null default 'Main',
  roles       text[] not null default '{}',
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now()
);

-- Seed with the app's pages and their current default visibility.
insert into public.page_access (key, label, section, roles, sort_order) values
  ('/analysis',       'Analysis',    'Main',  array['qa_evaluator','team_lead','admin','super_admin','system_owner','system_admin'], 1),
  ('/results',        'Results',     'Main',  array['agent','team_lead','qa_evaluator','admin','super_admin','system_owner','system_admin'], 2),
  ('/evaluate',       'Evaluate',    'Main',  array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 3),
  ('/disputes',       'Disputes',    'Main',  array['agent','team_lead','qa_evaluator','admin','super_admin','system_owner','system_admin'], 4),
  ('/team',           'Team',        'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 5),
  ('/admin/audit',    'Audit',       'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 6),
  ('/admin/settings', 'Settings',    'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 7),
  ('/performance',    'Performance', 'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 8),
  ('/admin/access',   'Access',      'Admin', array['qa_evaluator','admin','super_admin','system_owner','system_admin'], 9),
  ('/permissions',    'Permissions', 'Admin', array['system_owner','system_admin'], 10)
on conflict (key) do nothing;
