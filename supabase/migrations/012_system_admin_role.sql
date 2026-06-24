-- ─────────────────────────────────────────────────────────────
-- 012_system_admin_role.sql
-- Adds the DSAT-style top admin tier: system_admin > super_admin > admin.
-- (Postgres enums are append-only; system_owner stays valid but is superseded
--  by system_admin as the canonical highest role.)
-- ─────────────────────────────────────────────────────────────
alter type public.app_role add value if not exists 'system_admin' before 'super_admin';
