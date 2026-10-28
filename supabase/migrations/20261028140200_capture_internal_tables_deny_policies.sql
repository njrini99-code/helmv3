-- STATUS: WRITTEN, NOT APPLIED. Replay capture of production ledger row
-- 20260703212357 advisor_low_risk_hardening_20260703 (part 1 of 2; the CRM
-- half is 20261028140300). Production already has both policies (verified
-- read-only 2026-10-28). See HELD.md (row 20261028140200) and
-- docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW. Both tables already deny clients (RLS on, no permissive policy);
-- these restrictive policies make that explicit, as production has it.
--
-- Why: the 2026-07-03 advisor hardening ran in production with no repo file,
-- so a replayed database lacks these two policies.
--
-- ROLLBACK: drop policy admin_allowlist_no_client_access on
-- ROLLBACK: public.admin_allowlist; drop policy auth_rate_limits_no_client_access
-- ROLLBACK: on public.auth_rate_limits.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'admin_allowlist'
-- VERIFY: and policyname = 'admin_allowlist_no_client_access'
-- VERIFY: and permissive = 'RESTRICTIVE';
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'auth_rate_limits'
-- VERIFY: and policyname = 'auth_rate_limits_no_client_access'
-- VERIFY: and permissive = 'RESTRICTIVE';

SET LOCAL lock_timeout = '5s';

-- Created only when missing, so production (which has both) is not locked.
DO $capture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'admin_allowlist'
                   AND policyname = 'admin_allowlist_no_client_access') THEN
    CREATE POLICY admin_allowlist_no_client_access ON public.admin_allowlist
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'auth_rate_limits'
                   AND policyname = 'auth_rate_limits_no_client_access') THEN
    CREATE POLICY auth_rate_limits_no_client_access ON public.auth_rate_limits
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END
$capture$;
