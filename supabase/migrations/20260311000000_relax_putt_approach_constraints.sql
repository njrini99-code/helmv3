-- Relax CHECK constraints that are too strict and causing round submission failures
-- Fixes: putt_details_distance_feet_check (yards×3 can exceed 200)
--        approach_miss_details_lie_type_check (add 'recovery' back from original migration)

-- 1. Putt distance: raise cap from 200 to 500 (covers worst-case yards×3 conversion)
ALTER TABLE putt_details DROP CONSTRAINT IF EXISTS putt_details_distance_feet_check;
ALTER TABLE putt_details ADD CONSTRAINT putt_details_distance_feet_check
  CHECK (distance_feet >= 0 AND distance_feet <= 500);

-- 2. Approach lie_type: add 'recovery' (was in original migration, dropped accidentally)
ALTER TABLE approach_miss_details DROP CONSTRAINT IF EXISTS approach_miss_details_lie_type_check;
ALTER TABLE approach_miss_details ADD CONSTRAINT approach_miss_details_lie_type_check
  CHECK (lie_type IN ('fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard'));
