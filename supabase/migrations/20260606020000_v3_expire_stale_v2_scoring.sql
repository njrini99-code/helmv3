-- Expire stale insight rows that the read-path v3 filter + deploy do NOT
-- self-heal (audit EC-1 / FID-1/FID-2, SAPG-2, pg-1) — REQUIRES DEPLOY +
-- HUMAN APPLY. These rows already shipped to coaches and will keep rendering
-- until explicitly archived; the source-side fixes (v3 read filter, proximity
-- %-as-feet fix, pressure-gate fix) only stop NEW bad rows.
--
-- "Expire" = set lifecycle_state='archived' (+ stamp archived_at). Every
-- delivery fetcher filters `lifecycle_state IN (detected,matured,addressed,
-- resolved)`, so an archived row drops out of every coach/player surface
-- without being destroyed (no DELETE — fully reversible, audit-friendly).
--
-- Idempotent: the `lifecycle_state <> 'archived'` predicate makes a re-run a
-- no-op. Apply AFTER the deploy that ships the v3 read-path filter.

-- 1. Stale v2 `par_scoring_parN` rows (scale-mix at benchmarks.ts:111): a to-par
--    player value compared against a raw-stroke team average → physically-
--    impossible strokes_impact up to ~42.5/round, ranking #1. The v3 read filter
--    already hides v2 rows from delivery, but archive them so they also leave the
--    coach insight-management list and never re-poison ranking. (~46 rows.)
UPDATE "public"."golf_coach_insights"
SET lifecycle_state = 'archived',
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
WHERE engine_version = 'v2'
  AND insight_type = 'scoring'
  AND (evidence ->> 'comparison_source') = 'team_avg'
  AND (evidence ->> 'metric') LIKE 'par_scoring_par%'
  AND lifecycle_state <> 'archived';

-- 2. The 6 stale `short_approach_proximity_gap` composite rows that render the
--    green-hit PERCENT as proximity FEET ("leaving the ball 73 ft from the
--    hole"). The fix is committed but undeployed and these rows won't self-heal;
--    archive them so the pre-fix prose stops shipping. (6 rows.)
UPDATE "public"."golf_coach_insights"
SET lifecycle_state = 'archived',
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
WHERE engine_version = 'v3'
  AND signature LIKE 'v3:composite:short_approach_proximity_gap%'
  AND lifecycle_state <> 'archived';

-- 3. The 4 stale pressure-gap HIGH rows whose "competitive vs practice" split
--    rests on a SINGLE practice round (statistically meaningless) yet projects
--    an impossible +5-6 strokes/round and never retracts. Predicate matches the
--    "vs <X> in 1 practice round" prose AND a counterfactual >= 2.5/round
--    (the realistic per-round ceiling), pinning exactly the 4 audited rows
--    without touching the well-supported pressure_gap rows. (4 rows.)
UPDATE "public"."golf_coach_insights"
SET lifecycle_state = 'archived',
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
WHERE engine_version = 'v3'
  AND insight_type = 'pressure_gap'
  AND priority = 'high'
  AND lifecycle_state <> 'archived'
  AND content ~ 'vs [^ ]+ in 1 practice round'
  AND (evidence #>> '{counterfactual,strokes_saved_per_round}') ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND (evidence #>> '{counterfactual,strokes_saved_per_round}')::numeric >= 2.5;
