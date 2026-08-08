-- golf_rounds_update_team: constrain the team a round can be moved TO.
--
-- The policy's WITH CHECK constrained only `player_id`. It said nothing about
-- `team_id`, so an UPDATE that changed `team_id` was permitted as long as the
-- player remained one of the coach's own. A coach could therefore move a round
-- onto ANY team's books — including a team in another organization entirely,
-- since no predicate tied `team_id` to the coach at all.
--
-- Where this bites, concretely: Shenandoah runs two teams in one org and Scott
-- Singhass is head_coach on both. `golf_rounds.team_id` is what the coach
-- SELECT policy keys on (`team_id IS NOT NULL AND is_golf_team_coach(team_id)`)
-- and what every roster stat, team average and leaderboard aggregates by. A
-- round moved to the sibling team silently joins the wrong squad's scoring
-- average and leaves the right one — for a player who is not on that team.
--
-- The fix is the same predicate the sibling policy `golf_rounds_update` already
-- applies to players: the resulting row's team must be one the writer is
-- actually a coach of. NULL stays allowed — a round genuinely can have no team
-- (a player with no active membership; 6 such rows exist in production today,
-- all legitimate), and `golf_rounds_update` permits NULL for the same reason.
--
-- This TIGHTENS authorization. It does not widen it. Existing legitimate writes
-- are unaffected: a coach updating a round that stays on the team they staff
-- already satisfies the new clause. What stops working is exactly the
-- cross-team move that should never have been possible.

DROP POLICY IF EXISTS "golf_rounds_update_team" ON public.golf_rounds;

CREATE POLICY "golf_rounds_update_team"
  ON public.golf_rounds
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id
      FROM public.golf_team_members gtm
      JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
      JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
      WHERE gc.user_id = auth.uid()
        AND gtm.status = 'active'::public.team_member_status
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT gtm.player_id
      FROM public.golf_team_members gtm
      JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
      JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
      WHERE gc.user_id = auth.uid()
        AND gtm.status = 'active'::public.team_member_status
    )
    -- NEW: the row's resulting team must be one this coach actually staffs.
    AND (team_id IS NULL OR public.is_golf_team_coach(team_id))
  );

COMMENT ON POLICY "golf_rounds_update_team" ON public.golf_rounds IS
  'Coach may update a round for a player on a team they staff. WITH CHECK also pins the resulting team_id to a team the coach staffs, so a round cannot be moved onto another squad''s books (added 2026-08-08).';

-- ── Committing a policy production already has, which no migration did ────────
--
-- `golf_rounds_update` (the PLAYER path) carries this WITH CHECK in production:
--
--   ... AND (team_id IS NULL OR is_golf_team_player(team_id))
--
-- but the only migration that defines it — the 20260527 baseline, line 19528 —
-- creates it with USING and NO WITH CHECK at all. The tightening was applied out
-- of band and never committed, so a database rebuilt from these migrations gets
-- a WEAKER policy than production: a player could set any team_id on their own
-- round, putting their score on a squad they have nothing to do with.
--
-- Found while adding the coach-side check above: the test asserting the two
-- paths agree failed against the migration set even though production is fine.
-- That is the drift itself, and re-stating the policy here is what closes it.
--
-- Idempotent and non-destructive: this is exactly what production enforces
-- today, so applying it changes nothing there and only repairs a rebuild.

DROP POLICY IF EXISTS "golf_rounds_update" ON public.golf_rounds;

CREATE POLICY "golf_rounds_update"
  ON public.golf_rounds
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.id = golf_rounds.player_id
        AND golf_players.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.id = golf_rounds.player_id
        AND golf_players.user_id = auth.uid()
    )
    AND (team_id IS NULL OR public.is_golf_team_player(team_id))
  );

COMMENT ON POLICY "golf_rounds_update" ON public.golf_rounds IS
  'Player may update their own round. WITH CHECK pins the resulting team_id to a team they actually play for. Present in production since before 2026-08-08 but absent from every migration until now.';
