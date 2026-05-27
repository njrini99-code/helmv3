-- ============================================================================
-- Migration 053: Golf Stats Cache Enhancements
-- Adds additional summary fields for instant dashboard loads:
-- - Last 5/10 round averages for trend analysis
-- - Improvement trends
-- - Season-specific stats
-- - Strokes gained totals
-- ============================================================================

-- ============================================================================
-- 1. Add enhancement columns to golf_player_stats_cache
-- ============================================================================

-- Season tracking
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS rounds_this_season INTEGER DEFAULT 0;

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS season_start_date DATE;

-- Trend averages (rolling window stats)
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS last_5_average NUMERIC(5,2);

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS last_10_average NUMERIC(5,2);

-- Improvement trend (positive = improving, negative = declining)
-- Calculated as: last_5_average - previous_5_average
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS improvement_trend NUMERIC(5,2);

-- Direction indicator for quick UI display
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS trend_direction TEXT CHECK (trend_direction IN ('improving', 'stable', 'declining'));

-- Strokes gained per round averages
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS sg_total_per_round NUMERIC(5,2);

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS sg_tee_per_round NUMERIC(5,2);

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS sg_approach_per_round NUMERIC(5,2);

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS sg_around_green_per_round NUMERIC(5,2);

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS sg_putting_per_round NUMERIC(5,2);

-- Cache freshness tracking
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;

ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS next_refresh_due TIMESTAMPTZ;

-- Array of round IDs included in calculation (for debugging/verification)
ALTER TABLE golf_player_stats_cache
ADD COLUMN IF NOT EXISTS round_ids_included UUID[];

-- ============================================================================
-- 2. Create index for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_player_stats_cache_stale
ON golf_player_stats_cache(is_stale)
WHERE is_stale = TRUE;

CREATE INDEX IF NOT EXISTS idx_golf_player_stats_cache_refresh
ON golf_player_stats_cache(next_refresh_due)
WHERE next_refresh_due IS NOT NULL;

-- ============================================================================
-- 3. Enhanced update function for player stats with trend calculation
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
  -- Determine which player to update
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Get current season start (assume Aug 1 for college golf)
  v_season_start := make_date(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    END,
    8, 1
  );

  -- Count rounds this season
  SELECT COUNT(*), ARRAY_AGG(round_id ORDER BY created_at DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

  -- Calculate last 5 rounds average
  SELECT AVG(total_score)
  INTO v_last_5_avg
  FROM (
    SELECT total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id
    ORDER BY r.round_date DESC
    LIMIT 5
  ) last5;

  -- Calculate last 10 rounds average
  SELECT AVG(total_score)
  INTO v_last_10_avg
  FROM (
    SELECT total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id
    ORDER BY r.round_date DESC
    LIMIT 10
  ) last10;

  -- Calculate previous 5 rounds average (rounds 6-10)
  SELECT AVG(total_score)
  INTO v_prev_5_avg
  FROM (
    SELECT total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id
    ORDER BY r.round_date DESC
    LIMIT 5 OFFSET 5
  ) prev5;

  -- Calculate improvement trend
  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg; -- Lower is better in golf

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

  -- Update the cache with enhanced stats
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

COMMENT ON FUNCTION update_player_stats_cache_enhanced() IS
  'Enhanced trigger function that calculates trend stats after player cache is updated';

-- ============================================================================
-- 4. Create trigger for enhanced stats (runs AFTER main player stats trigger)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_update_player_stats_cache_enhanced ON golf_player_stats_cache;

CREATE TRIGGER trg_update_player_stats_cache_enhanced
  AFTER INSERT OR UPDATE
  ON golf_player_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_cache_enhanced();

COMMENT ON TRIGGER trg_update_player_stats_cache_enhanced ON golf_player_stats_cache IS
  'Calculates trend stats (last 5/10 average, improvement) after base stats are updated';

-- ============================================================================
-- 5. Function to mark stats as stale (called when data changes need recalc)
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_player_stats_stale(p_player_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE golf_player_stats_cache
  SET
    is_stale = TRUE,
    updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION mark_player_stats_stale(UUID) IS
  'Marks a players stats cache as stale, indicating a refresh is needed';

-- ============================================================================
-- 6. Backfill enhanced stats for existing cached players
-- ============================================================================

DO $$
DECLARE
  player_rec RECORD;
BEGIN
  -- Loop through all players with cached stats
  FOR player_rec IN
    SELECT DISTINCT player_id FROM golf_player_stats_cache
  LOOP
    -- The enhanced trigger will fire and calculate trend stats
    -- We trigger it by touching the updated_at
    UPDATE golf_player_stats_cache
    SET updated_at = NOW()
    WHERE player_id = player_rec.player_id;
  END LOOP;
END $$;

-- ============================================================================
-- 7. Helper function: Get player stats with freshness check
-- ============================================================================

CREATE OR REPLACE FUNCTION get_player_stats_summary(p_player_id UUID)
RETURNS TABLE (
  scoring_average NUMERIC,
  rounds_played INTEGER,
  best_round INTEGER,
  worst_round INTEGER,
  last_5_average NUMERIC,
  last_10_average NUMERIC,
  improvement_trend NUMERIC,
  trend_direction TEXT,
  gir_percentage NUMERIC,
  fairway_percentage NUMERIC,
  putts_per_round NUMERIC,
  scrambling_percentage NUMERIC,
  is_stale BOOLEAN,
  last_updated TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psc.scoring_average,
    psc.rounds_played,
    psc.best_round,
    psc.worst_round,
    psc.last_5_average,
    psc.last_10_average,
    psc.improvement_trend,
    psc.trend_direction,
    psc.gir_percentage,
    psc.driving_accuracy_percentage AS fairway_percentage,
    psc.putts_per_round,
    psc.scrambling_percentage,
    psc.is_stale,
    psc.updated_at AS last_updated
  FROM golf_player_stats_cache psc
  WHERE psc.player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION get_player_stats_summary(UUID) IS
  'Returns cached player stats summary for instant dashboard loads';

-- ============================================================================
-- 8. Documentation
-- ============================================================================

COMMENT ON COLUMN golf_player_stats_cache.last_5_average IS
  'Average score of last 5 completed rounds';

COMMENT ON COLUMN golf_player_stats_cache.last_10_average IS
  'Average score of last 10 completed rounds';

COMMENT ON COLUMN golf_player_stats_cache.improvement_trend IS
  'Score improvement trend: positive means improving (lower scores)';

COMMENT ON COLUMN golf_player_stats_cache.trend_direction IS
  'Quick indicator: improving, stable, or declining';

COMMENT ON COLUMN golf_player_stats_cache.is_stale IS
  'TRUE if cache needs recalculation (e.g., after round edit/delete)';

COMMENT ON COLUMN golf_player_stats_cache.round_ids_included IS
  'Array of round IDs included in the calculation for verification';
