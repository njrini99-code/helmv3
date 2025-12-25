-- Fix golf_holes RLS policy to allow INSERT operations
-- The previous policy only had USING clause, which doesn't work for INSERT

DROP POLICY IF EXISTS "Players can manage holes for own rounds" ON golf_holes;

CREATE POLICY "Players can manage holes for own rounds"
  ON golf_holes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds r
      WHERE r.id = golf_holes.round_id
      AND r.player_id = get_golf_player_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_rounds r
      WHERE r.id = golf_holes.round_id
      AND r.player_id = get_golf_player_id()
    )
  );
