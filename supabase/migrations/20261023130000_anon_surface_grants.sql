-- DECLARATIVE: exempt grants only; mirrored in schemas/*/95_grants.sql
-- STATUS: WRITTEN, HOLD, NOT APPLIED. Written 2026-10-23 from a read-only
-- permissions review of Helm-Production. Grants only: no table, function body
-- or row changes, so it does not depend on any Clubhouse function migration
-- and can go in any slot of the HELD.md order. Owner applies.
-- Apply: npm run db:apply --
-- supabase/migrations/20261023130000_anon_surface_grants.sql
-- Risk: LOW. Every grant removed here is already unusable or unused.
--
-- WHAT THE HELD FILES ALREADY COVER (not repeated here)
--   20261005120000_golf_shot_tables_hardening revokes EXECUTE on the two
--     unguarded definer functions (calculate_round_strokes_gained,
--     recompute_golf_round_totals) and anon on the golf shot tables.
--   20261007102000_revoke_anon_public_table_grants revokes every anon grant
--     on public tables and sequences and the matching table/sequence defaults.
--
-- WHAT THIS FILE ADDS
--   1. graveyard tables keep full grants. 20260704090000 parked 32 retired
--      tables in schema graveyard and revoked USAGE on the schema from PUBLIC,
--      anon and authenticated, so nothing can reach them through the API
--      today. The table grants stayed behind: ALL to authenticated on all 32
--      and ALL to anon on 6 (live, 2026-10-23). They are why the advisor still
--      lists 6 pg_graphql_anon_table_exposed and 32
--      pg_graphql_authenticated_table_exposed findings for retired tables,
--      and a future GRANT USAGE on graveyard would reopen all 32 at once.
--      No app code or edge function reads graveyard (repo grep, 2026-10-23),
--      cron runs as postgres, and service_role keeps its grants for restores.
--   2. The default privileges for postgres in public still hand EXECUTE to
--      anon on every new function. That is the explicit half of how new
--      SECURITY DEFINER functions became anon-callable before
--      20260905100000. The other half is Postgres's built-in PUBLIC EXECUTE,
--      which is left alone on purpose: postgres also creates the extension
--      functions in extensions and pgmq (citext, pg_trgm, pgmq), and a global
--      "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC" would strip them from future
--      extension installs and upgrades. The per-function rule in
--      .claude/rules/database.md (REVOKE ... FROM PUBLIC, anon) still applies
--      to every new definer function, and the pgTAP guard
--      supabase/tests/rls/anon_surface_guard.sql fails CI if one slips.
--
-- ROLLBACK: supabase/rollbacks/20261023130000_anon_surface_grants.rollback.sql
-- ROLLBACK: (re-grants ALL on the 32 graveyard tables to authenticated and the
-- ROLLBACK: 6 listed there to anon, and restores the anon function default)
--
-- VERIFY: select 1 where not exists (select 1 from pg_class c cross join
-- VERIFY: lateral aclexplode(c.relacl) a where c.relnamespace =
-- VERIFY: 'graveyard'::regnamespace and a.grantee in ((select oid from
-- VERIFY: pg_roles where rolname = 'anon'), (select oid from pg_roles where
-- VERIFY: rolname = 'authenticated')));
-- VERIFY: select 1 where not exists (select 1 from pg_default_acl d cross join
-- VERIFY: lateral aclexplode(d.defaclacl) a where d.defaclrole = (select oid
-- VERIFY: from pg_roles where rolname = 'postgres') and d.defaclnamespace =
-- VERIFY: 'public'::regnamespace and d.defaclobjtype = 'f' and a.grantee =
-- VERIFY: (select oid from pg_roles where rolname = 'anon'));

DO $$
BEGIN
  IF to_regnamespace('graveyard') IS NOT NULL THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA graveyard FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA graveyard FROM anon, authenticated;
  END IF;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM anon;
