-- ============================================================================
-- Migration: 20260203000000_strokes_gained_persistence.sql
-- Purpose: Add comprehensive strokes gained calculation functions with PGA Tour baselines
--
-- This migration adds:
-- 1. Strokes gained columns to golf_rounds table (if not exist)
-- 2. get_expected_strokes function with PGA Tour baseline data
-- 3. calculate_round_strokes_gained function for per-round SG calculation
-- 4. Trigger to auto-calculate SG when round status changes to 'completed'
-- 5. Function to update player stats cache with aggregated SG
-- ============================================================================

-- ============================================================================
-- 1. ADD STROKES GAINED COLUMNS TO GOLF_ROUNDS TABLE
-- ============================================================================

ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS strokes_gained_total NUMERIC(5,2);
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS strokes_gained_tee NUMERIC(5,2);
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS strokes_gained_approach NUMERIC(5,2);
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS strokes_gained_around_green NUMERIC(5,2);
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS strokes_gained_putting NUMERIC(5,2);

COMMENT ON COLUMN golf_rounds.strokes_gained_total IS 'Total strokes gained vs PGA Tour average for the round';
COMMENT ON COLUMN golf_rounds.strokes_gained_tee IS 'Strokes gained off the tee (tee shots on par 4s and 5s)';
COMMENT ON COLUMN golf_rounds.strokes_gained_approach IS 'Strokes gained on approach shots (shots into the green)';
COMMENT ON COLUMN golf_rounds.strokes_gained_around_green IS 'Strokes gained around the green (chips, pitches, bunker shots)';
COMMENT ON COLUMN golf_rounds.strokes_gained_putting IS 'Strokes gained putting (all putts on the green)';

