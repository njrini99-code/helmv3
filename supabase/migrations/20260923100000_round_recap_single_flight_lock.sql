-- Package 8: the tighter half of round-recap.ts's single-flight protection —
-- a lock taken BEFORE the LLM call, so a concurrent second
-- generateRoundRecap() call for the same round waits for or reads the
-- first call's result instead of making a second billable LLM call.
-- 20260923080000 deferred exactly this as "an owner product/cost decision";
-- this migration is that decision, approved.
--
-- GATED: round-recap.ts checks the `coachhelm_recap_single_flight_lock`
-- feature flag (config/feature-flags.yml, type: temporary_migration,
-- default off in every environment) BEFORE calling either function below.
-- With the flag off, behavior is byte-for-byte what it is today — only
-- 20260923080000's cheap `ai_recap IS NULL` guard applies. This mirrors
-- 20260923090000's identical gating reason: "a claim/lock failure fails
-- closed" must never mean "every recap silently stops calling the LLM"
-- in an environment this migration hasn't reached yet — a missing function
-- would otherwise turn every single recap generation into a fail-closed
-- (no-LLM) fallback the moment the flag were flipped on prematurely.
--
-- WHY A LEASE TABLE, NOT pg_advisory_xact_lock: an advisory xact lock
-- releases automatically at commit/rollback, but the LLM call happens over
-- the network, outside any one short Postgres transaction — holding a DB
-- transaction open for the whole external call is the pattern this repo
-- already avoids elsewhere (20260821043500_single_flight_round_submit.sql
-- uses FOR UPDATE NOWAIT, not a held xact lock, for the same reason). A
-- row-based lease with an explicit expiry stands in for that: a crashed or
-- hung request can never wedge a round's recap generation past the lease.
-- No `maxDuration` is configured for the round detail route today, so the
-- TTL round-recap.ts passes (45s) is sized to the documented worst case
-- instead: one compose() call, one corrective retry (repair plan §14.10's
-- typed-claim retry), and the persistence RPC — not tied to a runtime
-- config value that doesn't exist.
--
-- WHY (round_id, revision), NOT round_id ALONE: nothing in this codebase
-- has a "recap revision" concept today — checked golf_rounds' own columns
-- and v2 insights' evidenceRevisionKey (lifecycle-policy.ts/upsert.ts),
-- which is a distinct, unrelated maturation-tracking mechanism for a
-- different feature. round-recap.ts always generates once per round
-- (gated by `ai_recap IS NULL`) and has no regenerate flow yet. `revision`
-- is included in the lock's primary key now, ahead of that need, so a
-- future regenerate flow can take a fresh lock for a new revision without
-- a second schema change; round-recap.ts passes a constant `1` for it
-- today (see ROUND_RECAP_LOCK_REVISION's own comment in round-recap.ts).
--
-- claim_round_recap_lock: atomic conditional claim. INSERT ... ON CONFLICT
-- DO UPDATE ... WHERE expires_at < now() is the same "claim iff missing or
-- expired" pattern as a job queue's lease claim — the WHERE clause is
-- evaluated inside the same row-locked upsert, so two concurrent callers
-- can never both see it succeed. Returns the claimed row (with a fresh
-- holder_token) iff THIS call now owns the lock; an empty result means
-- someone else holds a live, unexpired lease. Not SECURITY DEFINER: the
-- only caller is round-recap.ts's service-role admin client (matching how
-- it already writes golf_round_recap_provenance), which has direct table
-- grants already — no privilege elevation is needed, so this stays a plain
-- SECURITY INVOKER function with a pinned search_path.
--
-- release_round_recap_lock: deletes the row only `WHERE holder_token =
-- p_holder_token`, so a slow winner whose lease already expired (and was
-- reclaimed by a new holder) can never delete the NEW holder's row out from
-- under it. Same identity-check requirement round-review-system.ts's
-- in-process `inFlightRoundReviews.get(roundId) === run` guards against
-- for its own (in-process, not DB) single-flight coordinator.
--
-- ROLLBACK: additive only — no existing column, row, or grant on any table
-- other than golf_round_recap_locks itself (net-new) is removed or
-- narrowed. To fully revert: DROP FUNCTION
-- public.claim_round_recap_lock(uuid,integer,integer); DROP FUNCTION
-- public.release_round_recap_lock(uuid,integer,uuid); DROP TABLE
-- public.golf_round_recap_locks; — turning the feature flag back off alone
-- is sufficient to stop every code path that would call either function.
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_round_recap_lock'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'release_round_recap_lock'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_round_recap_locks'::regclass); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_round_recap_locks', 'SELECT'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_round_recap_locks', 'SELECT'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.claim_round_recap_lock(uuid, integer, integer)', 'EXECUTE'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE has_function_privilege('service_role', 'public.claim_round_recap_lock(uuid, integer, integer)', 'EXECUTE'); -- noqa: LT05

