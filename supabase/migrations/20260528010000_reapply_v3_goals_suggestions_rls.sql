-- Re-apply the v3 W18/W19 goals/suggestions RLS hardening after the
-- production baseline creates public.golf_goals and public.golf_goal_suggestions.
--
-- The original hotfix was 20260526180000_fix_v3_goals_suggestions_rls.sql, but
-- that file predates 20260527000000_prod_public_baseline.sql in fresh replay
-- order. Keeping this as a forward migration preserves replay safety while
-- ending with the hardened policies.

-- ---------------------------------------------------------------------------
-- Issue 1: golf_goals.goals_coach_create — bind player_id to team_id
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS goals_coach_create ON public.golf_goals;
CREATE POLICY goals_coach_create
  ON public.golf_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_team_coach(team_id)
    AND creator_role = 'coach'
    AND coach_id_if_assigned = public.current_coach_id()
    AND EXISTS (
      SELECT 1
      FROM public.golf_team_members tm
      WHERE tm.player_id = golf_goals.player_id
        AND tm.team_id = golf_goals.team_id
        AND tm.status = 'active'
    )
  );

COMMENT ON POLICY goals_coach_create ON public.golf_goals IS
  'Coach may INSERT a goal only when (a) they staff team_id, (b) creator_role=''coach'', '
  '(c) coach_id_if_assigned matches their coach.id, AND (d) player_id is an ACTIVE '
  'member of team_id. Hardened 2026-05-26; replay-safe forward migration 2026-05-28.';

-- ---------------------------------------------------------------------------
-- Issue 2: golf_goal_suggestions — split FOR ALL into SELECT + UPDATE only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS goal_suggestions_player_own ON public.golf_goal_suggestions;
DROP POLICY IF EXISTS goal_suggestions_player_select ON public.golf_goal_suggestions;
DROP POLICY IF EXISTS goal_suggestions_player_update ON public.golf_goal_suggestions;

CREATE POLICY goal_suggestions_player_select
  ON public.golf_goal_suggestions
  FOR SELECT
  TO authenticated
  USING (player_id = public.current_player_id());

CREATE POLICY goal_suggestions_player_update
  ON public.golf_goal_suggestions
  FOR UPDATE
  TO authenticated
  USING (player_id = public.current_player_id())
  WITH CHECK (player_id = public.current_player_id());

COMMENT ON POLICY goal_suggestions_player_select ON public.golf_goal_suggestions IS
  'Player may read their own suggestions. Split from the prior FOR ALL policy; '
  'engine writes via service_role, so authenticated INSERT/DELETE is intentionally absent.';

COMMENT ON POLICY goal_suggestions_player_update ON public.golf_goal_suggestions IS
  'Player may UPDATE their own suggestions (dismiss / snooze / mark accepted). '
  'WITH CHECK pins player_id so they cannot re-target a suggestion to another player.';
