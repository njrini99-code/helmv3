-- Allow players to UPDATE their own feedback rows.
-- Pairs with existing ipf_player_insert_own / ipf_player_select_own / ipf_coach_select_team.
-- Without this, a player upsert()-ing on an existing row (e.g., changing their rating from
-- helpful → not_helpful) silently no-ops on the UPDATE branch under RLS.
CREATE POLICY "ipf_player_update_own" ON public.golf_insight_player_feedback
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  );
