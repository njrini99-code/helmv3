-- ============================================================================
-- Migration: Create refresh_player_stats_cache RPC Function
-- ============================================================================
-- This function is called by the app via supabase.rpc('refresh_player_stats_cache')
-- to fully recompute all cached stats for a given player.
--
-- Strategy:
--   1. Delete existing golf_round_stats_cache rows for the player
--   2. Re-insert fresh calculations from golf_rounds + golf_holes
--   3. The cascade trigger (trg_update_player_stats_cache) on golf_round_stats_cache
--      will automatically rebuild golf_player_stats_cache
--   4. Update par averages separately (requires golf_holes aggregation)
--   5. Mark is_stale = false on the player stats cache
--
-- Uses correct column names per current schema:
--   golf_rounds: status (not round_status), total_fairways_hit (not fairways_hit),
--                total_gir (not greens_in_regulation), score_to_par (not total_to_par)
--   golf_holes:  gir (not green_in_regulation), penalty_strokes (not penalties)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_player_stats_cache(p_player_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Delete existing round stats cache for this player
  -- This will fire the DELETE trigger on golf_round_stats_cache which cascades
  -- to update golf_player_stats_cache
  DELETE FROM golf_round_stats_cache WHERE player_id = p_player_id;

  -- Step 2: Re-insert fresh round stats from golf_rounds + golf_holes
  -- The INSERT trigger on golf_round_stats_cache will cascade to rebuild
  -- golf_player_stats_cache automatically
  INSERT INTO golf_round_stats_cache (
    round_id, player_id,
    total_score, score_to_par,
    front_nine, back_nine,
    fairways_hit, fairways_total,
    greens_hit, greens_total,
    total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green,
    strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    r.id AS round_id,
    r.player_id,
    r.total_score,
    r.score_to_par,
    COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0),
    COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0),
    COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)),
    COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)),
    COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)),
    COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)),
    COALESCE(r.total_putts, SUM(h.putts)),
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0) AS scrambles_converted,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0) AS scramble_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0) AS eagles,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0) AS birdies,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0) AS pars,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0) AS bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0) AS double_bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0) AS triple_plus,
    COALESCE(r.total_penalties, SUM(COALESCE(h.penalty_strokes, 0))),
    r.strokes_gained_total,
    r.strokes_gained_tee,
    r.strokes_gained_approach,
    r.strokes_gained_around_green,
    r.strokes_gained_putting,
    NOW(),
    NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id AND r.status = 'completed'
  GROUP BY r.id, r.player_id, r.total_score, r.score_to_par,
           r.front_nine, r.back_nine,
           r.total_fairways_hit, r.total_fairways,
           r.total_gir, r.total_gir_possible,
           r.total_putts, r.total_penalties,
           r.strokes_gained_total, r.strokes_gained_tee,
           r.strokes_gained_approach, r.strokes_gained_around_green,
           r.strokes_gained_putting
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine,
    back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts,
    one_putts = EXCLUDED.one_putts,
    three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes,
    strokes_gained_total = EXCLUDED.strokes_gained_total,
    strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting,
    updated_at = NOW();

  -- Step 3: Update par averages (requires separate aggregation from golf_holes)
  -- The cascade trigger handles most player stats, but par averages need
  -- direct computation from hole-level data
  UPDATE golf_player_stats_cache psc
  SET
    par3_average = sub.par3_avg,
    par4_average = sub.par4_avg,
    par5_average = sub.par5_avg,
    updated_at = NOW()
  FROM (
    SELECT
      AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
      AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
      AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg
    FROM golf_holes h
    JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id
      AND r.status = 'completed'
      AND h.score IS NOT NULL
  ) sub
  WHERE psc.player_id = p_player_id;

  -- Step 4: Mark cache as fresh
  UPDATE golf_player_stats_cache
  SET is_stale = false,
      updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION refresh_player_stats_cache(UUID) IS
  'RPC function to fully recompute stats cache for a specific player.
   Deletes and rebuilds golf_round_stats_cache rows, which cascades to
   golf_player_stats_cache via triggers. Called by the app after round
   completion, edits, or deletions.';
