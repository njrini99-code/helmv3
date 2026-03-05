-- Bug #58: Add yardage column to golf_holes so per-round yardage is not silently discarded
-- The golf_course_holes table stores the default yardage for a course, but individual
-- rounds may use different tees or temporary setups. This column captures the actual
-- yardage played for each hole in each round.

ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS yardage integer;

COMMENT ON COLUMN golf_holes.yardage IS 'Actual yardage played for this hole in this round (may differ from course default)';
