-- STATUS: WRITTEN — NOT APPLIED. Applying to production needs owner approval.
--
-- Data API grants readiness for Supabase's 2026-10-30 default change
-- (supabase/supabase discussion 45329). Supabase is stopping the automatic
-- Data API grants on new tables in `public`. This migration makes that the
-- rule here now, so we don't get a split between tables created before and
-- after the platform change.
--
-- What it does: removes the role-specific DEFAULT PRIVILEGES that the
-- baseline (20260527000000_prod_public_baseline.sql) set for grantor
-- `postgres` in schema `public`. Without them, a table or sequence created by
-- `postgres` gets NO privileges for anon, authenticated or service_role. The
-- migration that creates it must grant them explicitly (see
-- .claude/rules/database.md "Grants", enforced on new migrations by
-- scripts/db/check-new-migration-grants.mjs).
--
-- What it does NOT do:
-- - It does not touch existing tables' or sequences' grants. ALTER DEFAULT
--   PRIVILEGES only affects objects created afterwards. As of 2026-10-03, all
--   280 public tables in production are SELECT-able by service_role (read-only
--   check).
-- - It leaves FUNCTIONS defaults alone. Supabase's change covers tables and
--   sequences only. Postgres also grants EXECUTE to PUBLIC on every new
--   function regardless of these role entries, so revoking them would close
--   nothing. Function exposure is handled per function (REVOKE ... FROM
--   PUBLIC, anon; GRANT ... TO authenticated), as the rules already require.
-- - It leaves the default ACL entries for grantor `supabase_admin` alone.
--   Those are platform-owned and only cover objects that role creates.
-- - The `postgres` -> `postgres` owner entries stay as they are.
--
-- Same statements as Supabase's opt-in SQL, widened from
-- select/insert/update/delete to ALL so that no residual privilege
-- (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, sequence UPDATE) is left behind.
-- Idempotent: revoking an absent default privilege is a no-op.
--
-- ROLLBACK: restore the baseline defaults:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon, authenticated, service_role;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
--
-- VERIFY: select 1 where not exists (select 1 from pg_catalog.pg_default_acl d cross join lateral pg_catalog.aclexplode(d.defaclacl) a where d.defaclnamespace = 'public'::regnamespace and pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres' and d.defaclobjtype in ('r', 'S') and pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'));
-- VERIFY: select 1 where not exists (select 1 from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT'));

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
