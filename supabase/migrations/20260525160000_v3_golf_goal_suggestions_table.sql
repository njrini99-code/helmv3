-- v3 Wave 19 — golf_goal_suggestions table + RLS
--
-- Engine-emitted suggestions per master plan Part VI.2 + Part VI.5
-- ("Engine suggestions"). The suggestion engine (v3/goals/suggestions.ts)
-- runs after each round and weekly, picks the player's top 3 weakest
-- standing-bar gaps, and inserts a row here. Player sees them as
-- "Suggested" cards on the dashboard.
--
-- Lifecycle: pending → accepted (creates a real golf_goals row) /
-- dismissed / snoozed / expired (14 days default TTL).
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_goal_suggestions')::text;
--   -> null (safe to create)
--   FK targets: golf_players (existing), golf_metrics (W9-pt2),
--   golf_coach_insights (existing). RLS helpers exist (W9-pt2).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_goal_suggestions;

CREATE TABLE IF NOT EXISTS public.golf_goal_suggestions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id              uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  metric_id              text NOT NULL REFERENCES public.golf_metrics(metric_id),

  suggested_at           timestamptz NOT NULL DEFAULT now(),
  suggested_target_value numeric,
  suggested_window_days  int NOT NULL DEFAULT 30,
  origin_insight_id      uuid REFERENCES public.golf_coach_insights(id),

  state                  text NOT NULL DEFAULT 'pending',
  acted_at               timestamptz,
  snooze_until           timestamptz,

  expires_at             timestamptz NOT NULL DEFAULT (now() + INTERVAL '14 days'),

  CONSTRAINT golf_goal_suggestions_state_check
    CHECK (state IN ('pending','accepted','dismissed','snoozed','expired')),
  CONSTRAINT golf_goal_suggestions_window_range
    CHECK (suggested_window_days BETWEEN 7 AND 365)
);

COMMENT ON TABLE public.golf_goal_suggestions IS
  'v3 W19. Engine-emitted goal suggestions per Part VI.5. Player accepts (→ golf_goals row created) / dismisses / snoozes; 14-day default TTL.';

CREATE INDEX IF NOT EXISTS idx_goal_suggestions_player_pending
  ON public.golf_goal_suggestions(player_id, expires_at)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_goal_suggestions_due_expiry
  ON public.golf_goal_suggestions(expires_at)
  WHERE state IN ('pending','snoozed');

ALTER TABLE public.golf_goal_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goal_suggestions_player_own ON public.golf_goal_suggestions;
CREATE POLICY goal_suggestions_player_own
  ON public.golf_goal_suggestions
  FOR ALL
  TO authenticated
  USING (player_id = public.current_player_id());

-- Engine writes via service_role; no authenticated INSERT policy.
