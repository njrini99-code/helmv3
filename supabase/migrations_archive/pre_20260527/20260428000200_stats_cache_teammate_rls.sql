-- Stats cache teammate visibility RLS
--
-- The existing "Players can view own stats" policy on
-- golf_player_stats_cache restricts each player to their own row, which
-- blocks the StatsIntelligenceStrip's z-score normalization (it needs
-- to read all teammates' rows to compute a peer-relative score).
--
-- Coaches already have full team visibility via the "Coaches can view
-- team player stats" policy. This migration adds the equivalent
-- read-only policy for players, scoped to active teammates on a shared
-- team. The intelligence strip surfaces aggregated z-score categories,
-- not raw values, so this matches our privacy posture.
--
-- Once this lands, the admin-client escape hatch in
-- src/app/golf/actions/stats-intelligence.ts can be removed in a later
-- cleanup pass — for now it stays as defensive belt-and-suspenders.

CREATE POLICY "Players can view teammates stats cache"
  ON public.golf_player_stats_cache
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM golf_team_members me
      JOIN golf_team_members teammate ON teammate.team_id = me.team_id
      JOIN golf_players gp ON gp.id = me.player_id
      WHERE gp.user_id = auth.uid()
        AND me.status = 'active'
        AND teammate.status = 'active'
        AND teammate.player_id = golf_player_stats_cache.player_id
    )
  );
