-- CoachHelm prediction accuracy cleanup (audit rows 17 / 57). NOT APPLIED.
--
-- One-off production data repair. Owner runs it after reviewing the preview
-- queries at the bottom. Forward-only, no schema change. Everything is in one
-- transaction; replace the final ROLLBACK with COMMIT to keep it.
--
--   psql "$PROD_DB_URL" -f scripts/coachhelm/prediction-accuracy-cleanup.sql
--
-- What it fixes:
--
-- 1. The 415 "validated" predictions with no actual value (Mar-Jun 2026).
--    Verified 2026-09-28: all 415 already carry error_category =
--    'invalid_horizon' and was_accurate IS NULL, and none has a
--    golf_prediction_validations row. The rows themselves are retired; the
--    damage is in readers that counted `validated_at IS NOT NULL` as
--    validated. The code now uses one rule (isGradedPrediction in
--    prediction-performance-writer.ts). Step 1 below only asserts that state,
--    so a row that drifted since the check is retired the same way.
--
-- 2. golf_prediction_model_performance snapshots written before the writer
--    excluded invalid_horizon rows, which carry the old denominator (the
--    Apr-Jul monthly accuracy of 0.16-0.40). Every snapshot is recomputed in
--    place from golf_predictions, as of its own period_end (only validations
--    that existed by then), with accuracy = actual inside the stored band.
--    A snapshot whose window holds no live prediction is deleted.
--
-- 3. The four legacy golf_confidence_calibration rows (prediction_type
--    'general' / 'round_score'): 61 predictions, 0 correct, last updated
--    2026-03-14. The calibration cron only upserts score_to_par now, and
--    confidence-calibrator.bootstrapFromDb has no fallback to these keys, so
--    deleting them changes no ranking.

BEGIN;

-- 1. Retire any null-actual verdict that is not already retired.
UPDATE golf_predictions
SET error_category = 'invalid_horizon',
    was_accurate   = NULL,
    updated_at     = now()
WHERE validated_at IS NOT NULL
  AND actual_value IS NULL
  AND error_category IS DISTINCT FROM 'invalid_horizon'
  AND NOT EXISTS (
    SELECT 1 FROM golf_prediction_validations v WHERE v.prediction_id = golf_predictions.id
  );

-- 2a. Recompute every snapshot from the predictions in its window.
WITH recomputed AS (
  SELECT
    s.id,
    count(p.id) AS made,
    count(p.id) FILTER (WHERE p.validated_at < s.period_end + 1 AND p.actual_value IS NOT NULL) AS validated,
    count(p.id) FILTER (
      WHERE p.validated_at < s.period_end + 1
        AND p.actual_value IS NOT NULL
        AND p.actual_value BETWEEN coalesce(p.predicted_low, p.confidence_interval_low)
                               AND coalesce(p.predicted_high, p.confidence_interval_high)
    ) AS in_band,
    avg(abs(p.predicted_value - p.actual_value))
      FILTER (WHERE p.validated_at < s.period_end + 1 AND p.actual_value IS NOT NULL) AS mae,
    sqrt(avg((p.predicted_value - p.actual_value) ^ 2)
      FILTER (WHERE p.validated_at < s.period_end + 1 AND p.actual_value IS NOT NULL)) AS rmse,
    avg(p.predicted_value - p.actual_value)
      FILTER (WHERE p.validated_at < s.period_end + 1 AND p.actual_value IS NOT NULL) AS bias
  FROM golf_prediction_model_performance s
  LEFT JOIN golf_team_members m
    ON m.team_id = s.team_id AND m.status = 'active'
  LEFT JOIN golf_predictions p
    ON p.player_id = m.player_id
   AND p.metric = s.model_type
   AND p.created_at >= s.period_start
   AND p.created_at < s.period_end
   AND p.error_category IS DISTINCT FROM 'invalid_horizon'
  GROUP BY s.id
)
UPDATE golf_prediction_model_performance s
SET predictions_made      = r.made,
    predictions_validated = r.validated,
    accuracy_rate         = CASE WHEN r.validated > 0 THEN r.in_band::numeric / r.validated ELSE 0 END,
    mean_absolute_error   = coalesce(r.mae, 0),
    root_mean_square_error = coalesce(r.rmse, 0),
    systematic_bias       = coalesce(r.bias, 0),
    updated_at            = now()
FROM recomputed r
WHERE r.id = s.id
  AND r.made > 0;

-- 2b. A snapshot with no live prediction in its window says nothing.
DELETE FROM golf_prediction_model_performance s
WHERE NOT EXISTS (
  SELECT 1
  FROM golf_team_members m
  JOIN golf_predictions p
    ON p.player_id = m.player_id
   AND p.metric = s.model_type
   AND p.created_at >= s.period_start
   AND p.created_at < s.period_end
   AND p.error_category IS DISTINCT FROM 'invalid_horizon'
  WHERE m.team_id = s.team_id AND m.status = 'active'
);

-- 3. Legacy calibration buckets nothing produces or reads.
DELETE FROM golf_confidence_calibration
WHERE prediction_type IN ('general', 'round_score');

-- Preview (read these before choosing COMMIT).
SELECT to_char(period_end, 'YYYY-MM') AS month,
       count(*) AS snapshots,
       round(avg(accuracy_rate), 3) AS mean_accuracy,
       sum(predictions_validated) AS validated_sum
FROM golf_prediction_model_performance
GROUP BY 1 ORDER BY 1;

SELECT prediction_type, bucket, predictions_count, correct_count, updated_at
FROM golf_confidence_calibration ORDER BY 1, 2;

ROLLBACK;
