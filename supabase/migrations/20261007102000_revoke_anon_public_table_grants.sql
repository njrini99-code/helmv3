-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.4.
-- Apply: npm run db:apply -- supabase/migrations/20261007102000_revoke_anon_public_table_grants.sql
-- Risk: HIGHEST of the phase. Needs the local-stack pgTAP proof
-- (supabase/tests/rls/revoke_anon_public_table_grants.sql) plus a smoke of the
-- public pages and the landing demo form right after the apply.
--
-- Anyone holding the publishable key is `anon`. Today `anon` holds full DML
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on every
-- table and view in `public`: 115 tables and 4 views carry anon SELECT, 110
-- carry anon TRUNCATE (live count, 2026-10-07). RLS is enabled on all 280
-- tables and no policy lets anon read anything but demo_requests (INSERT), so
-- the grants are unused. They are still wrong: TRUNCATE is not governed by RLS
-- at all, the Supabase advisor reports 125 pg_graphql_anon_table_exposed
-- findings, and one missing RLS policy on a future table becomes a public leak.
--
-- This migration removes every anon privilege on public relations, re-grants
-- the three things an anonymous visitor legitimately does, and stops new
-- objects from re-acquiring anon access by default.
--
-- SURVIVING ANON GRANTS (each one is asserted by the pgTAP file)
--   1. INSERT on public.demo_requests
--        src/app/actions/demo-request.ts inserts the landing-page lead as the
--        visitor. It does not select the row back, so no SELECT is needed.
--        The only policy that admits it is "Anyone can create demo requests"
--        (INSERT TO anon, authenticated, WITH CHECK true).
--   2. SELECT on public.organizations_public_profile
--        baseball (public)/program/[id]/page.tsx reads it for logged-out
--        visitors, including generateMetadata.
--   3. SELECT on public.baseball_teams_public_profile
--        public team and program pages.
--   4. SELECT on public.baseball_team_coach_staff_public
--        public team and program pages (coach name, role, avatar).
--   The three views are owned by postgres with security_invoker = false, so
--   their base-table reads do not need anon grants on the base tables. That
--   is why revoking the base tables cannot break them.
--
-- WHAT STOPS WORKING, AND WHY THAT IS FINE
--   A logged-out request that reads any other public table used to get zero
--   rows from RLS. It now gets Postgres error 42501 (permission denied for
--   table). Every such read in src/ already treats "no rows" and "error" the
--   same way, because the page is authenticated-only:
--     * baseball (public)/player/[id]: the player read ends in
--       `if (error || !player) notFound()`, and the helper
--       resolvePublicProfileAccess maps a missing row to not_found. The
--       signed-in-only team-membership embed is already gated on `user`.
--     * the recruiting-interest, watchlist and engagement-count reads on that
--       page ignore their errors or log them.
--     * middleware reads of baseball_coaches, baseball_team_coach_staff,
--       baseball_teams and baseball_program_settings run after a session check.
--   Join and invite pages (/golf/join/[code], /baseball/join/[code]) redirect a
--   signed-out visitor to signup before they read anything; the login, signup
--   and welcome pages and sitemap.ts read no table as anon.
--   Production REST logs cannot confirm this empirically. Over the last 24 h
--   no request carried a decoded anon JWT, but requests made with the
--   new-format publishable and secret keys log an empty role, so an anon read
--   cannot be told from a service-role one. The 13,981 such requests are
--   service-style (background_job_logs, helm_debug_*, crm_*, cron reads).
--   PRECONDITION TO APPLY: watch Sentry for 42501 and PostgREST 401/403 on
--   /rest/v1/* for the first hour, and keep the ROLLBACK below ready.
--   No SECURITY INVOKER function that anon can execute needs a table grant
--   for a legitimate anon flow: the only anon-executable functions in public
--   are trigger bodies and report helpers that are already denied by RLS.
--   No storage.objects policy for anon or public references a public table.
--
-- DEFAULT PRIVILEGES
--   `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` stops every
--   table or sequence that a future migration creates as postgres from
--   granting anon anything. The matching defaults owned by supabase_admin
--   cannot be changed from the migration role (postgres is not a member of
--   supabase_admin, checked live); they only apply to objects supabase_admin
--   itself creates in public, which migrations never do. Function defaults
--   are not changed here: functions already carry PUBLIC execute, so
--   revoking the anon default would do nothing without a separate sweep
--   (see .claude/rules/database.md: pair every definer function with a
--   revoke).
--
-- NOT TOUCHED: authenticated and service_role grants, grants on sequences that
-- already exist (anon holds none, checked live), function EXECUTE.
--
-- ROLLBACK (restores the previous, over-broad state):
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON SEQUENCES TO anon;
-- The three views and demo_requests keep working either way.
--
-- VERIFY: select 1 where not exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f') and a.grantee = (select oid from pg_roles where rolname = 'anon') and not ((c.relname = 'demo_requests' and a.privilege_type = 'INSERT') or (c.relname in ('organizations_public_profile', 'baseball_teams_public_profile', 'baseball_team_coach_staff_public') and a.privilege_type = 'SELECT')));
-- VERIFY: select 1 where has_table_privilege('anon', 'public.demo_requests', 'INSERT') and not has_table_privilege('anon', 'public.demo_requests', 'SELECT') and has_table_privilege('anon', 'public.organizations_public_profile', 'SELECT') and has_table_privilege('anon', 'public.baseball_teams_public_profile', 'SELECT') and has_table_privilege('anon', 'public.baseball_team_coach_staff_public', 'SELECT');
-- VERIFY: select 1 where not exists (select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclnamespace = 'public'::regnamespace and d.defaclrole = (select oid from pg_roles where rolname = 'postgres') and d.defaclobjtype in ('r', 'S') and a.grantee = (select oid from pg_roles where rolname = 'anon'));
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.users', 'SELECT') and has_table_privilege('service_role', 'public.users', 'SELECT');

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT INSERT ON TABLE public.demo_requests TO anon;
GRANT SELECT ON TABLE public.organizations_public_profile TO anon;
GRANT SELECT ON TABLE public.baseball_teams_public_profile TO anon;
GRANT SELECT ON TABLE public.baseball_team_coach_staff_public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
