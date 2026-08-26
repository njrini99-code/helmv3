-- Normalize two definer-mode helper functions to the production privilege
-- contract.
--
-- WHY: the privilege-contract sweep (supabase/tests/rls/
-- golf_lifecycle_privilege_contracts.sql, added alongside this migration)
-- asserts that NO public definer-mode function grants EXECUTE to anon.
-- Production already satisfies that today (verified 2026-08-25 against the
-- live catalog: zero anon-executable definer functions in public). The
-- migration-chain-built database did NOT: log_crm_stage_transition() and
-- unresolve_admin_event(uuid[]) carried anon EXECUTE that production does
-- not have. That is exactly the local≠production privilege drift class that
-- let the recap wrapper bug (20260825233000, Sentry JAVASCRIPT-NEXTJS-PT)
-- pass local testing — so the chain is aligned to the production contract,
-- never the other way around.
--
-- Root cause (db-migration-reviewer, 2026-08-25): both functions were
-- created AFTER the 2026-07-03 anon-grant sweep and each missed an
-- anon-specific revoke — one shipped with no REVOKE/GRANT at all, the other
-- only revoked PUBLIC, which does not retract a direct anon grant. Every
-- other post-sweep definer migration is CREATE OR REPLACE on an
-- already-scoped function, so this closes the whole class.
--
-- Existence guards: a named REVOKE aborts the transaction when its target
-- does not exist. Both functions were confirmed present in the live
-- production catalog on 2026-08-25 (pg_proc, anon_exec = false on both),
-- but the guards make this file unconditionally safe in ANY environment —
-- a partial preview branch, an older restore — instead of safe in the ones
-- we checked. Revoking a grant that is already absent is a silent no-op.
--
-- ROLLBACK: re-grant is a one-liner per function, but the grants being
-- removed were never live in production — a rollback would CREATE drift,
-- not restore anything.

DO $$
BEGIN
  IF to_regprocedure('public.log_crm_stage_transition()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.log_crm_stage_transition() FROM PUBLIC, anon;
  END IF;

  IF to_regprocedure('public.unresolve_admin_event(uuid[])') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.unresolve_admin_event(uuid[]) FROM PUBLIC, anon;
  END IF;
END
$$;
