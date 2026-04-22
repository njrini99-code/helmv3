-- 20260422100002_widen_insight_type_check_for_categories.sql
--
-- Patch: the legacy `golf_coach_insights_insight_type_check` constraint only
-- accepted historical insight_type values ('performance_decline', etc.). The
-- new evidence-backed generators (Tier-1 phase) backfill insight_type with
-- the new `category` value ('putting', 'tee', etc.) per `upsertInsight()`.
-- Without this widening, every Tier-1 insert raises 23514.
--
-- Backwards compatible: every legacy value is still allowed.

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
    -- New category-based values used by Tier-1 evidence-backed generators
    'putting','tee','approach','short_game','scoring','pressure','course_management'
  ]));
