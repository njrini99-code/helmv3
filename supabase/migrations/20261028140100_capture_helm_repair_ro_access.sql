-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production already has the
-- role, grants and policies below (verified read-only 2026-10-28), so
-- applying it there leaves everything as it is. See HELD.md (row
-- 20261028140100) and docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW. One NOLOGIN role and read access for the self-heal repair agent.
--
-- Why: helm_repair_ro was provisioned in production by hand for
-- .github/workflows/selfheal-repair.yml. supabase/roles.sql creates it for a
-- local stack, and supabase/schemas/** carries its grants and policies, but no
-- migration does, so a database built from migrations (the staging project,
-- a branch) has none of it. Production's role is NOLOGIN NOINHERIT; its
-- access is: USAGE on schema public, SELECT on admin_error_resolutions and
-- admin_events, SELECT and INSERT on background_job_logs, and the four
-- policies below. Nothing here gives the role a password or login.
--
-- ROLLBACK: none needed on production. On a replayed database: drop the four
-- ROLLBACK: helm_repair_ro_* policies, revoke the grants below, then
-- ROLLBACK: DROP ROLE helm_repair_ro.
--
-- VERIFY: select 1 from pg_roles where rolname = 'helm_repair_ro'
-- VERIFY: and not rolcanlogin;
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'background_job_logs'
-- VERIFY: and policyname = 'helm_repair_ro_insert_own_heartbeat';
-- VERIFY: select 1 where has_table_privilege('helm_repair_ro',
-- VERIFY: 'public.admin_events', 'SELECT');

SET LOCAL lock_timeout = '5s';

DO $capture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helm_repair_ro') THEN
    CREATE ROLE helm_repair_ro NOLOGIN NOINHERIT;
  END IF;
END
$capture$;

GRANT USAGE ON SCHEMA public TO helm_repair_ro;
GRANT SELECT ON TABLE public.admin_error_resolutions TO helm_repair_ro;
GRANT SELECT ON TABLE public.admin_events TO helm_repair_ro;
GRANT SELECT, INSERT ON TABLE public.background_job_logs TO helm_repair_ro;

DROP POLICY IF EXISTS helm_repair_ro_insert_own_heartbeat ON public.background_job_logs;
CREATE POLICY helm_repair_ro_insert_own_heartbeat ON public.background_job_logs
  FOR INSERT TO helm_repair_ro
  WITH CHECK (job_type = 'selfheal-repair'::text);

DROP POLICY IF EXISTS helm_repair_ro_select_admin_error_resolutions ON public.admin_error_resolutions;
CREATE POLICY helm_repair_ro_select_admin_error_resolutions ON public.admin_error_resolutions
  FOR SELECT TO helm_repair_ro
  USING (true);

DROP POLICY IF EXISTS helm_repair_ro_select_admin_events ON public.admin_events;
CREATE POLICY helm_repair_ro_select_admin_events ON public.admin_events
  FOR SELECT TO helm_repair_ro
  USING (true);

DROP POLICY IF EXISTS helm_repair_ro_select_background_job_logs ON public.background_job_logs;
CREATE POLICY helm_repair_ro_select_background_job_logs ON public.background_job_logs
  FOR SELECT TO helm_repair_ro
  USING (true);
