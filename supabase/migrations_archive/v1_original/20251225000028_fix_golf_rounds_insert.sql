-- Fix golf_rounds RLS policy to allow INSERT operations
-- The previous policy only had USING clause, which doesn't work for INSERT

DROP POLICY IF EXISTS "Players can manage own rounds" ON golf_rounds;

CREATE POLICY "Players can manage own rounds"
  ON golf_rounds FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id())  -- for SELECT/UPDATE/DELETE
  WITH CHECK (player_id = get_golf_player_id());  -- for INSERT
