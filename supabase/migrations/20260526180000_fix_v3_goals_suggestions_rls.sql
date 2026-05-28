-- Fix two RLS gaps in v3 W18/W19 (Codex audit 2026-05-26).
--
-- Issue 1 (P1 high, golf_goals): goals_coach_create only requires
-- is_team_coach(team_id). It does NOT require player_id to actually be
-- on team_id. A coach who staffs Team A can insert a goal whose
-- player_id is a player on Team B — horizontal privilege escalation
-- (writes player attribution onto someone they don't coach).
--
-- Issue 2 (P2 medium, golf_goal_suggestions): goal_suggestions_player_own
-- is declared FOR ALL TO authenticated. The original migration's comment
-- says "Engine writes via service_role; no authenticated INSERT policy"
-- but FOR ALL grants SELECT/INSERT/UPDATE/DELETE. Any player can insert
-- arbitrary suggestion rows for themselves, bypassing the engine's
-- ranking and TTL logic.
--
-- Fix:
--   1. Drop + recreate goals_coach_create with an EXISTS check that
--      pins player_id to team_id via golf_team_members (status='active').
--   2. Drop goal_suggestions_player_own (FOR ALL) and replace with two
--      narrower policies: FOR SELECT (read own) + FOR UPDATE (mutate own
--      to dismiss/snooze/accept). No INSERT or DELETE for authenticated.
--      Engine continues to write via service_role (which bypasses RLS).
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'public.golf_goals'::regclass;
--   -> goals_player_own, goals_coach_view, goals_coach_create
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'public.golf_goal_suggestions'::regclass;
--   -> goal_suggestions_player_own
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS goals_coach_create ON public.golf_goals;
--   CREATE POLICY goals_coach_create
--     ON public.golf_goals
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       public.is_team_coach(team_id)
--       AND creator_role = 'coach'
--       AND coach_id_if_assigned = public.current_coach_id()
--     );
--   DROP POLICY IF EXISTS goal_suggestions_player_select ON public.golf_goal_suggestions;
--   DROP POLICY IF EXISTS goal_suggestions_player_update ON public.golf_goal_suggestions;
--   CREATE POLICY goal_suggestions_player_own
--     ON public.golf_goal_suggestions
--     FOR ALL TO authenticated
--     USING (player_id = public.current_player_id());

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
        AND tm.team_id   = golf_goals.team_id
        AND tm.status    = 'active'
    )
  );

COMMENT ON POLICY goals_coach_create ON public.golf_goals IS
  'Coach may INSERT a goal only when (a) they staff team_id, (b) creator_role=''coach'', '
  '(c) coach_id_if_assigned matches their coach.id, AND (d) player_id is an ACTIVE '
  'member of team_id. Hardened 2026-05-26 — prior version missed (d), allowing a '
  'coach on Team A to attach a goal to a player on Team B.';

-- ---------------------------------------------------------------------------
-- Issue 2: golf_goal_suggestions — split FOR ALL into SELECT + UPDATE only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS goal_suggestions_player_own ON public.golf_goal_suggestions;

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
  'Player may read their own suggestions. Split from the prior FOR ALL policy '
  '(2026-05-26) — engine writes via service_role; authenticated INSERT/DELETE '
  'is intentionally absent so players cannot fabricate or remove suggestion rows.';

COMMENT ON POLICY goal_suggestions_player_update ON public.golf_goal_suggestions IS
  'Player may UPDATE their own suggestions (used to dismiss / snooze / mark '
  'accepted). WITH CHECK pins player_id so they cannot re-target a suggestion '
  'to another player. Hardened 2026-05-26.';
