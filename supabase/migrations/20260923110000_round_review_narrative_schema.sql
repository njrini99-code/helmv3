-- Package 8: schema for the round-review narrative (owner decision,
-- 2026-09-23) — a longer (3-5 sentence) LLM-authored paragraph for the
-- Round Review page (`golf_round_reviews`), distinct from round-recap.ts's
-- 2-sentence blurb on `golf_rounds.ai_recap`. See the spec sent to the
-- owner for full scope; this migration is just the storage + task-key
-- pieces, combined here so they cannot be half-applied.
--
-- A (task key): golf_coachhelm_llm_calls.task's CHECK constraint widens
-- from ('round_review' | 'hero_narrative' | 'coach_chat') to add
-- 'round_review_narrative'. A NEW key, not a reuse of the existing
-- 'round_review' key that round-recap.ts already logs under — the two
-- surfaces have different cost profiles (a paragraph costs meaningfully
-- more than two sentences) and the owner wants them separable in spend
-- telemetry. Checked live before writing this: the constraint currently
-- reads exactly `CHECK ((task = ANY (ARRAY['round_review'::text,
-- 'hero_narrative'::text, 'coach_chat'::text])))` and
-- golf_coachhelm_llm_calls has 750 rows today — trivial, so a plain DROP +
-- ADD CONSTRAINT is used rather than staging with NOT VALID /
-- VALIDATE CONSTRAINT (that two-step exists to avoid a long
-- ACCESS EXCLUSIVE scan on a large table; 750 rows is instant).
--
-- B (storage): golf_round_reviews gains one nullable `ai_narrative text`
-- column — additive, no RLS/grant change (mirrors
-- 20260923080000_recap_provenance_and_single_flight.sql's own table
-- addition, applied the same way as a plain column here since
-- golf_round_reviews already has authenticated RLS policies that cover
-- every column on the row, and no per-column grant exists in this schema
-- to widen). `summary` is deliberately NOT reused for this text: it is
-- today populated by a deterministic engine
-- (round-review-system.ts:computeAndStoreRoundReview, values from
-- coachHelmReview?.primaryTakeaway/practicePriority — no compose() call in
-- that path) and a coach editing/regenerating today expects that
-- deterministic sentence, not LLM prose; repurposing it risked changing
-- meaning under existing coach-facing UI without a UI audit. A new column
-- is the safe default.
--
-- Neither piece has a live caller until the round-review narrative action
-- ships (same PR, gated behind coachhelm_round_review_narrative, default
-- off everywhere) — this migration alone changes no runtime behavior.
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
'feature, Package 8, migration 20260923110000) — distinct from the '
'deterministic `summary` column and from round-recap.ts''s separate '
'`golf_rounds.ai_recap` blurb. NULL until the flagged narrative action '
'generates and caches one for the round; caches a deterministic fallback '
'permanently on LLM/validation failure the same way ai_recap does — one '
'attempt per round, never silently retried on a later page load.';

ALTER TABLE public.golf_coachhelm_llm_calls
DROP CONSTRAINT golf_coachhelm_llm_calls_task_check;

ALTER TABLE public.golf_coachhelm_llm_calls
ADD CONSTRAINT golf_coachhelm_llm_calls_task_check
CHECK (task = ANY(ARRAY[
    'round_review'::text,
    'hero_narrative'::text,
    'coach_chat'::text,
    'round_review_narrative'::text
]));