-- ============================================================================
-- 2. GET_EXPECTED_STROKES FUNCTION
-- Returns the expected number of strokes to hole out from a given position
-- Based on PGA Tour strokes gained baseline data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_expected_strokes(
  p_lie TEXT,           -- 'tee', 'fairway', 'rough', 'sand', 'green', 'recovery'
  p_distance NUMERIC,   -- Distance in yards (or feet for putting)
  p_is_putting BOOLEAN DEFAULT FALSE
)
RETURNS NUMERIC(5,3)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_expected NUMERIC(5,3);
BEGIN
  -- =========================================================================
  -- GREEN (PUTTING) - Distance in feet
  -- PGA Tour putting expected strokes by distance
  -- =========================================================================
  IF p_is_putting OR p_lie = 'green' THEN
    -- Convert yards to feet if needed (assume distance > 50 means yards input error)
    IF p_distance > 50 THEN
      p_distance := p_distance * 3; -- Assume they passed yards, convert to feet
    END IF;

    v_expected := CASE
      -- Inside 2 feet - nearly automatic
      WHEN p_distance <= 2 THEN 1.001
      -- 2-3 feet
      WHEN p_distance <= 3 THEN 1.04
      -- 3-4 feet
      WHEN p_distance <= 4 THEN 1.13
      -- 4-5 feet
      WHEN p_distance <= 5 THEN 1.23
      -- 5-6 feet
      WHEN p_distance <= 6 THEN 1.34
      -- 6-7 feet
      WHEN p_distance <= 7 THEN 1.43
      -- 7-8 feet
      WHEN p_distance <= 8 THEN 1.50
      -- 8-9 feet
      WHEN p_distance <= 9 THEN 1.56
      -- 9-10 feet
      WHEN p_distance <= 10 THEN 1.61
      -- 10-12 feet
      WHEN p_distance <= 12 THEN 1.68
      -- 12-15 feet
      WHEN p_distance <= 15 THEN 1.78
      -- 15-20 feet
      WHEN p_distance <= 20 THEN 1.87
      -- 20-25 feet
      WHEN p_distance <= 25 THEN 1.94
      -- 25-30 feet
      WHEN p_distance <= 30 THEN 1.98
      -- 30-40 feet
      WHEN p_distance <= 40 THEN 2.04
      -- 40-50 feet
      WHEN p_distance <= 50 THEN 2.10
      -- 50-60 feet
      WHEN p_distance <= 60 THEN 2.16
      -- 60+ feet
      ELSE 2.22
    END;

    RETURN v_expected;
  END IF;

  -- =========================================================================
  -- TEE / FAIRWAY - Distance in yards
  -- PGA Tour expected strokes from tee/fairway
  -- =========================================================================
  IF p_lie IN ('tee', 'fairway') THEN
    v_expected := CASE
      -- Inside 100 yards
      WHEN p_distance <= 100 THEN 2.60
      -- 100-125 yards
      WHEN p_distance <= 125 THEN 2.72
      -- 125-150 yards
      WHEN p_distance <= 150 THEN 2.82
      -- 150-175 yards
      WHEN p_distance <= 175 THEN 2.91
      -- 175-200 yards
      WHEN p_distance <= 200 THEN 3.00
      -- 200-225 yards
      WHEN p_distance <= 225 THEN 3.08
      -- 225-250 yards
      WHEN p_distance <= 250 THEN 3.17
      -- 250-275 yards
      WHEN p_distance <= 275 THEN 3.26
      -- 275-300 yards
      WHEN p_distance <= 300 THEN 3.36
      -- 300-325 yards
      WHEN p_distance <= 325 THEN 3.47
      -- 325-350 yards
      WHEN p_distance <= 350 THEN 3.58
      -- 350-375 yards
      WHEN p_distance <= 375 THEN 3.70
      -- 375-400 yards
      WHEN p_distance <= 400 THEN 3.82
      -- 400-425 yards
      WHEN p_distance <= 425 THEN 3.95
      -- 425-450 yards
      WHEN p_distance <= 450 THEN 4.08
      -- 450-475 yards
      WHEN p_distance <= 475 THEN 4.22
      -- 475-500 yards
      WHEN p_distance <= 500 THEN 4.35
      -- 500-525 yards
      WHEN p_distance <= 525 THEN 4.49
      -- 525-550 yards
      WHEN p_distance <= 550 THEN 4.63
      -- 550+ yards
      ELSE 4.80
    END;

    RETURN v_expected;
  END IF;

  -- =========================================================================
  -- ROUGH - Distance in yards
  -- PGA Tour expected strokes from rough (slightly higher than fairway)
  -- =========================================================================
  IF p_lie = 'rough' THEN
    v_expected := CASE
      -- Inside 100 yards
      WHEN p_distance <= 100 THEN 2.75
      -- 100-125 yards
      WHEN p_distance <= 125 THEN 2.90
      -- 125-150 yards
      WHEN p_distance <= 150 THEN 3.05
      -- 150-175 yards
      WHEN p_distance <= 175 THEN 3.18
      -- 175-200 yards
      WHEN p_distance <= 200 THEN 3.32
      -- 200-225 yards
      WHEN p_distance <= 225 THEN 3.47
      -- 225+ yards (recovery territory)
      ELSE 3.65
    END;

    RETURN v_expected;
  END IF;

  -- =========================================================================
  -- SAND / BUNKER - Distance in yards
  -- PGA Tour expected strokes from sand
  -- =========================================================================
  IF p_lie IN ('sand', 'bunker') THEN
    v_expected := CASE
      -- Greenside bunker (< 30 yards)
      WHEN p_distance <= 20 THEN 2.43
      -- 20-30 yards
      WHEN p_distance <= 30 THEN 2.58
      -- 30-40 yards
      WHEN p_distance <= 40 THEN 2.78
      -- 40-50 yards
      WHEN p_distance <= 50 THEN 2.95
      -- Fairway bunker (50+ yards)
      WHEN p_distance <= 75 THEN 3.15
      WHEN p_distance <= 100 THEN 3.35
      WHEN p_distance <= 125 THEN 3.55
      WHEN p_distance <= 150 THEN 3.75
      -- Long fairway bunker shots
      ELSE 4.00
    END;

    RETURN v_expected;
  END IF;

  -- =========================================================================
  -- RECOVERY / HAZARD / OTHER
  -- Penalized lies with limited shot options
  -- =========================================================================
  IF p_lie IN ('recovery', 'hazard', 'other', 'penalty') THEN
    -- Flat 4.0 baseline for recovery situations
    -- These situations are highly variable, so we use a conservative estimate
    RETURN 4.00;
  END IF;

  -- Default fallback - use rough-like estimate
  RETURN 3.50;
