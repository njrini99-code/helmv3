-- Add deep_rough and recovery to lie_before and lie_after CHECK constraints on golf_shots
-- These are needed for more accurate Strokes Gained calculations
-- deep_rough: lies in thick/deep rough with significantly higher expected strokes
-- recovery: trouble shots (trees, hazard edges, etc.) requiring punch-outs or creative escapes

-- Drop and recreate lie_before constraint
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_lie_before_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_lie_before_check
  CHECK (lie_before IS NULL OR lie_before IN ('tee', 'fairway', 'rough', 'deep_rough', 'sand', 'green', 'recovery', 'other'));

-- Drop and recreate lie_after constraint if it exists
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_lie_after_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_lie_after_check
  CHECK (lie_after IS NULL OR lie_after IN ('tee', 'fairway', 'rough', 'deep_rough', 'sand', 'green', 'recovery', 'other'));
