-- Migration 047: Shot Re-sequencing System
-- Provides automatic re-numbering of shots when a shot is deleted from a hole
-- Ensures shot_number sequence remains contiguous (1, 2, 3...) after deletions

-- ============================================================================
-- 1. CREATE FUNCTION: Resequence shots after delete
-- ============================================================================

-- Function to renumber shots for a specific hole after a deletion
-- Example: If shots are 1,2,3,4 and shot 2 is deleted, this renumbers to 1,2,3
CREATE OR REPLACE FUNCTION resequence_golf_shots_after_delete()
RETURNS TRIGGER AS $$
DECLARE
  shot_record RECORD;
  new_number INTEGER := 1;
BEGIN
  -- Only resequence if we have the hole context
  IF OLD.hole_id IS NOT NULL THEN
    -- Update all remaining shots for this hole, ordered by their current shot_number
    FOR shot_record IN
      SELECT id
      FROM golf_shots
      WHERE hole_id = OLD.hole_id
      ORDER BY shot_number ASC
    LOOP
      UPDATE golf_shots
      SET shot_number = new_number,
          updated_at = NOW()
      WHERE id = shot_record.id
        AND shot_number != new_number; -- Only update if different (optimization)

      new_number := new_number + 1;
    END LOOP;
  ELSIF OLD.round_id IS NOT NULL AND OLD.hole_number IS NOT NULL THEN
    -- Fallback: Use round_id + hole_number if hole_id is not set
    FOR shot_record IN
      SELECT id
      FROM golf_shots
      WHERE round_id = OLD.round_id
        AND hole_number = OLD.hole_number
      ORDER BY shot_number ASC
    LOOP
      UPDATE golf_shots
      SET shot_number = new_number,
          updated_at = NOW()
      WHERE id = shot_record.id
        AND shot_number != new_number;

      new_number := new_number + 1;
    END LOOP;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resequence_golf_shots_after_delete() IS
  'Automatically renumbers remaining shots after a shot is deleted to maintain contiguous sequence';

-- ============================================================================
-- 2. CREATE TRIGGER: After delete on golf_shots
-- ============================================================================

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_resequence_shots_after_delete ON golf_shots;

-- Create the after delete trigger
CREATE TRIGGER trigger_resequence_shots_after_delete
  AFTER DELETE ON golf_shots
  FOR EACH ROW
  EXECUTE FUNCTION resequence_golf_shots_after_delete();

COMMENT ON TRIGGER trigger_resequence_shots_after_delete ON golf_shots IS
  'Maintains contiguous shot_number sequence when shots are deleted';

-- ============================================================================
-- 3. UTILITY FUNCTION: Manual resequencing (for data cleanup)
-- ============================================================================

-- Function to manually resequence all shots for a given hole
-- Useful for data migration or fixing corrupted sequences
CREATE OR REPLACE FUNCTION resequence_hole_shots(p_hole_id UUID)
RETURNS INTEGER AS $$
DECLARE
  shot_record RECORD;
  new_number INTEGER := 1;
  updated_count INTEGER := 0;
BEGIN
  FOR shot_record IN
    SELECT id
    FROM golf_shots
    WHERE hole_id = p_hole_id
    ORDER BY shot_number ASC, created_at ASC
  LOOP
    UPDATE golf_shots
    SET shot_number = new_number,
        updated_at = NOW()
    WHERE id = shot_record.id
      AND shot_number != new_number;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;

    new_number := new_number + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resequence_hole_shots(UUID) IS
  'Manually resequence all shots for a specific hole. Returns count of updated shots.';

-- Function to resequence shots using round_id and hole_number
CREATE OR REPLACE FUNCTION resequence_hole_shots_by_round(p_round_id UUID, p_hole_number INTEGER)
RETURNS INTEGER AS $$
DECLARE
  shot_record RECORD;
  new_number INTEGER := 1;
  updated_count INTEGER := 0;
BEGIN
  FOR shot_record IN
    SELECT id
    FROM golf_shots
    WHERE round_id = p_round_id
      AND hole_number = p_hole_number
    ORDER BY shot_number ASC, created_at ASC
  LOOP
    UPDATE golf_shots
    SET shot_number = new_number,
        updated_at = NOW()
    WHERE id = shot_record.id
      AND shot_number != new_number;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;

    new_number := new_number + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resequence_hole_shots_by_round(UUID, INTEGER) IS
  'Manually resequence all shots for a specific hole using round_id and hole_number. Returns count of updated shots.';

-- ============================================================================
-- 4. UTILITY FUNCTION: Resequence all shots in a round
-- ============================================================================

-- Function to resequence all shots in an entire round (all holes)
CREATE OR REPLACE FUNCTION resequence_round_shots(p_round_id UUID)
RETURNS INTEGER AS $$
DECLARE
  hole_record RECORD;
  total_updated INTEGER := 0;
  hole_updated INTEGER;
BEGIN
  -- Get all unique holes in this round
  FOR hole_record IN
    SELECT DISTINCT hole_id, hole_number
    FROM golf_shots
    WHERE round_id = p_round_id
    ORDER BY hole_number
  LOOP
    IF hole_record.hole_id IS NOT NULL THEN
      hole_updated := resequence_hole_shots(hole_record.hole_id);
    ELSE
      hole_updated := resequence_hole_shots_by_round(p_round_id, hole_record.hole_number);
    END IF;
    total_updated := total_updated + hole_updated;
  END LOOP;

  RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resequence_round_shots(UUID) IS
  'Resequence all shots in an entire round across all holes. Returns total count of updated shots.';
