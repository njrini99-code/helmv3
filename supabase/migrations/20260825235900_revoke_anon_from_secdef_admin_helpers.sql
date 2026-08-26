-- Normalize two SECURITY DEFINER helpers to the production privilege contract.
--
-- WHY: the privilege-contract sweep (supabase/tests/rls/
-- golf_lifecycle_privilege_contracts.sql, added alongside this migration)
-- asserts that NO public SECURITY DEFINER function grants EXECUTE to anon.
-- Production already satisfies that today (verified 2026-08-25 against the
-- live catalog: zero anon-executable definer functions in public). The
-- migration-chain-built database did NOT: log_crm_stage_transition() and
-- unresolve_admin_event(uuid[]) carried anon EXECUTE that production does
-- not have. That is exactly the local≠production privilege drift class that
-- let the recap wrapper bug (20260825233000, Sentry JAVASCRIPT-NEXTJS-PT)
-- pass local testing — so the chain is aligned to the production contract,
-- never the other way around.
--
-- Applying this to production is a harmless no-op for these two functions
-- (revoking a grant that is already absent succeeds silently); it exists so
-- every environment built from this chain matches production.
--
-- ROLLBACK: re-grant is a one-liner per function, but note the grants being
-- removed were never live in production — a rollback would CREATE drift, not
-- restore anything.

REVOKE EXECUTE ON FUNCTION public.log_crm_stage_transition() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.unresolve_admin_event(uuid[]) FROM PUBLIC, anon;
