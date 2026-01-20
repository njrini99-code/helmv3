-- ============================================================================
-- Migration 065: Add putt and lie_after columns to golf_shots
-- Purpose: Support enhanced shot tracking with putt details and lie tracking
-- ============================================================================

-- ============================================================================
-- 1. Add putt detail columns to golf_shots
-- ============================================================================

-- Putt distance in feet (converted from yards if needed during entry)
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS putt_distance_feet NUMERIC(5,1);
COMMENT ON COLUMN golf_shots.putt_distance_feet IS 'Distance of putt in feet (for putting shots only)';

-- Whether the putt was made (holed)
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS putt_made BOOLEAN;
COMMENT ON COLUMN golf_shots.putt_made IS 'Whether the putt was holed (for putting shots only)';

-- ============================================================================
-- 2. Add lie_after column to track where ball ended up
-- ============================================================================

-- Lie after the shot (where the ball ended up)
ALTER TABLE golf_shots
ADD COLUMN IF NOT EXISTS lie_after TEXT;
COMMENT ON COLUMN golf_shots.lie_after IS 'Lie after shot: fairway, rough, sand, green, penalty, recovery';

-- Add check constraint for valid lie_after values
ALTER TABLE golf_shots
DROP CONSTRAINT IF EXISTS golf_shots_lie_after_check;

ALTER TABLE golf_shots
ADD CONSTRAINT golf_shots_lie_after_check
CHECK (lie_after IS NULL OR lie_after IN ('tee', 'fairway', 'rough', 'sand', 'green', 'penalty', 'recovery', 'other'));

-- ============================================================================
-- 3. Create indexes for efficient queries
-- ============================================================================

-- Index for putt analysis queries
CREATE INDEX IF NOT EXISTS idx_golf_shots_putt_made
ON golf_shots(putt_made) WHERE putt_made IS NOT NULL;

-- Index for shot result analysis by lie
CREATE INDEX IF NOT EXISTS idx_golf_shots_lie_after
ON golf_shots(lie_after) WHERE lie_after IS NOT NULL;

-- Composite index for putting stats queries
CREATE INDEX IF NOT EXISTS idx_golf_shots_putting_analysis
ON golf_shots(shot_type, putt_made, putt_distance_feet)
WHERE shot_type = 'putting';

-- ============================================================================
-- 4. Backfill putt_made from existing data where possible
-- ============================================================================

-- Set putt_made = true for putting shots that resulted in 'hole'
UPDATE golf_shots
SET putt_made = true
WHERE shot_type = 'putting'
  AND result = 'hole'
  AND putt_made IS NULL;

-- Set putt_made = false for putting shots that didn't result in 'hole'
UPDATE golf_shots
SET putt_made = false
WHERE shot_type = 'putting'
  AND result IS NOT NULL
  AND result != 'hole'
  AND putt_made IS NULL;

-- ============================================================================
-- 5. Backfill lie_after from result where possible
-- ============================================================================

-- Map result to lie_after for existing shots
UPDATE golf_shots
SET lie_after = CASE result
    WHEN 'fairway' THEN 'fairway'
    WHEN 'rough' THEN 'rough'
    WHEN 'sand' THEN 'sand'
    WHEN 'green' THEN 'green'
    WHEN 'hole' THEN 'green'
    WHEN 'penalty' THEN 'penalty'
    WHEN 'other' THEN 'recovery'
    ELSE NULL
  END
WHERE lie_after IS NULL AND result IS NOT NULL;
