-- v3 Wave 9 part 2 — extend golf_coachhelm_settings: goal_assignment_default
--
-- Per-coach default for whether a goal the coach assigns to a player is
-- mandatory (player must accept) or suggested (player can accept/decline).
-- Powers the Part III locked decision: "Coach decides per-team whether
-- assigned goals are mandatory or suggested."
--
-- Read by:
--   - W19 goals/server actions when a coach creates a goal for a player
--     (this column is the default; coach can override per-goal in the UI)
--   - W19 GoalCreationModal as the pre-fill value
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='golf_coachhelm_settings'
--     AND column_name='goal_assignment_default';
--   -> [] (column does not exist; safe to add)
--
-- ROLLBACK:
--   ALTER TABLE public.golf_coachhelm_settings
--     DROP CONSTRAINT IF EXISTS golf_coachhelm_settings_goal_assignment_default_check,
--     DROP COLUMN IF EXISTS goal_assignment_default;

ALTER TABLE public.golf_coachhelm_settings
  ADD COLUMN IF NOT EXISTS goal_assignment_default text NOT NULL DEFAULT 'suggested';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coachhelm_settings_goal_assignment_default_check'
      AND conrelid = 'public.golf_coachhelm_settings'::regclass
  ) THEN
    ALTER TABLE public.golf_coachhelm_settings
      ADD CONSTRAINT golf_coachhelm_settings_goal_assignment_default_check
      CHECK (goal_assignment_default IN ('mandatory','suggested'));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_coachhelm_settings.goal_assignment_default IS
  'v3 goal-assignment default: ''mandatory'' (player must accept; forced active) or ''suggested'' (player chooses). Default ''suggested''. Overridable per-goal at creation.';
