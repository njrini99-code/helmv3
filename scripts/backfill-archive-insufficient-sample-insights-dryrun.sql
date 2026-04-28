-- ============================================================================
-- DRY RUN companion to backfill-archive-insufficient-sample-insights.sql.
--
-- Run this first against project qmnssrrolpinvwjjnufo to see how many rows
-- the live UPDATE would touch. No data is modified.
-- ============================================================================

SELECT
  CASE
    WHEN evidence->>'metric' LIKE 'putt_make_rate_%' THEN 'putt_make_rate (min 10)'
    WHEN evidence->>'metric' IN ('putt_miss_bias_read','putt_miss_bias_speed') THEN 'putt_miss_bias (min 20)'
    WHEN evidence->>'metric' LIKE 'approach_severity_%' THEN 'approach_severity (min 15)'
    WHEN evidence->>'metric' LIKE 'approach_direction_%' THEN 'approach_direction (min 12)'
    WHEN evidence->>'metric' IN ('scrambling_fairway','scrambling_rough') THEN 'scrambling_grass (min 15)'
    WHEN evidence->>'metric' = 'scrambling_bunker' THEN 'scrambling_bunker (min 6)'
    ELSE 'other / not affected'
  END AS family,
  count(*) AS would_archive,
  min((evidence->>'sample_n')::int) AS min_n,
  max((evidence->>'sample_n')::int) AS max_n,
  round(avg((evidence->>'sample_n')::int)::numeric, 1) AS avg_n
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
GROUP BY 1
ORDER BY would_archive DESC;
