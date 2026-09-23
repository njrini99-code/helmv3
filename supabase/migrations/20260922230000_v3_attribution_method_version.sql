-- N10 (2026-09-12 CoachHelm repair plan, §6.7): version the outcome
-- attribution method so old (v1) and new (v2) rows are distinguishable.
--
-- v1's "trend-adjusted" lift, `rawDelta - (ambient.avg - base.avg)`, was
-- algebraically `post.avg - base.avg - ambient.avg + base.avg`, which
-- cancels to `post.avg - ambient.avg` -- the immediate pre-window baseline
-- fully drops out, despite the code and comments claiming it nets out the
-- player's ambient trend beyond that baseline. v2
-- (src/lib/coachhelm/v3/causality/attribute.ts) reports the observed,
-- direction-corrected change (`post.avg - base.avg`) instead and drops the
-- ambient fetch from the lift computation entirely, per plan item 1 ("rename
-- existing values according to what they actually calculate") and item 4
-- ("report the observed before/after change with uncertainty first").
--
-- Purely additive: nullable, no default, no backfill. Existing rows stay
-- NULL, which this migration's own comment (and the application code
-- reading it) treats as "v1" -- the only method that has ever written this
-- table. No RLS or grant changes.

ALTER TABLE "public"."golf_insight_outcome_attribution"
ADD COLUMN IF NOT EXISTS "method_version" text;

-- ROLLBACK: `ALTER TABLE public.golf_insight_outcome_attribution DROP COLUMN
-- ROLLBACK: method_version;` — safe: the column is nullable, additive, and
-- ROLLBACK: read by application code with a `?? 'v1'` fallback, never
-- ROLLBACK: assumed present.
--
-- VERIFY: select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_insight_outcome_attribution' and column_name = 'method_version'; -- noqa: LT05

COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."method_version"
IS 'Attribution lift method. NULL = v1 (pre-2026-09-22, post-ambient
trend-adjusted lift that algebraically cancelled to post-vs-ambient — see
N10). ''v2_observed_delta'' = direction-corrected post-vs-baseline observed
change, no ambient adjustment.';