CREATE TABLE IF NOT EXISTS public.golf_round_recap_locks (
    round_id uuid NOT NULL REFERENCES public.golf_rounds (
        id
    ) ON DELETE CASCADE,
    revision integer NOT NULL DEFAULT 1,
    holder_token uuid NOT NULL,
    locked_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (round_id, revision)
);

COMMENT ON TABLE public.golf_round_recap_locks IS
'Single-flight lease for round-recap.ts''s LLM call, taken BEFORE '
'compose() so a concurrent second generateRoundRecap() call for the same '
'round waits for or reads the first call''s result instead of making a '
'second billable LLM call. Row-per-(round_id,revision), TTL-expiring, '
'service-role-only — written and cleared exclusively through '
'public.claim_round_recap_lock / public.release_round_recap_lock, never '
'through a direct client write.';

ALTER TABLE public.golf_round_recap_locks ENABLE ROW LEVEL SECURITY;

-- No policy for `authenticated` — this table has zero authenticated access
-- (unlike golf_round_recap_provenance, which authenticated may read). RLS
-- enabled with zero policies denies all non-owner access by default; the
-- REVOKE below is defense in depth against Supabase's default post-CREATE-
-- TABLE ACL grant (the same trap 20260923080000's own comment documents).
REVOKE ALL ON TABLE public.golf_round_recap_locks
FROM public, anon, authenticated;
GRANT ALL ON TABLE public.golf_round_recap_locks TO service_role;

CREATE OR REPLACE FUNCTION public.claim_round_recap_lock(
    p_round_id uuid,
    p_revision integer,
    p_ttl_seconds integer
)
RETURNS TABLE (holder_token uuid, expires_at timestamptz)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.golf_round_recap_locks AS l (round_id, revision, holder_token, locked_at, expires_at)
  VALUES (
      p_round_id, p_revision, gen_random_uuid(), now(),
      now() + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (round_id, revision) DO UPDATE
    SET holder_token = gen_random_uuid(),
        locked_at = now(),
        expires_at = now() + make_interval(secs => p_ttl_seconds)
    WHERE l.expires_at < now()
  RETURNING l.holder_token, l.expires_at;
$$;

COMMENT ON FUNCTION public.claim_round_recap_lock(uuid, integer, integer) IS
'Atomic conditional claim for golf_round_recap_locks: claims iff no row '
'exists for (round_id, revision) or the existing row is expired. Returns '
'zero rows when a live, unexpired lease is already held by someone else. '
'service_role only — called by round-recap.ts''s admin client.';

REVOKE ALL ON FUNCTION public.claim_round_recap_lock(
    uuid, integer, integer
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_round_recap_lock(
    uuid, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_round_recap_lock(
    p_round_id uuid,
    p_revision integer,
    p_holder_token uuid
)
RETURNS void
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  DELETE FROM public.golf_round_recap_locks
  WHERE round_id = p_round_id
    AND revision = p_revision
    AND holder_token = p_holder_token;
$$;

COMMENT ON FUNCTION public.release_round_recap_lock(uuid, integer, uuid) IS
'Releases a golf_round_recap_locks row only when the caller supplies the '
'exact holder_token it was issued at claim time — a slow winner whose '
'lease already expired (and was reclaimed by a new holder) can never '
'delete the new holder''s row out from under it. service_role only.';

REVOKE ALL ON FUNCTION public.release_round_recap_lock(
    uuid, integer, uuid
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_round_recap_lock(
    uuid, integer, uuid
) TO service_role;