END;
$$;

COMMENT ON FUNCTION get_expected_strokes(TEXT, NUMERIC, BOOLEAN) IS
  'Returns PGA Tour expected strokes to hole out from a given lie and distance.
   Putting distances in feet, all other lies in yards.';

-- ============================================================================
-- 3. CALCULATE_ROUND_STROKES_GAINED FUNCTION
-- Calculates all strokes gained categories for a specific round
-- Returns: sg_total, sg_tee, sg_approach, sg_around_green, sg_putting
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_round_strokes_gained(p_round_id UUID)
RETURNS TABLE (
  sg_total NUMERIC(5,2),
  sg_tee NUMERIC(5,2),
  sg_approach NUMERIC(5,2),
  sg_around_green NUMERIC(5,2),
  sg_putting NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shot RECORD;
  v_expected_before NUMERIC(5,3);
  v_expected_after NUMERIC(5,3);
  v_shot_sg NUMERIC(5,3);
  v_distance_before NUMERIC;
  v_distance_after NUMERIC;
  v_lie_before TEXT;
  v_lie_after TEXT;
  v_is_putting BOOLEAN;
  v_shot_type TEXT;

  -- Accumulators for each category
  v_sg_total NUMERIC(5,2) := 0;
  v_sg_tee NUMERIC(5,2) := 0;
  v_sg_approach NUMERIC(5,2) := 0;
  v_sg_around_green NUMERIC(5,2) := 0;
  v_sg_putting NUMERIC(5,2) := 0;

  v_shot_count INTEGER := 0;
BEGIN
  -- Loop through all shots for the round
  FOR v_shot IN
    SELECT
      s.id,
      s.shot_number,
      s.shot_type,
      s.lie_before,
      COALESCE(s.lie_after, s.result) AS lie_after,
      s.distance_to_hole_before,
      s.distance_to_hole_after,
      s.distance_unit_before,
      s.distance_unit_after,
      s.result,
      s.is_penalty,
      h.hole_number,
      h.par
    FROM golf_shots s
    JOIN golf_holes h ON h.id = s.hole_id
    WHERE h.round_id = p_round_id
      AND s.is_penalty IS NOT TRUE  -- Skip penalty strokes from SG calculation
    ORDER BY h.hole_number, s.shot_number
  LOOP
    v_shot_count := v_shot_count + 1;

    -- Skip if we don't have distance data
    IF v_shot.distance_to_hole_before IS NULL THEN
      CONTINUE;
    END IF;

    -- Determine lie and normalize distances
    v_lie_before := COALESCE(v_shot.lie_before, 'fairway');
    v_lie_after := COALESCE(v_shot.lie_after, v_shot.result, 'fairway');

    -- Determine if this is a putt
    v_is_putting := v_lie_before = 'green' OR v_shot.shot_type = 'putting';

    -- Normalize distance before (convert to yards for non-putting, feet for putting)
    v_distance_before := v_shot.distance_to_hole_before;
    IF v_is_putting THEN
      -- Putting: ensure we're in feet
      IF v_shot.distance_unit_before = 'yards' THEN
        v_distance_before := v_distance_before * 3;
      END IF;
    ELSE
      -- Non-putting: ensure we're in yards
      IF v_shot.distance_unit_before = 'feet' THEN
        v_distance_before := v_distance_before / 3;
      END IF;
    END IF;

    -- Calculate expected strokes BEFORE the shot
    v_expected_before := get_expected_strokes(v_lie_before, v_distance_before, v_is_putting);

    -- Calculate expected strokes AFTER the shot
    IF v_shot.result = 'hole' OR v_shot.distance_to_hole_after = 0 THEN
      -- Ball is in the hole
      v_expected_after := 0;
    ELSIF v_shot.distance_to_hole_after IS NOT NULL THEN
      -- Ball is still in play
      v_distance_after := v_shot.distance_to_hole_after;

      -- Determine if next shot will be a putt
      IF v_lie_after = 'green' THEN
        -- Convert to feet if needed
        IF v_shot.distance_unit_after = 'yards' THEN
          v_distance_after := v_distance_after * 3;
        END IF;
        v_expected_after := get_expected_strokes('green', v_distance_after, TRUE);
      ELSE
        -- Convert to yards if needed
        IF v_shot.distance_unit_after = 'feet' THEN
          v_distance_after := v_distance_after / 3;
        END IF;
        v_expected_after := get_expected_strokes(v_lie_after, v_distance_after, FALSE);
      END IF;
    ELSE
      -- No after distance, skip this shot
      CONTINUE;
    END IF;

    -- Calculate strokes gained for this shot
    -- SG = Expected Before - (1 + Expected After)
    -- Positive = gained strokes vs tour average
    -- Negative = lost strokes vs tour average
    v_shot_sg := v_expected_before - (1 + v_expected_after);

    -- Categorize the shot and accumulate
    v_shot_type := COALESCE(v_shot.shot_type,
      CASE
        WHEN v_lie_before = 'green' THEN 'putting'
        WHEN v_lie_before = 'tee' THEN 'tee'
        WHEN v_distance_before <= 50 THEN 'around_green'  -- Within 50 yards
        ELSE 'approach'
      END
    );

    CASE v_shot_type
      WHEN 'tee' THEN
        v_sg_tee := v_sg_tee + v_shot_sg;
      WHEN 'approach' THEN
        v_sg_approach := v_sg_approach + v_shot_sg;
      WHEN 'around_green' THEN
        v_sg_around_green := v_sg_around_green + v_shot_sg;
      WHEN 'putting' THEN
        v_sg_putting := v_sg_putting + v_shot_sg;
      ELSE
        -- Default to approach for uncategorized
        v_sg_approach := v_sg_approach + v_shot_sg;
    END CASE;

    v_sg_total := v_sg_total + v_shot_sg;
  END LOOP;

  -- Round to 2 decimal places
  sg_total := ROUND(v_sg_total, 2);
  sg_tee := ROUND(v_sg_tee, 2);
  sg_approach := ROUND(v_sg_approach, 2);
  sg_around_green := ROUND(v_sg_around_green, 2);
  sg_putting := ROUND(v_sg_putting, 2);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION calculate_round_strokes_gained(UUID) IS
  'Calculates strokes gained for a round by iterating through all shots.
   Returns sg_total, sg_tee, sg_approach, sg_around_green, sg_putting.
   Uses PGA Tour baselines from get_expected_strokes().';

-- ============================================================================
-- 4. TRIGGER FUNCTION TO AUTO-CALCULATE SG ON ROUND COMPLETION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_strokes_gained_on_round_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sg_result RECORD;
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Calculate strokes gained for this round
    SELECT * INTO v_sg_result FROM calculate_round_strokes_gained(NEW.id);

    -- Update the round with SG values
    NEW.strokes_gained_total := v_sg_result.sg_total;
    NEW.strokes_gained_tee := v_sg_result.sg_tee;
    NEW.strokes_gained_approach := v_sg_result.sg_approach;
    NEW.strokes_gained_around_green := v_sg_result.sg_around_green;
    NEW.strokes_gained_putting := v_sg_result.sg_putting;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION calculate_strokes_gained_on_round_complete() IS
  'Trigger function that calculates strokes gained when a round status changes to completed';

-- Create the trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS trg_calculate_strokes_gained ON golf_rounds;

CREATE TRIGGER trg_calculate_strokes_gained
  BEFORE UPDATE OF status ON golf_rounds
  FOR EACH ROW
  EXECUTE FUNCTION calculate_strokes_gained_on_round_complete();

COMMENT ON TRIGGER trg_calculate_strokes_gained ON golf_rounds IS
  'Automatically calculates strokes gained when round status changes to completed';

-- ============================================================================
-- 5. UPDATE PLAYER STATS CACHE WITH AGGREGATED SG
-- Enhance the existing player stats trigger to include SG calculations
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_strokes_gained()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_sg_totals RECORD;
BEGIN
  -- Determine which player to update
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Calculate aggregate strokes gained from all completed rounds
  SELECT
    AVG(strokes_gained_total) AS sg_total_avg,
    AVG(strokes_gained_tee) AS sg_tee_avg,
    AVG(strokes_gained_approach) AS sg_approach_avg,
    AVG(strokes_gained_around_green) AS sg_around_green_avg,
    AVG(strokes_gained_putting) AS sg_putting_avg,
    SUM(strokes_gained_total) AS sg_total_sum,
    SUM(strokes_gained_tee) AS sg_tee_sum,
    SUM(strokes_gained_approach) AS sg_approach_sum,
    SUM(strokes_gained_around_green) AS sg_around_green_sum,
    SUM(strokes_gained_putting) AS sg_putting_sum
  INTO v_sg_totals
  FROM golf_rounds
  WHERE player_id = v_player_id
    AND status = 'completed'
    AND strokes_gained_total IS NOT NULL;

  -- Update player stats cache with strokes gained data
  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total = v_sg_totals.sg_total_sum,
    strokes_gained_tee = v_sg_totals.sg_tee_sum,
    strokes_gained_approach = v_sg_totals.sg_approach_sum,
    strokes_gained_around_green = v_sg_totals.sg_around_green_sum,
    strokes_gained_putting = v_sg_totals.sg_putting_sum,
    sg_total_per_round = ROUND(v_sg_totals.sg_total_avg, 2),
    sg_tee_per_round = ROUND(v_sg_totals.sg_tee_avg, 2),
    sg_approach_per_round = ROUND(v_sg_totals.sg_approach_avg, 2),
    sg_around_green_per_round = ROUND(v_sg_totals.sg_around_green_avg, 2),
    sg_putting_per_round = ROUND(v_sg_totals.sg_putting_avg, 2),
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION update_player_stats_strokes_gained() IS
  'Updates player stats cache with aggregated strokes gained data from completed rounds';

-- Create trigger on golf_round_stats_cache to cascade SG updates to player stats
DROP TRIGGER IF EXISTS trg_update_player_strokes_gained ON golf_round_stats_cache;

CREATE TRIGGER trg_update_player_strokes_gained
  AFTER INSERT OR UPDATE OR DELETE ON golf_round_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_strokes_gained();

COMMENT ON TRIGGER trg_update_player_strokes_gained ON golf_round_stats_cache IS
  'Cascades strokes gained updates to player stats cache when round stats change';

-- ============================================================================
-- 6. UPDATE ROUND STATS CACHE TO INCLUDE SG
-- Modify the existing round stats cache trigger to include SG columns
-- ============================================================================

-- Enhance update_round_stats_cache to copy SG from golf_rounds
CREATE OR REPLACE FUNCTION update_round_stats_cache_with_sg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process completed rounds
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Update the round stats cache with strokes gained values
  UPDATE golf_round_stats_cache
  SET
    strokes_gained_total = NEW.strokes_gained_total,
    strokes_gained_tee = NEW.strokes_gained_tee,
    strokes_gained_approach = NEW.strokes_gained_approach,
    strokes_gained_around_green = NEW.strokes_gained_around_green,
    strokes_gained_putting = NEW.strokes_gained_putting,
    updated_at = NOW()
  WHERE round_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_round_stats_cache_with_sg() IS
  'Copies strokes gained values from golf_rounds to golf_round_stats_cache';

-- Create trigger to sync SG to round stats cache
DROP TRIGGER IF EXISTS trg_sync_round_sg_to_cache ON golf_rounds;

CREATE TRIGGER trg_sync_round_sg_to_cache
  AFTER UPDATE OF strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting
  ON golf_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_round_stats_cache_with_sg();

COMMENT ON TRIGGER trg_sync_round_sg_to_cache ON golf_rounds IS
  'Syncs strokes gained values to round stats cache after they are calculated';

-- ============================================================================
-- 7. HELPER FUNCTION: Recalculate SG for a specific round
-- Useful for admin/debugging or when shots are edited after completion
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_round_strokes_gained(p_round_id UUID)
RETURNS TABLE (
  sg_total NUMERIC(5,2),
  sg_tee NUMERIC(5,2),
  sg_approach NUMERIC(5,2),
  sg_around_green NUMERIC(5,2),
  sg_putting NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sg_result RECORD;
BEGIN
  -- Calculate strokes gained
  SELECT * INTO v_sg_result FROM calculate_round_strokes_gained(p_round_id);

  -- Update the golf_rounds table
  UPDATE golf_rounds
  SET
    strokes_gained_total = v_sg_result.sg_total,
    strokes_gained_tee = v_sg_result.sg_tee,
    strokes_gained_approach = v_sg_result.sg_approach,
    strokes_gained_around_green = v_sg_result.sg_around_green,
    strokes_gained_putting = v_sg_result.sg_putting,
    updated_at = NOW()
  WHERE id = p_round_id;

  -- Return the calculated values
  sg_total := v_sg_result.sg_total;
  sg_tee := v_sg_result.sg_tee;
  sg_approach := v_sg_result.sg_approach;
  sg_around_green := v_sg_result.sg_around_green;
  sg_putting := v_sg_result.sg_putting;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION recalculate_round_strokes_gained(UUID) IS
  'Recalculates strokes gained for a specific round and updates the database.
   Use when shots have been edited after round completion.';

-- ============================================================================
-- 8. HELPER FUNCTION: Recalculate SG for all rounds of a player
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_player_strokes_gained(p_player_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Loop through all completed rounds for the player
  FOR v_round_id IN
    SELECT id
    FROM golf_rounds
    WHERE player_id = p_player_id
      AND status = 'completed'
    ORDER BY round_date
  LOOP
    -- Recalculate SG for each round
    PERFORM recalculate_round_strokes_gained(v_round_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION recalculate_player_strokes_gained(UUID) IS
  'Recalculates strokes gained for all completed rounds of a player.
   Returns the number of rounds processed.';

-- ============================================================================
-- 9. BACKFILL: Calculate SG for existing completed rounds with shot data
-- ============================================================================

DO $$
DECLARE
  v_round_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Only process completed rounds that have shots but no SG calculated
  FOR v_round_id IN
    SELECT DISTINCT r.id
    FROM golf_rounds r
    INNER JOIN golf_holes h ON h.round_id = r.id
    INNER JOIN golf_shots s ON s.hole_id = h.id
    WHERE r.status = 'completed'
      AND r.strokes_gained_total IS NULL
      AND s.distance_to_hole_before IS NOT NULL
    LIMIT 100  -- Process in batches to avoid timeout
  LOOP
    PERFORM recalculate_round_strokes_gained(v_round_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled strokes gained for % rounds', v_count;
END $$;

-- ============================================================================
-- 10. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for efficient SG queries by player
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_sg
ON golf_rounds(player_id, strokes_gained_total)
WHERE strokes_gained_total IS NOT NULL;

-- Index for finding rounds needing SG calculation
CREATE INDEX IF NOT EXISTS idx_golf_rounds_needs_sg
ON golf_rounds(status)
WHERE status = 'completed' AND strokes_gained_total IS NULL;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE golf_rounds IS 'Golf rounds with strokes gained analytics.
SG columns are auto-calculated when status changes to completed.
Strokes gained uses PGA Tour baselines:
- SG Total: Overall performance vs tour average
- SG Tee: Tee shots on par 4s and 5s
- SG Approach: Approach shots to the green
- SG Around Green: Chips, pitches, bunker shots within 50 yards
- SG Putting: All putts on the green';
