-- Purge calibration buckets for prediction types that no longer exist.
--
-- `general` and `round_score` were last written 2026-03-14 and record
-- 0 correct out of 61 predictions (0% accuracy) across their 0.7 and 0.8
-- buckets. No code path has produced either prediction_type since;
-- golf_predictions.metric is 100% 'score_to_par' today.
--
-- These rows are deleted rather than left in place because the very next
-- change (bootstrapping ConfidenceCalibrator from this table) would load
-- them as live calibration data and suppress every high-confidence
-- prediction to near zero. Scoped DELETE of two dead enum values — not a
-- delete-then-reinsert of live data.
DELETE FROM golf_confidence_calibration
WHERE prediction_type IN ('general', 'round_score');

-- Verification query (run after migration to confirm state):
-- SELECT prediction_type, count(*) FROM golf_confidence_calibration GROUP BY 1;
-- Expected: exactly one row — score_to_par | 3
