-- Package 8: a per-round single-flight lock taken BEFORE an LLM call, so a
-- concurrent second request for the same round waits for or reads the first
-- call's result instead of making a second billable LLM call.
--
-- Originally written for round-recap.ts alone (20260923080000 deferred
-- exactly this as "an owner product/cost decision"; this migration is that
-- decision, approved). Revised in place, before being applied anywhere, to
-- also serve the round-review narrative feature (owner decision, same day):
-- both features lock per-round, both need the identical claim/expire/
-- reclaim/release semantics, and the owner asked the narrative to reuse
-- this lock rather than build a second coordination mechanism. The table
-- keeps its original name (predates the second caller) but its primary key
-- now carries an explicit `kind` column instead of overloading `revision`
-- to mean two different things — a narrative lock and a recap lock for the
-- same round are different resources and must never contend with each
-- other or let one caller "resolve" by reading the other's result.
--
-- GATED: each caller checks its OWN feature flag
-- (coachhelm_recap_single_flight_lock for round-recap.ts,
-- coachhelm_round_review_narrative for the narrative — both
-- config/feature-flags.yml, default off in every environment) BEFORE
-- calling either function below. With a flag off, that caller's behavior is
-- byte-for-byte what it was before this lock existed. This mirrors
-- 20260923090000's identical gating reason: "a claim/lock failure fails
-- closed" must never mean "every generation silently stops calling the
-- LLM" in an environment this migration hasn't reached yet — a missing
-- function would otherwise turn every single generation into a fail-closed
-- (no-LLM) fallback the moment a flag were flipped on prematurely.
--
-- WHY A LEASE TABLE, NOT pg_advisory_xact_lock: an advisory xact lock
-- releases automatically at commit/rollback, but the LLM call happens over
-- the network, outside any one short Postgres transaction — holding a DB
-- transaction open for the whole external call is the pattern this repo
-- already avoids elsewhere (20260821043500_single_flight_round_submit.sql
-- uses FOR UPDATE NOWAIT, not a held xact lock, for the same reason). A
-- row-based lease with an explicit expiry stands in for that: a crashed or
-- hung request can never wedge a round's generation past the lease. Each
-- caller sizes its own TTL to its own worst case via p_ttl_seconds — no
-- `maxDuration` is configured for the round detail route today, so neither
-- caller ties its lease to a runtime config value that doesn't exist.
--
-- WHY (round_id, revision, kind): nothing in this codebase has a "recap
-- revision" or "narrative revision" concept today — checked golf_rounds'
-- and golf_round_reviews' own columns and v2 insights' evidenceRevisionKey
-- (lifecycle-policy.ts/upsert.ts), which is a distinct, unrelated
-- maturation-tracking mechanism for a different feature. Both callers
-- generate once per round today (gated by their own IS NULL guard) and have
-- no regenerate flow yet. `revision` is included in the primary key now,
-- ahead of that need, so a future regenerate flow can take a fresh lock for
-- a new revision without a second schema change; each caller passes a
-- constant `1` for it today. `kind` is the resource discriminator between
-- the two (and any future) lock users — round-recap.ts passes `'recap'`,
-- the narrative passes `'round_review_narrative'` (see each caller's own
-- lock-revision constant comment for the exact values).
--
-- claim_round_recap_lock: atomic conditional claim. INSERT ... ON CONFLICT
-- DO UPDATE ... WHERE expires_at < now() is the same "claim iff missing or
-- expired" pattern as a job queue's lease claim — the WHERE clause is
-- evaluated inside the same row-locked upsert, so two concurrent callers
-- can never both see it succeed. Returns the claimed row (with a fresh
-- holder_token) iff THIS call now owns the lock; an empty result means
-- someone else holds a live, unexpired lease for that exact (round_id,
-- revision, kind). Not SECURITY DEFINER: the only callers are service-role
-- admin clients (matching how round-recap.ts already writes
-- golf_round_recap_provenance), which have direct table grants already —
-- no privilege elevation is needed, so this stays a plain SECURITY INVOKER
-- function with a pinned search_path. p_kind has no default: every caller
-- must name the resource it is locking.
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
-- public.claim_round_recap_lock(uuid,integer,text,integer); DROP FUNCTION
-- public.release_round_recap_lock(uuid,integer,text,uuid); DROP TABLE
-- public.golf_round_recap_locks; — turning both feature flags back off
-- alone is sufficient to stop every code path that would call either
-- function.
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_round_recap_lock'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'release_round_recap_lock'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_round_recap_locks'::regclass); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_round_recap_locks', 'SELECT'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_round_recap_locks', 'SELECT'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.claim_round_recap_lock(uuid, integer, text, integer)', 'EXECUTE'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE has_function_privilege('service_role', 'public.claim_round_recap_lock(uuid, integer, text, integer)', 'EXECUTE'); -- noqa: LT05

