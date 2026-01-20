-- Migration: Fix around_green shots with incorrect lie_before='green'
--
-- Problem: Seed data has around_green shots with lie_before='green' which is
-- logically impossible. A chip/pitch shot can't be from the green.
--
-- Solution: Update lie_before to match the previous shot's result on the same hole.
-- If previous shot result was 'rough', 'sand', 'fairway', etc., use that.
-- Fall back to 'rough' as default if no previous shot found.

-- First, let's update around_green shots by looking at the previous shot's result
WITH previous_shot_results AS (
  SELECT
    atg.id AS atg_shot_id,
    prev.result AS prev_result
  FROM golf_shots atg
  INNER JOIN golf_shots prev ON
    prev.round_id = atg.round_id
    AND prev.hole_number = atg.hole_number
    AND prev.shot_number = atg.shot_number - 1
  WHERE
    atg.shot_type = 'around_green'
    AND atg.lie_before = 'green'
    AND prev.result IN ('rough', 'sand', 'fairway', 'other')
)
UPDATE golf_shots
SET lie_before = previous_shot_results.prev_result
FROM previous_shot_results
WHERE golf_shots.id = previous_shot_results.atg_shot_id;

-- For any remaining around_green shots with lie_before='green' that couldn't be
-- fixed (no valid previous shot), default to 'rough' as it's the most common miss
UPDATE golf_shots
SET lie_before = 'rough'
WHERE shot_type = 'around_green'
  AND lie_before = 'green';

-- Add a comment explaining what was fixed
COMMENT ON TABLE golf_shots IS 'Golf shot data. Migration 065 fixed around_green shots that had incorrect lie_before=green values.';
