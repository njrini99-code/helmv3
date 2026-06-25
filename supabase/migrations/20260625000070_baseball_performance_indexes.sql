-- =============================================================================
-- 20260625000070_baseball_performance_indexes.sql
--
-- Adds missing FK-covering indexes and unique constraints identified in the
-- performance + correctness audit.
--
-- Changes:
--   1. baseball_lift_session_exercises — index on exercise_id FK
--        (join path: sessions → session_exercises → exercise for weight-room
--         live loader and performance-command read model)
--
--   2. helm_lifting_session_exercises — index on exercise_id FK
--        (same join pattern on the Lifting Lab dashboard)
--
--   3. baseball_strength_maxes — unique constraint for idempotent upsert
--        (player_id, exercise_id, max_type, test_date) NOT VALID
--        Prevents duplicate max rows on concurrent set logging / retries.
--
--   4. baseball_practice_blocks — index on coach_owner_id FK
--        (practice planner staff-assignment read path filters by coach_owner_id)
--
-- ADDITIVE / idempotent (IF NOT EXISTS). NOT applied here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. baseball_lift_session_exercises — exercise_id FK index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS baseball_lift_session_exercises_exercise_idx
  ON public.baseball_lift_session_exercises (exercise_id)
  WHERE exercise_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. helm_lifting_session_exercises — exercise_id FK index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS helm_lifting_session_exercises_exercise_idx
  ON public.helm_lifting_session_exercises (exercise_id)
  WHERE exercise_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. baseball_strength_maxes — unique constraint for idempotent upsert
--    NOT VALID: skips existing-data validation (safe on a live shared DB where
--    the table may already have rows; VALIDATE CONSTRAINT can run offline later).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'uq_baseball_strength_max'
      AND conrelid   = 'public.baseball_strength_maxes'::regclass
  ) THEN
    ALTER TABLE public.baseball_strength_maxes
      ADD CONSTRAINT uq_baseball_strength_max
      UNIQUE (player_id, exercise_id, max_type, test_date) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT uq_baseball_strength_max ON public.baseball_strength_maxes IS
  'Prevents duplicate (player, exercise, max_type, test_date) rows, enabling '
  'INSERT ... ON CONFLICT DO UPDATE upsert semantics in logSetResult.';

-- -----------------------------------------------------------------------------
-- 4. baseball_practice_blocks — coach_owner_id FK index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bpb_coach_owner
  ON public.baseball_practice_blocks (coach_owner_id)
  WHERE coach_owner_id IS NOT NULL;

-- ============================================================================
-- END migration 20260625000070_baseball_performance_indexes.sql
-- ============================================================================
