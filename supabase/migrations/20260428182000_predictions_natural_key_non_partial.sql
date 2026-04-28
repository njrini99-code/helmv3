-- =====================================================================
-- golf_predictions: drop partial predicate from natural-key unique index
-- =====================================================================
--
-- The earlier 20260428170000 migration created a PARTIAL unique index
--   ON golf_predictions (player_id, metric, due_date) WHERE due_date IS NOT NULL.
--
-- Postgres rejected the predictor's upsert at runtime:
--   ERROR: there is no unique or exclusion constraint matching the
--   ON CONFLICT specification
-- because supabase-js's `onConflict: 'player_id,metric,due_date'` cannot
-- pass through the partial predicate, so PostgREST cannot infer the
-- index. Index inference for ON CONFLICT requires the inference clause
-- to imply the index predicate; supabase-js does not expose that knob.
--
-- Replace with a non-partial unique index on the same columns. We
-- verified there are no `due_date IS NULL` rows in production before
-- applying, so the index creation is conflict-free. NULL `due_date`
-- rows would be permitted by default Postgres NULLS DISTINCT semantics
-- (a future write could insert one without conflict) — predictions
-- without a target round are not part of the dedup contract anyway.
-- =====================================================================

DROP INDEX IF EXISTS golf_predictions_natural_key;

CREATE UNIQUE INDEX IF NOT EXISTS golf_predictions_natural_key
  ON golf_predictions (player_id, metric, due_date);

COMMENT ON INDEX golf_predictions_natural_key IS
  'Natural key for upsert: one prediction per (player, metric, due_date). Non-partial so PostgREST onConflict can infer it.';
