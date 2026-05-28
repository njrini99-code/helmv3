-- 2026-05-28: unblock two production error storms surfaced by scheduled
-- error review (Sentry + Supabase Postgres logs).
--
-- 1) golf_team_coachhelm_settings.preferences (missing column):
--    src/lib/coachhelm/v3/foundation/generator-toggles.ts and
--    src/app/golf/actions/insights.ts (4 read/write sites) expect a
--    JSONB `preferences` column. The production table only has
--    {id, team_id, enabled, disabled_*, created_at, updated_at}.
--    Every cron pass hits 8+ "column ... does not exist" errors.
--    Default '{}'::jsonb so every toggle lookup falls through to the
--    "enabled" default that generator-toggles.ts:69-70 expects.
--
-- 2) golf_coach_insights_insight_type_check (constraint gaps):
--    Three insight_type values written by application code are not in
--    the constraint, so every INSERT throws:
--      - 'tee_strategy'        -> v3 TeeStrategyGenerator (23+ events / hr
--                                 first seen 2026-05-28; src/lib/coachhelm/
--                                 v3/generators/tee-strategy.ts:90).
--      - 'performance_alert'   -> alerts.ts:415.
--      - 'positive_highlight'  -> alerts.ts:469.
--    DROP + re-add the constraint with the union; preserves NOT NULL.

BEGIN;

-- (1) preferences column on team-level CoachHelm settings.
ALTER TABLE public.golf_team_coachhelm_settings
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.golf_team_coachhelm_settings.preferences IS
  'Per-team v3 generator toggles (e.g. {tee_strategy_enabled: false}). '
  'Generator-toggles.ts defaults missing keys to true; coaches opt OUT '
  'by setting a key to false. Schema-less by design — no ALTER TABLE on '
  'every new generator.';

-- (2) expand insight_type CHECK to cover values already emitted by code.
ALTER TABLE public.golf_coach_insights
  DROP CONSTRAINT IF EXISTS golf_coach_insights_insight_type_check;

ALTER TABLE public.golf_coach_insights
  ADD CONSTRAINT golf_coach_insights_insight_type_check
  CHECK (insight_type = ANY (ARRAY[
    'performance_decline',
    'performance_improvement',
    'pattern_detected',
    'practice_recommendation',
    'roster_alert',
    'qualifying_watch',
    'attendance_concern',
    'milestone_reached',
    'comparison_insight',
    'scoring_decline',
    'stat_regression',
    'tournament_pressure',
    'plateau',
    'bubble_player',
    'surge_player',
    'streak',
    'recurring_weakness',
    'closing_holes',
    'par_3_issues',
    'team_trend',
    'roster_recommendation',
    'putting',
    'tee',
    'approach',
    'short_game',
    'scoring',
    'pressure',
    'course_management',
    'approach_miss',
    'par_scoring',
    'pressure_gap',
    'putt_bias',
    'putt_distance',
    'scrambling',
    'warmup_hole',
    'composite',
    -- 2026-05-28 additions: in-use by application but missing from prior constraint.
    'tee_strategy',
    'performance_alert',
    'positive_highlight'
  ]));

COMMIT;
