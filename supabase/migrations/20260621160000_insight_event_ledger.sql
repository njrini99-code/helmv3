-- P1-12: unified insight event ledger so Effectiveness and Learning roll up from
-- ONE source of truth (exposure → action → outcome), instead of divergent tallies.
-- Engine writes via the service-role (admin) client, which bypasses RLS. Coaches
-- read their team's events; players read their own. No anon access.

-- ── exposure: an insight was shown to a player on some surface ──
CREATE TABLE IF NOT EXISTS public.golf_insight_exposure (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id    uuid NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  coach_id      uuid,
  surface       text,
  rank_position int,
  rank_score    numeric,
  shown_at      timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── action: an actor did something with an insight ──
CREATE TABLE IF NOT EXISTS public.golf_insight_action (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id  uuid NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  actor_id    uuid,
  actor_role  text,
  action_type text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── outcome: a measured result attributed to an insight ──
CREATE TABLE IF NOT EXISTS public.golf_insight_outcome (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id       uuid NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  player_id        uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  metric           text,
  baseline_value   numeric,
  outcome_value    numeric,
  improvement      numeric,
  window_days      int,
  related_round_id uuid,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS golf_insight_exposure_insight_idx ON public.golf_insight_exposure(insight_id);
CREATE INDEX IF NOT EXISTS golf_insight_exposure_player_idx  ON public.golf_insight_exposure(player_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS golf_insight_action_insight_idx   ON public.golf_insight_action(insight_id);
CREATE INDEX IF NOT EXISTS golf_insight_action_player_idx    ON public.golf_insight_action(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS golf_insight_outcome_insight_idx  ON public.golf_insight_outcome(insight_id);
CREATE INDEX IF NOT EXISTS golf_insight_outcome_player_idx   ON public.golf_insight_outcome(player_id, measured_at DESC);

-- RLS: coach reads team, player reads own, engine writes via service_role (bypasses RLS), no anon.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['golf_insight_exposure','golf_insight_action','golf_insight_outcome'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM public', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($p$CREATE POLICY %1$s_coach_select_team ON public.%1$I FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM golf_team_members gtm
              WHERE gtm.player_id = %1$I.player_id AND gtm.status = 'active'::team_member_status
                AND is_golf_team_coach(gtm.team_id)))$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_player_select_own ON public.%1$I FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM golf_players gp WHERE gp.id = %1$I.player_id AND gp.user_id = auth.uid()))$p$, t);
  END LOOP;
END $$;
