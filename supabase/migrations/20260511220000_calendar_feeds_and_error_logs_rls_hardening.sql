-- Closes findings from the 2026-05-11 Codex Security reviews:
--   Calendar High — golf_calendar_feeds could be written with another team's
--     team_id, then exported through token routes that use the admin client.
--   Admin Medium — error_logs INSERT WITH CHECK (true) allowed direct client
--     telemetry poisoning through PostgREST.

BEGIN;

DROP POLICY IF EXISTS "Users can manage their own feeds" ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS "golf_feeds_select_own" ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS "golf_feeds_insert_own" ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS "golf_feeds_update_own" ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS "golf_feeds_delete_own" ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS golf_calendar_feeds_select_own ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS golf_calendar_feeds_insert_own_team ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS golf_calendar_feeds_update_own_team ON public.golf_calendar_feeds;
DROP POLICY IF EXISTS golf_calendar_feeds_delete_own ON public.golf_calendar_feeds;

CREATE POLICY golf_calendar_feeds_select_own ON public.golf_calendar_feeds
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY golf_calendar_feeds_insert_own_team ON public.golf_calendar_feeds
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR public.is_golf_team_coach(team_id)
      OR public.is_golf_team_player(team_id)
    )
  );

CREATE POLICY golf_calendar_feeds_update_own_team ON public.golf_calendar_feeds
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR public.is_golf_team_coach(team_id)
      OR public.is_golf_team_player(team_id)
    )
  );

CREATE POLICY golf_calendar_feeds_delete_own ON public.golf_calendar_feeds
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can create error logs" ON public.error_logs;
DROP POLICY IF EXISTS error_logs_insert_authenticated_self ON public.error_logs;

CREATE POLICY error_logs_insert_authenticated_self ON public.error_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_user_on_team(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff tcs
    JOIN public.golf_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id
      AND c.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.golf_team_members tm
    JOIN public.golf_players p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id
      AND p.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) TO authenticated, service_role;

COMMIT;
