-- 20260421100002_coachhelm_cleanup_dup_policies.sql
-- Consolidates overlapping golf_round_reviews policies into canonical set.
-- Team A — Database Foundation (CoachHelm fix plan, 2026-04-21)
-- Fixes LIVE-11
--
-- Pre-existing (live) policies for golf_round_reviews:
--   ALL    "Coaches can manage team reviews"      — coach via tcs join
--   INSERT "Players can create their own reviews" — player owns
--   SELECT "Coaches can view shared team reviews" — coach + shared_with_coach
--   SELECT "Players can view their own reviews"   — player owns
--   SELECT "admin_read_all"                       — admin
--   SELECT "golf_reviews_select_coach"            — coach via is_golf_team_coach helper
--   UPDATE "Players can update their own reviews" — player owns
--
-- Post-migration canonical set:
--   SELECT "round_reviews_select_player"          — player owns
--   SELECT "round_reviews_select_coach"           — coach via team_members + is_golf_team_coach
--   SELECT "admin_read_all"                       — admin (retained)
--   INSERT "Players can create their own reviews" — player owns (retained)
--   UPDATE "Players can update their own reviews" — player owns (retained)
--   UPDATE "round_reviews_write_coach"            — coach via team_members

DROP POLICY IF EXISTS "Coaches can manage team reviews" ON public.golf_round_reviews;
DROP POLICY IF EXISTS "Coaches can view shared team reviews" ON public.golf_round_reviews;
DROP POLICY IF EXISTS "golf_reviews_select_coach" ON public.golf_round_reviews;
DROP POLICY IF EXISTS "Players can view their own reviews" ON public.golf_round_reviews;

CREATE POLICY "round_reviews_select_player" ON public.golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_round_reviews.player_id AND gp.user_id = auth.uid())
  );

CREATE POLICY "round_reviews_select_coach" ON public.golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );

CREATE POLICY "round_reviews_write_coach" ON public.golf_round_reviews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