CREATE TABLE IF NOT EXISTS public.golf_round_recap_locks (
    round_id uuid NOT NULL REFERENCES public.golf_rounds (
        id
    ) ON DELETE CASCADE,
    -- Hardcoded to 1 today (ROUND_RECAP_LOCK_REVISION = 1 in round-recap.ts);
    -- present ahead of need for a future regenerate flow that would
    -- increment it per round, never anywhere near 32-bit range.
    -- squawk-ignore prefer-bigint-over-int
    revision integer NOT NULL DEFAULT 1,
    kind text NOT NULL,
    holder_token uuid NOT NULL,
    locked_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (round_id, revision, kind),
    CONSTRAINT golf_round_recap_locks_kind_check CHECK (
        kind IN ('recap', 'round_review_narrative')
    )
);

COMMENT ON TABLE public.golf_round_recap_locks IS
'Single-flight lease for a per-round LLM call, taken BEFORE compose() so a '
'concurrent second request for the same (round_id, revision, kind) waits '
'for or reads the first call''s result instead of making a second '
'billable LLM call. Serves round-recap.ts (kind = ''recap'') and the '
'round-review narrative (kind = ''round_review_narrative'') — the name '
'predates the second caller. Row-per-(round_id,revision,kind), '
'TTL-expiring, service-role-only — written and cleared exclusively '
'through public.claim_round_recap_lock / public.release_round_recap_lock, '
'never through a direct client write.';

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
    p_kind text,
    p_ttl_seconds integer
)
RETURNS TABLE (holder_token uuid, expires_at timestamptz)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.golf_round_recap_locks AS l (
      round_id, revision, kind, holder_token, locked_at, expires_at
  )
  VALUES (
      p_round_id, p_revision, p_kind, gen_random_uuid(), now(),
      now() + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (round_id, revision, kind) DO UPDATE
    SET holder_token = gen_random_uuid(),
        locked_at = now(),
        expires_at = now() + make_interval(secs => p_ttl_seconds)
    WHERE l.expires_at < now()
  RETURNING l.holder_token, l.expires_at;
$$;

COMMENT ON FUNCTION public.claim_round_recap_lock(
    uuid, integer, text, integer
) IS
'Atomic conditional claim for golf_round_recap_locks: claims iff no row '
'exists for (round_id, revision, kind) or the existing row is expired. '
'Returns zero rows when a live, unexpired lease is already held by '
'someone else. service_role only — called by round-recap.ts''s and the '
'round-review narrative''s admin clients, each passing their own kind.';

REVOKE ALL ON FUNCTION public.claim_round_recap_lock(
    uuid, integer, text, integer
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_round_recap_lock(
    uuid, integer, text, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_round_recap_lock(
    p_round_id uuid,
    p_revision integer,
    p_kind text,
    p_holder_token uuid
)
RETURNS void
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  DELETE FROM public.golf_round_recap_locks
  WHERE round_id = p_round_id
    AND revision = p_revision
    AND kind = p_kind
    AND holder_token = p_holder_token;
$$;

COMMENT ON FUNCTION public.release_round_recap_lock(
    uuid, integer, text, uuid
) IS
'Releases a golf_round_recap_locks row only when the caller supplies the '
'exact holder_token it was issued at claim time — a slow winner whose '
'lease already expired (and was reclaimed by a new holder) can never '
'delete the new holder''s row out from under it. service_role only.';

REVOKE ALL ON FUNCTION public.release_round_recap_lock(
    uuid, integer, text, uuid
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_round_recap_lock(
    uuid, integer, text, uuid
) TO service_role;

-- -----------------------------------------------------------------------
-- Round-review narrative schema (owner decision, same day, folded into
-- this migration in place rather than a second file — the lock above and
-- this storage/task-key piece ship together so neither can be half-
-- applied). A 3-5 sentence LLM-authored paragraph for the Round Review
-- page (golf_round_reviews), distinct from round-recap.ts's 2-sentence
-- blurb on golf_rounds.ai_recap AND from the existing ephemeral
-- generateLlmRoundReview() (task 'round_review', v3/llm.ts) — that one is
-- never persisted; this one is, exactly once per round, the same
-- generate-once-then-cache shape as ai_recap.
--
-- A (task key): golf_coachhelm_llm_calls.task's CHECK constraint widens
-- from ('round_review' | 'hero_narrative' | 'coach_chat') to add
-- 'round_review_narrative'. A NEW key, not a reuse of the existing
-- 'round_review' key round-recap.ts and generateLlmRoundReview() both
-- already log under — the owner wants this surface's spend separable in
-- telemetry. Checked live before writing this: the constraint currently
-- reads exactly `CHECK ((task = ANY (ARRAY['round_review'::text,
-- 'hero_narrative'::text, 'coach_chat'::text])))` and
-- golf_coachhelm_llm_calls has 750 rows today — trivial, so a plain DROP +
-- ADD CONSTRAINT is used rather than staging with NOT VALID /
-- VALIDATE CONSTRAINT (that two-step exists to avoid a long
-- ACCESS EXCLUSIVE scan on a large table; 750 rows is instant).
-- DROP CONSTRAINT IF EXISTS: this migration is revised in place before
-- being applied anywhere, so a fresh apply must not fail on a constraint
-- name that was never created.
--
-- B (storage): golf_round_reviews gains one nullable `ai_narrative text`
-- column — additive, no RLS/grant change (golf_round_reviews already has
-- authenticated RLS policies that cover every column on the row, and no
-- per-column grant exists in this schema to widen). `summary` is
-- deliberately NOT reused for this text: it is today populated by a
-- deterministic engine (round-review-system.ts:computeAndStoreRoundReview,
-- values from coachHelmReview?.primaryTakeaway/practicePriority — no
-- compose() call in that path) and a coach editing/regenerating today
-- expects that deterministic sentence, not LLM prose; repurposing it
-- risked changing meaning under existing coach-facing UI without a UI
-- audit. A new column is the safe default.
--
-- Neither piece has a live caller until the round-review narrative action
-- ships (same PR, gated behind coachhelm_round_review_narrative, default
-- off everywhere) — this migration alone changes no runtime behavior.
-- `src/lib/types/database.ts` is NOT regenerated by this migration (it
-- isn't applied anywhere yet); every reader/writer of `ai_narrative` casts
-- through `(x as any)`, matching this file's own
-- `golf_round_recap_locks`/provenance precedent, until `npm run db:types`
-- runs against a database that has this applied.
--
-- ROLLBACK: additive only. To fully revert:
--   ALTER TABLE public.golf_round_reviews DROP COLUMN ai_narrative;
--   ALTER TABLE public.golf_coachhelm_llm_calls
--     DROP CONSTRAINT golf_coachhelm_llm_calls_task_check;
--   ALTER TABLE public.golf_coachhelm_llm_calls
--     ADD CONSTRAINT golf_coachhelm_llm_calls_task_check
--     CHECK (task = ANY (ARRAY['round_review'::text,
--       'hero_narrative'::text, 'coach_chat'::text]));
-- The DROP COLUMN is safe only once no row has generation_method or any
-- other column implying an `ai_narrative` was ever written was relied on
-- downstream — this narrows nothing else, so it is the only ordering
-- constraint: revert while `round_review_narrative` rows are known to be
-- either absent or acceptable to lose.
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_round_reviews' AND column_name = 'ai_narrative'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_round_reviews' AND column_name = 'ai_narrative') = 'YES'; -- noqa: LT05
-- VERIFY: SELECT 1 WHERE position('round_review_narrative' IN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'golf_coachhelm_llm_calls_task_check'))) > 0; -- noqa: LT05

ALTER TABLE public.golf_round_reviews
ADD COLUMN IF NOT EXISTS ai_narrative text;

COMMENT ON COLUMN public.golf_round_reviews.ai_narrative IS
'LLM-authored 3-5 sentence narrative paragraph (round-review narrative '
'feature, Package 8, migration 20260923100000) — distinct from the '
'deterministic `summary` column and from round-recap.ts''s separate '
'`golf_rounds.ai_recap` blurb. NULL until the flagged narrative action '
'generates and caches one for the round; caches a deterministic fallback '
'permanently on LLM/validation failure the same way ai_recap does — one '
'attempt per round, never silently retried on a later page load.';

ALTER TABLE public.golf_coachhelm_llm_calls
DROP CONSTRAINT IF EXISTS golf_coachhelm_llm_calls_task_check;

ALTER TABLE public.golf_coachhelm_llm_calls
-- golf_coachhelm_llm_calls is ~750 rows; the table-scan validation this
-- constraint re-add triggers is instant, and this is an append-only audit
-- log with negligible concurrent-write pressure. NOT VALID + a separate
-- VALIDATE CONSTRAINT would add a second DDL statement for no measurable
-- safety gain at this size.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT golf_coachhelm_llm_calls_task_check
CHECK (task = any(ARRAY[
    'round_review'::text,
    'hero_narrative'::text,
    'coach_chat'::text,
    'round_review_narrative'::text
]));
