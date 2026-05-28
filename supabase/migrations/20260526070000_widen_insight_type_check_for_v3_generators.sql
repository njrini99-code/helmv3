-- 20260526070000_widen_insight_type_check_for_v3_generators.sql
--
-- Follow-up to 20260422100002_widen_insight_type_check_for_categories.
--
-- The v3 evidence-backed generators (W19+) write their per-generator
-- `insightType` string (e.g. 'putt_distance', 'par_scoring', 'warmup_hole')
-- when `upsert.ts:314` resolves `input.insight_type ?? input.category`.
-- The previous widening only allowed category-level strings ('putting',
-- 'scoring', etc.), so every v3 generator insert raised 23514 and the
-- generators silently failed. Sentry observed:
--   - PuttDistanceGenerator: 137 events
--   - ParTypeGenerator:      136 events
--   - WarmupHoleGenerator:    46 events
--   - ScramblingGenerator:    46 events
--   - PressureGapGenerator:   45 events
-- in the last hour alone on /golf/dashboard/coachhelm.
--
-- This migration adds the eight v3 generator/composite values to the
-- check list. Backwards compatible: every previously allowed value is
-- preserved.

-- Replay note 2026-05-28:
-- This migration originally patched production BEFORE the stripped production
-- baseline was committed as 20260527000000_prod_public_baseline.sql. It runs an
-- unguarded `ALTER TABLE public.golf_coach_insights`, but in a fresh local replay
-- that table does not exist until the baseline runs (20260527000000), which sorts
-- AFTER this file — so a clean replay (CI's local Supabase stack) failed here with
-- "relation public.golf_coach_insights does not exist" before the baseline could
-- run. (Sibling 20260526180000 had the same problem and was already neutralized.)
--
-- The widening is now fully owned by later, replay-safe migrations:
--   * 20260527000000_prod_public_baseline.sql creates golf_coach_insights WITH the
--     insight_type check through 'composite'.
--   * 20260528041553_fix_coachhelm_settings_preferences_and_insight_types.sql
--     extends it to the current production set ('tee_strategy',
--     'performance_alert', 'positive_highlight').
--
-- This file is therefore superseded and neutralized to a no-op so the migration
-- history replays cleanly. Production already has this migration applied (tracked
-- by version 20260526070000); changing its body does not re-run it there.

DO $$
BEGIN
  RAISE NOTICE
    'Skipping superseded pre-baseline insight_type widening; the baseline (20260527000000) and 20260528041553 establish the current constraint.';
END $$;
