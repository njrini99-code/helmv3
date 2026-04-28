-- ============================================================================
-- P2 backfill: archive coach insights below the new sample-size minimums.
--
-- Run on: project qmnssrrolpinvwjjnufo (Supabase).
-- Triggered by: coachhelm/v2/mining/{putt-analytics,approach-analytics,
--               scrambling-analytics,stats-insight-generator}.ts thresholds
--               tightened on 2026-04-27.
--
-- Method: every Tier-1 generator persists an `evidence` JSONB column with
-- `metric` and `sample_n`. We archive any 'detected' or 'matured' insight
-- whose sample_n falls below the new floor for its metric family.
--
-- Lifecycle states existing on golf_coach_insights (per insights/types.ts):
--   tentative | detected | matured | addressed | resolved | archived
-- We move qualifying rows to 'archived' (not 'resolved' — the player didn't
-- act on these; we're retracting them) and stamp archived_at = now().
-- The `status` column (separate from lifecycle_state) is set to 'dismissed'
-- so the rows drop off coach/player surfaces immediately.
-- ============================================================================

BEGIN;

-- 1) Putt make-rate per distance bucket → minimum 10 attempts.
--    Metric format: `putt_make_rate_0_3ft` | `_3_6ft` | `_6_10ft` |
--                   `_10_15ft` | `_15_20ft` | `_20+ft`.
WITH archived_putt_make AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' LIKE 'putt_make_rate_%'
    AND COALESCE((evidence->>'sample_n')::int, 0) < 10
  RETURNING id
)
SELECT 'putt_make_rate' AS bucket, count(*) AS archived FROM archived_putt_make;

-- 2) Putt miss-direction bias (read low/high, speed short/long) → min 20.
WITH archived_putt_bias AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' IN ('putt_miss_bias_read', 'putt_miss_bias_speed')
    AND COALESCE((evidence->>'sample_n')::int, 0) < 20
  RETURNING id
)
SELECT 'putt_miss_bias' AS bucket, count(*) AS archived FROM archived_putt_bias;

-- 3) Approach severity (avg distance from pin on missed greens) → min 15.
--    Metric format: `approach_severity_<150` | `_150_175` | `_175_200` | `_200+`.
WITH archived_approach_severity AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' LIKE 'approach_severity_%'
    AND COALESCE((evidence->>'sample_n')::int, 0) < 15
  RETURNING id
)
SELECT 'approach_severity' AS bucket, count(*) AS archived FROM archived_approach_severity;

-- 4) Approach direction-bias (left/right miss skew) → min 12 directional.
--    Metric format: `approach_direction_<bucket>_<left|right>`.
--    Note: sample_n is the directional-tagged-miss count, not the bucket size.
WITH archived_approach_direction AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' LIKE 'approach_direction_%'
    AND COALESCE((evidence->>'sample_n')::int, 0) < 12
  RETURNING id
)
SELECT 'approach_direction' AS bucket, count(*) AS archived FROM archived_approach_direction;

-- 5) Scrambling per lie → min 15 (fairway/rough), min 6 (bunker).
--    Metric format: `scrambling_fairway` | `_rough` | `_bunker`.
WITH archived_scrambling_grass AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' IN ('scrambling_fairway', 'scrambling_rough')
    AND COALESCE((evidence->>'sample_n')::int, 0) < 15
  RETURNING id
)
SELECT 'scrambling_fairway_rough' AS bucket, count(*) AS archived FROM archived_scrambling_grass;

WITH archived_scrambling_sand AS (
  UPDATE golf_coach_insights
  SET lifecycle_state = 'archived',
      archived_at     = now(),
      status          = 'dismissed'
  WHERE lifecycle_state IN ('detected', 'matured')
    AND evidence->>'metric' = 'scrambling_bunker'
    AND COALESCE((evidence->>'sample_n')::int, 0) < 6
  RETURNING id
)
SELECT 'scrambling_bunker' AS bucket, count(*) AS archived FROM archived_scrambling_sand;

-- ----------------------------------------------------------------------------
-- After-run sanity. Should report zero qualifying rows for each family.
-- ----------------------------------------------------------------------------
SELECT
  CASE
    WHEN evidence->>'metric' LIKE 'putt_make_rate_%' THEN 'putt_make_rate'
    WHEN evidence->>'metric' IN ('putt_miss_bias_read','putt_miss_bias_speed') THEN 'putt_miss_bias'
    WHEN evidence->>'metric' LIKE 'approach_severity_%' THEN 'approach_severity'
    WHEN evidence->>'metric' LIKE 'approach_direction_%' THEN 'approach_direction'
    WHEN evidence->>'metric' IN ('scrambling_fairway','scrambling_rough') THEN 'scrambling_fr'
    WHEN evidence->>'metric' = 'scrambling_bunker' THEN 'scrambling_bunker'
    ELSE 'other'
  END AS family,
  count(*) AS still_below_threshold
FROM golf_coach_insights
WHERE lifecycle_state IN ('detected', 'matured')
  AND (
    (evidence->>'metric' LIKE 'putt_make_rate_%' AND (evidence->>'sample_n')::int < 10) OR
    (evidence->>'metric' IN ('putt_miss_bias_read','putt_miss_bias_speed') AND (evidence->>'sample_n')::int < 20) OR
    (evidence->>'metric' LIKE 'approach_severity_%' AND (evidence->>'sample_n')::int < 15) OR
    (evidence->>'metric' LIKE 'approach_direction_%' AND (evidence->>'sample_n')::int < 12) OR
    (evidence->>'metric' IN ('scrambling_fairway','scrambling_rough') AND (evidence->>'sample_n')::int < 15) OR
    (evidence->>'metric' = 'scrambling_bunker' AND (evidence->>'sample_n')::int < 6)
  )
GROUP BY 1;

COMMIT;
