-- ============================================================================
-- HOTFIX: Two bugs in update_player_stats_cache_enhanced()
--
-- Bug 1: "column reference 'created_at' is ambiguous" (42702)
--   ARRAY_AGG(round_id ORDER BY created_at DESC) — both golf_round_stats_cache
--   and golf_rounds have created_at. Fixed: ORDER BY r.round_date DESC.
--
-- Bug 2: Infinite trigger recursion → stack depth limit exceeded (54001)
--   trg_update_player_stats_cache_enhanced was on golf_player_stats_cache.
--   The function UPDATEs that same table, re-firing itself infinitely.
--   Fixed: moved trigger to golf_round_stats_cache instead.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_cache_enhanced()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_id UUID;
  v_last_5_avg NUMERIC(5,2);
  v_last_10_avg NUMERIC(5,2);
  v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2);
  v_trend TEXT;
  v_round_ids UUID[];
  v_season_start DATE;
  v_rounds_this_season INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Current college golf season start (Aug 1)
  v_season_start := make_date(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    END,
    8, 1
  );

  -- Count rounds this season
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

  -- Last 5 rounds average (normalized to 18-hole equivalent)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_last_5_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 5
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

  -- Last 10 rounds average (normalized to 18-hole equivalent)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_last_10_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 10
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

  -- Previous 5 rounds average (rounds 6-10, normalized)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_prev_5_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 5 OFFSET 5
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

  -- Calculate improvement trend
  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    IF v_improvement > 1.0 THEN
      v_trend := 'improving';
    ELSIF v_improvement < -1.0 THEN
      v_trend := 'declining';
    ELSE
      v_trend := 'stable';
    END IF;
  ELSE
    v_improvement := NULL;
    v_trend := 'stable';
  END IF;

  -- Update with enhanced stats
  UPDATE golf_player_stats_cache
  SET
    last_5_average = v_last_5_avg,
    last_10_average = v_last_10_avg,
    improvement_trend = v_improvement,
    trend_direction = v_trend,
    rounds_this_season = v_rounds_this_season,
    season_start_date = v_season_start,
    round_ids_included = v_round_ids,
    is_stale = FALSE,
    next_refresh_due = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Move trigger from golf_player_stats_cache to golf_round_stats_cache
-- to prevent infinite recursion (the function UPDATEs golf_player_stats_cache,
-- so it cannot be triggered BY golf_player_stats_cache changes).
DROP TRIGGER IF EXISTS trg_update_player_stats_cache_enhanced ON golf_player_stats_cache;

CREATE TRIGGER trg_update_player_stats_cache_enhanced
  AFTER INSERT OR UPDATE OR DELETE ON golf_round_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_cache_enhanced();
