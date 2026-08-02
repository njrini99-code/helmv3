-- ============================================================================
-- golf_player_stats_cache.round_ids_included: correct the COMMENT
-- ----------------------------------------------------------------------------
-- Issue #1234.
--
-- The column claims to record the rounds a cache row was computed from:
--
--   'Array of round IDs included in the calculation for verification'
--
-- It does not. update_player_stats_complete() fills it from the SEASON query,
-- sharing a variable with rounds_this_season:
--
--   v_season_start := make_date(... , 8, 1);   -- season starts Aug 1
--   SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC)
--   INTO   v_rounds_this_season, v_round_ids
--   FROM   golf_round_stats_cache rsc
--   JOIN   golf_rounds r ON r.id = rsc.round_id
--   WHERE  rsc.player_id = v_player_id AND r.round_date >= v_season_start;
--
-- Observed 2026-08-02 (two days into the new season): a player with
-- rounds_in_calculation = 16 carried a single id, because only one round fell
-- on/after 2026-08-01. Every aggregate on the row was computed over all 16.
--
-- Most rows currently look consistent only because those players happen to
-- have all their rounds inside the current season window — coincidence, not
-- invariant, and it dissolves as the 2026-27 season fills in.
--
-- Only the COMMENT is corrected here. The column is NOT renamed: nothing in
-- application code reads it (`grep -rn round_ids_included src` finds only the
-- generated database.ts type), so a rename is churn with migration risk and no
-- consumer benefit, and the semantics it actually has — the season's rounds —
-- are worth keeping now that they are labelled honestly. If true calculation
-- provenance is ever wanted, add a second column rather than repurposing this
-- one, so rounds_this_season keeps its source.
-- ============================================================================

COMMENT ON COLUMN public.golf_player_stats_cache.round_ids_included IS
  'Round IDs from the CURRENT SEASON only (season starts Aug 1) — the same '
  'population as rounds_this_season, with which it shares a query in '
  'update_player_stats_complete(). This is NOT the set of rounds the cached '
  'aggregates were computed from: those cover all of the player''s rounds and '
  'are counted by rounds_in_calculation, which will legitimately exceed '
  'array_length(round_ids_included, 1) for any player with rounds from a '
  'previous season. See issue #1234.';
