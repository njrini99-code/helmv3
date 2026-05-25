-- v3 Wave 27 — golf_coach_player_intent table + RLS
--
-- Per master plan Part VIII + Part III locked decisions:
--   - "Keep, full version — bubble / maintain / develop / breakout /
--      rehabilitate per player."
--   - "Invisible to player" — RLS Pattern 2 (coach-owned).
--   - alert_posture modulates Wave 7 confidence threshold:
--     aggressive=0.85×, balanced=1.0×, conservative=1.15×, silent=∞
--
-- Schema mirrors master plan Part VIII. Composite PK (coach_id,
-- player_id) means one intent row per (coach, player) pair — a player
-- on multiple teams has one row per coach.
--
-- Backfill: default 'develop' rows for every active (coach, player)
-- pair ship in a SEPARATE PR per Rule 1 + Part I backfill rule. Until
-- that backfill lands, generators read NULL → fall back to 'develop'
-- + 'balanced' defaults at code level.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coach_player_intent')::text;
--   -> null (safe to create)
--   FK targets golf_coaches + golf_players both exist. RLS helpers
--   current_coach_id() shipped in W9-pt2 and live.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coach_player_intent;

CREATE TABLE IF NOT EXISTS public.golf_coach_player_intent (
  coach_id              uuid    NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  player_id             uuid    NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,

  narrative_goal        text    NOT NULL DEFAULT 'develop',
  alert_posture         text    NOT NULL DEFAULT 'balanced',
  highlight_categories  text[]  NOT NULL DEFAULT '{}',
  notes                 text,

  updated_at            timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (coach_id, player_id),
  CONSTRAINT golf_coach_player_intent_narrative_check
    CHECK (narrative_goal IN ('breakout','maintain','bubble','develop','rehabilitate')),
  CONSTRAINT golf_coach_player_intent_posture_check
    CHECK (alert_posture IN ('aggressive','balanced','conservative','silent'))
);

COMMENT ON TABLE public.golf_coach_player_intent IS
  'v3 W27 coach narrative posture per player. Locked decision: invisible to player. alert_posture modulates Wave 7 confidence gate threshold: aggressive=0.85×, balanced=1.0×, conservative=1.15×, silent=∞.';

CREATE INDEX IF NOT EXISTS idx_coach_player_intent_coach
  ON public.golf_coach_player_intent(coach_id);

-- RLS Pattern 2: coach-owned, player-invisible. No player policy at all.
ALTER TABLE public.golf_coach_player_intent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intent_coach_only ON public.golf_coach_player_intent;
CREATE POLICY intent_coach_only
  ON public.golf_coach_player_intent
  FOR ALL
  TO authenticated
  USING (coach_id = public.current_coach_id())
  WITH CHECK (coach_id = public.current_coach_id());
