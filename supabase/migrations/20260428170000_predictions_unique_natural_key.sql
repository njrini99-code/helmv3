-- =====================================================================
-- golf_predictions: unique natural key for upsert-driven persistence
-- =====================================================================
--
-- The PerformancePredictor wrote a fresh row on every analyzePlayer()
-- call, producing 6+ identical rows per (player_id, metric, due_date).
-- Switch the writer to .upsert(..., { onConflict: 'player_id,metric,due_date' })
-- and back it with this partial unique index.
--
-- Natural key rationale:
--   - One prediction per metric per upcoming round-target per player.
--   - In this codebase the round target is encoded as `due_date` (the
--     date of the predicted round). `related_round_id` is set after the
--     round happens during validation, not at write time.
--
-- Partial WHERE due_date IS NOT NULL keeps the index from blocking any
-- legacy rows (older predictions written without due_date).
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS golf_predictions_natural_key
  ON golf_predictions (player_id, metric, due_date)
  WHERE due_date IS NOT NULL;

COMMENT ON INDEX golf_predictions_natural_key IS
  'Natural key for upsert: one prediction per (player, metric, target due_date). Enforces dedup of PerformancePredictor writes.';
