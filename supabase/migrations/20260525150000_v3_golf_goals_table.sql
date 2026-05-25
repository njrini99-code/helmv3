-- v3 Wave 18 — golf_goals table + RLS
--
-- The Goals primitive that replaces v2 focus_areas + arcs + drill compliance
-- per master plan Part III locked decisions + Part VI.1 schema spec.
--
-- One row per player goal. Owned by the player (player_id) with an
-- optional team scope (team_id) and an optional coach who assigned it
-- (coach_id_if_assigned). State machine: active / paused / achieved /
-- missed / partial / abandoned / pending_baseline.
--
-- Locked rules baked into this schema:
--   - Window: 7-365 days (CHECK on window_days generated column).
--   - Creator: player OR coach (CHECK on creator_role).
--   - Coach assignment mode: mandatory or suggested (per-team default
--     comes from golf_coachhelm_settings.goal_assignment_default added W9-pt2).
--   - Player share-with-coach default OFF (BOOLEAN DEFAULT false).
--   - Soft-cap-at-5 enforced at application layer, not schema (UI warns
--     but doesn't block).
--
-- RLS (per master plan Part VI.1 + docs/v3-rls-template.md Pattern 1):
--   - Player can do anything to their own rows.
--   - Coach can SELECT goals on their team where coach assigned OR
--     player shared.
--   - Coach can INSERT only as themselves on their own team.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT to_regclass('public.golf_goals')::text;
--   -> null (safe to create)
--
--   FK targets all exist: golf_players (existing), golf_teams (existing),
--   users (existing), golf_coaches (existing), golf_metrics (W9-pt2),
--   golf_coach_insights (existing).
--
--   RLS helpers (current_player_id, is_team_coach, current_coach_id)
--   shipped in W9-pt2 and verified live in prod (helper_count=5).
--
-- W19 ships the suggestions table + UI; W20 migrates focus_areas → goals.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_goals;
--   (Safe pre-W19. After W19's foreign keys land, would need CASCADE
--   or the dependent tables dropped first.)

CREATE TABLE IF NOT EXISTS public.golf_goals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  team_id               uuid REFERENCES public.golf_teams(id) ON DELETE SET NULL,

  created_by_user_id    uuid NOT NULL REFERENCES public.users(id),
  creator_role          text NOT NULL,
  coach_id_if_assigned  uuid REFERENCES public.golf_coaches(id),

  metric_id             text NOT NULL REFERENCES public.golf_metrics(metric_id),
  title                 text NOT NULL,
  category              text NOT NULL,

  started_at            timestamptz NOT NULL DEFAULT now(),
  ends_at               timestamptz NOT NULL,
  window_days           int GENERATED ALWAYS AS (
                          EXTRACT(DAY FROM (ends_at - started_at))::int
                        ) STORED,

  baseline_value        numeric,
  current_value         numeric,
  target_value          numeric,
  target_source         text,

  state                 text NOT NULL DEFAULT 'active',
  outcome_evaluated_at  timestamptz,

  shared_with_coach     boolean NOT NULL DEFAULT false,
  shared_at             timestamptz,

  coach_assignment_mode text,
  player_accepted_at    timestamptz,
  player_declined_at    timestamptz,
  player_decline_reason text,
  transfer_reason       text,

  origin                text NOT NULL DEFAULT 'manual',
  origin_insight_id     uuid REFERENCES public.golf_coach_insights(id),

  snapshots             jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT golf_goals_creator_role_check
    CHECK (creator_role IN ('player','coach')),
  CONSTRAINT golf_goals_target_source_check
    CHECK (target_source IS NULL OR target_source IN ('manual','team_avg','pga_value','midpoint')),
  CONSTRAINT golf_goals_state_check
    CHECK (state IN ('active','paused','achieved','missed','partial','abandoned','pending_baseline')),
  CONSTRAINT golf_goals_coach_assignment_mode_check
    CHECK (coach_assignment_mode IS NULL OR coach_assignment_mode IN ('mandatory','suggested')),
  CONSTRAINT golf_goals_origin_check
    CHECK (origin IN ('manual','engine_suggested','from_insight')),
  CONSTRAINT golf_goals_ends_after_started
    CHECK (ends_at > started_at),
  CONSTRAINT golf_goals_window_range
    CHECK (window_days BETWEEN 7 AND 365)
);

COMMENT ON TABLE public.golf_goals IS
  'v3 Goals primitive (W18). Replaces v2 golf_player_focus_areas + arcs + drill compliance per master plan Part III locked decisions. State machine: active / paused / achieved / missed / partial / abandoned / pending_baseline. Soft cap of 5 active goals per player enforced at app layer (UI warns, schema does not block).';

COMMENT ON COLUMN public.golf_goals.window_days IS
  'Generated column = days between started_at and ends_at. CHECK constraint enforces 7-365 range per locked decision.';

COMMENT ON COLUMN public.golf_goals.shared_with_coach IS
  'Player-set sharing toggle. DEFAULT false per master plan locked decision — coach sees only assigned goals OR explicitly shared player goals.';

COMMENT ON COLUMN public.golf_goals.coach_assignment_mode IS
  'When creator_role=coach: ''mandatory'' (forced active for player) or ''suggested'' (player accepts/declines). Per-team default lives in golf_coachhelm_settings.goal_assignment_default.';

COMMENT ON COLUMN public.golf_goals.snapshots IS
  'jsonb[] — weekly cron appends {date, value, team_avg} snapshots so the UI can render progress sparklines without recomputing.';

-- Indexes per master plan Part VI.1
CREATE INDEX IF NOT EXISTS idx_goals_player_active
  ON public.golf_goals(player_id, state) WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_goals_team_active
  ON public.golf_goals(team_id, state) WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_goals_due_evaluation
  ON public.golf_goals(ends_at) WHERE state = 'active';

-- RLS (Pattern 1 from docs/v3-rls-template.md)
ALTER TABLE public.golf_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_player_own ON public.golf_goals;
CREATE POLICY goals_player_own
  ON public.golf_goals
  FOR ALL
  TO authenticated
  USING (player_id = public.current_player_id());

DROP POLICY IF EXISTS goals_coach_view ON public.golf_goals;
CREATE POLICY goals_coach_view
  ON public.golf_goals
  FOR SELECT
  TO authenticated
  USING (
    public.is_team_coach(team_id) AND (
      creator_role = 'coach' OR shared_with_coach = true
    )
  );

DROP POLICY IF EXISTS goals_coach_create ON public.golf_goals;
CREATE POLICY goals_coach_create
  ON public.golf_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_team_coach(team_id)
    AND creator_role = 'coach'
    AND coach_id_if_assigned = public.current_coach_id()
  );
