-- Migration 066: Add missing distance columns to golf_shots
--
-- FIX: The application code has been trying to save distance_to_hole_before and
-- distance_to_hole_after columns to golf_shots, but these columns were never added
-- to the database schema. This migration adds them.
--
-- These columns are critical for:
-- - Approach efficiency calculations (strokes to hole out by distance)
-- - Proximity stats (how close approach shots land to the hole)
-- - Strokes gained calculations
-- - Putting stats (first putt distance)

-- ============================================================================
-- 1. Add distance_to_hole_before column
-- ============================================================================
-- Distance from ball to hole BEFORE the shot (in yards or feet, see distance_unit_before)
-- Example: 150 yards for an approach shot, 10 feet for a putt
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS distance_to_hole_before NUMERIC(7,2);

COMMENT ON COLUMN golf_shots.distance_to_hole_before IS
  'Distance from ball to hole before this shot. Units specified by distance_unit_before (yards or feet)';

-- ============================================================================
-- 2. Add distance_to_hole_after column
-- ============================================================================
-- Distance from ball to hole AFTER the shot (in yards or feet, see distance_unit_after)
-- Example: 15 feet after an approach shot lands on the green
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS distance_to_hole_after NUMERIC(7,2);

COMMENT ON COLUMN golf_shots.distance_to_hole_after IS
  'Distance from ball to hole after this shot. Units specified by distance_unit_after (yards or feet)';

-- ============================================================================
-- 3. Add shot_distance column (if not exists)
-- ============================================================================
-- The actual distance the ball traveled (always in yards)
-- Calculated from distance_to_hole_before - distance_to_hole_after (accounting for units)
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS shot_distance NUMERIC(7,2);

COMMENT ON COLUMN golf_shots.shot_distance IS
  'Distance the ball traveled on this shot, in yards';

-- ============================================================================
-- 4. Add lie_after column (if not exists)
-- ============================================================================
-- Derived from result: 'green' result -> 'green' lie, 'fairway' result -> 'fairway' lie, etc.
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS lie_after TEXT;

COMMENT ON COLUMN golf_shots.lie_after IS
  'Where the ball ended up (derived from result): tee, fairway, rough, sand, green, other';

-- ============================================================================
-- 5. Add is_penalty column (if not exists)
-- ============================================================================
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS is_penalty BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN golf_shots.is_penalty IS
  'Whether this shot was a penalty stroke';

-- ============================================================================
-- 6. Add penalty_type column (if not exists)
-- ============================================================================
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS penalty_type TEXT;

COMMENT ON COLUMN golf_shots.penalty_type IS
  'Type of penalty: ob, water, unplayable, lost';

-- ============================================================================
-- 7. Create indexes for common queries
-- ============================================================================
-- Index for approach efficiency queries (finding shots that land on green)
CREATE INDEX IF NOT EXISTS idx_golf_shots_result
ON golf_shots(result);

-- Index for shots with distance data (used in stats calculations)
CREATE INDEX IF NOT EXISTS idx_golf_shots_distance_before
ON golf_shots(distance_to_hole_before)
WHERE distance_to_hole_before IS NOT NULL;

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON TABLE golf_shots IS 'Shot-by-shot tracking for golf rounds. Each shot captures:
- Position before shot (distance_to_hole_before, lie_before, distance_unit_before)
- Club used (club_type)
- Result of shot (result, distance_to_hole_after, distance_unit_after)
- Derived metrics (shot_distance, lie_after)
- Putting details (putt_break, putt_slope, putt_distance_feet, putt_made)
- Penalty info (is_penalty, penalty_type)';
