-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production already has exactly
-- this ACL (verified read-only 2026-10-28). See HELD.md (row 20261028140500)
-- and docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW on production (no change). On a replayed database it removes
-- authenticated's EXECUTE on a SECURITY DEFINER function no app path calls.
--
-- Why: get_user_last_active() is SECURITY DEFINER and returns every user's
-- last activity time. Production lets only postgres and service_role run it;
-- authenticated's EXECUTE was revoked by hand with no repo file, so a
-- replayed database still lets any signed-in user read it. The app has no
-- caller; supabase/schemas/functions/95_grants.sql already holds the
-- production ACL.
--
-- ROLLBACK: grant execute on function public.get_user_last_active() to
-- ROLLBACK: authenticated (only on a replayed database; never on production).
--
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY: 'public.get_user_last_active()', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY: 'public.get_user_last_active()', 'EXECUTE');

REVOKE ALL ON FUNCTION public.get_user_last_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_last_active() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_last_active() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_last_active() TO service_role;
