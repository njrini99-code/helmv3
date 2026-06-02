-- Allow coaches to generate (INSERT) round reviews for their own team's players.
--
-- The round-review page (/golf/dashboard/rounds/[id]/review) authorizes BOTH
-- players and coaches (verifyReviewAccess role 'player_or_coach') and
-- auto-generates a review when none is cached. golf_round_reviews already had
-- coach SELECT (round_reviews_select_coach) and coach UPDATE
-- (round_reviews_write_coach) policies, but NO coach INSERT policy — only
-- "Players can create their own reviews". So when a coach opened an
-- un-cached player round, the auto-generate upsert's INSERT branch failed the
-- RLS WITH CHECK and the page surfaced "Failed to save review".
--
-- This adds the missing INSERT policy, scoped identically to the existing
-- coach SELECT/UPDATE policies (active team membership + is_golf_team_coach),
-- so a coach can only create reviews for players on a team they coach. No new
-- privilege surface beyond what coaches already have on these rows.
CREATE POLICY round_reviews_insert_coach
  ON public.golf_round_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
