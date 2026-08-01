-- refresh_crm_coach_engagement: session-level advisory lock -> transaction-level.
--
-- THE LEAK. The function was:
--
--   PERFORM pg_advisory_lock(7777);
--   REFRESH MATERIALIZED VIEW CONCURRENTLY crm_coach_engagement;
--   PERFORM pg_advisory_unlock(7777);
--
-- `pg_advisory_lock` is SESSION-scoped and there is no exception handler, so
-- the unlock only runs on the success path. If the REFRESH raises — statement
-- timeout, cancellation, a conflicting lock — the unlock is skipped and the
-- lock stays held for the life of the backend session.
--
-- That matters specifically here because PostgREST pools connections. A leaked
-- session lock does not die with the request; it rides the pooled backend, and
-- every subsequent call to this function blocks on `pg_advisory_lock(7777)`
-- forever. The nightly refresh would then fail silently and indefinitely, with
-- the matview quietly going stale — the exact failure shape this project has
-- been bitten by elsewhere (a job that looks scheduled and does nothing).
--
-- `pg_advisory_xact_lock` is released automatically at COMMIT **or ROLLBACK**,
-- so the failure path can no longer strand it. The explicit unlock is dropped
-- because a transaction-scoped lock must not be released manually.
--
-- Observed 2026-07-29: `[cron.refresh-engagement] RPC failed: <!DOCTYPE html>`
-- — a gateway 5xx. Verified 2026-08-01 that no lock is currently stranded
-- (pg_locks has no advisory entries) and the function itself succeeds
-- (2,318 rows refreshed), so this hardens a latent path rather than clearing a
-- live wedge.
--
-- Function signature, ownership, SECURITY DEFINER and search_path are
-- unchanged; only the locking changes.

CREATE OR REPLACE FUNCTION public.refresh_crm_coach_engagement()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Transaction-scoped: released on COMMIT *and* on ROLLBACK, so a failed
  -- refresh cannot strand the lock in a pooled PostgREST connection.
  PERFORM pg_advisory_xact_lock(7777);
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm_coach_engagement;
END; $function$;
