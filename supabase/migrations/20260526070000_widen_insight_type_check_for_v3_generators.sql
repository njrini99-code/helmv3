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

ALTER TABLE public.golf_coach_insights
  DROP CONSTRAINT IF EXISTS golf_coach_insights_insight_type_check;

ALTER TABLE public.golf_coach_insights
  ADD CONSTRAINT golf_coach_insights_insight_type_check
  CHECK (insight_type = ANY (ARRAY[
    -- Legacy values (preserved for historical rows + any callers not yet migrated)
    'performance_decline','performance_improvement','pattern_detected',
    'practice_recommendation','roster_alert','qualifying_watch',
    'attendance_concern','milestone_reached','comparison_insight',
    'scoring_decline','stat_regression','tournament_pressure',
    'plateau','bubble_player','surge_player','streak',
    'recurring_weakness','closing_holes','par_3_issues',
    'team_trend','roster_recommendation',
    -- Category-level values from the 2026-04-22 widening
    'putting','tee','approach','short_game','scoring','pressure','course_management',
    -- V3 generator-specific values (W19+ evidence-backed engine)
    'approach_miss','par_scoring','pressure_gap','putt_bias',
    'putt_distance','scrambling','warmup_hole',
    -- W28 composite synthesis runner
    'composite'
  ]));
