-- Wave A · A3 — players may UPDATE their own focus areas
-- Audit finding: F005 (CRITICAL) — golf_player_focus_areas had only a coach
-- UPDATE policy. A player's "Log progress"/"Mark complete" UPDATE matched 0 rows
-- under RLS; Supabase returns no error on a 0-row UPDATE, so the action returned
-- {success:true} while nothing persisted.
--
-- Fix: add a player-self UPDATE policy mirroring the existing self-SELECT branch
-- (golf_players.id = player_id AND golf_players.user_id = auth.uid()). Row-level
-- only; the development.ts action remains the column-level gate (it writes only
-- progress fields) and must additionally fail honestly on a 0-row result (C1/F066).
CREATE POLICY golf_player_focus_areas_update_player ON public.golf_player_focus_areas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = golf_player_focus_areas.player_id
        AND gp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.id = golf_player_focus_areas.player_id
        AND gp.user_id = auth.uid()
    )
  );
