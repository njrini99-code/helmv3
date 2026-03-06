-- ============================================================================
-- One-time cleanup of orphaned in_progress rounds
-- These were created by the dual round ID tracking bug where savePartialRound
-- created a second round because savedRoundIdRef was not synced with the
-- auto-save hook's currentRoundId.
-- ============================================================================

DELETE FROM golf_rounds
WHERE status = 'in_progress'
  AND id NOT IN (SELECT DISTINCT round_id FROM golf_shots WHERE round_id IS NOT NULL)
  AND updated_at < NOW() - INTERVAL '24 hours';
