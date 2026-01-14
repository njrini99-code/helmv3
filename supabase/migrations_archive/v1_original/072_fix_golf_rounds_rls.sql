-- ============================================================================
-- Fix Golf Rounds RLS - Enable proper RLS policies for rounds, holes, and shots
-- ============================================================================
--
-- ISSUE: Migration 062 disabled RLS completely, causing rounds not to save
-- SOLUTION: Re-enable RLS with simple, permissive policies
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable RLS on all golf rounds tables
-- ============================================================================

ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Grant necessary permissions to authenticated users
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON golf_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_holes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_shots TO authenticated;

-- ============================================================================
-- STEP 3: Create RLS policies for golf_rounds
-- ============================================================================

-- Drop any existing policies (clean slate)
DROP POLICY IF EXISTS "Players can read their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Coaches can read their team rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can insert their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can update their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can delete their own rounds" ON golf_rounds;

-- Players can read their own rounds
CREATE POLICY "Players can read their own rounds"
  ON golf_rounds FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  );

-- Coaches can read their team's rounds
CREATE POLICY "Coaches can read their team rounds"
  ON golf_rounds FOR SELECT
  USING (
    player_id IN (
      SELECT gp.id
      FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

-- Players can insert their own rounds
CREATE POLICY "Players can insert their own rounds"
  ON golf_rounds FOR INSERT
  WITH CHECK (
    player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  );

-- Players can update their own rounds
CREATE POLICY "Players can update their own rounds"
  ON golf_rounds FOR UPDATE
  USING (
    player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  );

-- Players can delete their own rounds
CREATE POLICY "Players can delete their own rounds"
  ON golf_rounds FOR DELETE
  USING (
    player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 4: Create RLS policies for golf_holes
-- ============================================================================

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own holes" ON golf_holes;
DROP POLICY IF EXISTS "Coaches can read their team holes" ON golf_holes;
DROP POLICY IF EXISTS "Players can insert their own holes" ON golf_holes;
DROP POLICY IF EXISTS "Players can update their own holes" ON golf_holes;
DROP POLICY IF EXISTS "Players can delete their own holes" ON golf_holes;

-- Players can read holes for their own rounds
CREATE POLICY "Players can read their own holes"
  ON golf_holes FOR SELECT
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Coaches can read holes for their team's rounds
CREATE POLICY "Coaches can read their team holes"
  ON golf_holes FOR SELECT
  USING (
    round_id IN (
      SELECT r.id
      FROM golf_rounds r
      JOIN golf_players gp ON gp.id = r.player_id
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

-- Players can insert holes for their own rounds
CREATE POLICY "Players can insert their own holes"
  ON golf_holes FOR INSERT
  WITH CHECK (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Players can update holes for their own rounds
CREATE POLICY "Players can update their own holes"
  ON golf_holes FOR UPDATE
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Players can delete holes for their own rounds
CREATE POLICY "Players can delete their own holes"
  ON golf_holes FOR DELETE
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- STEP 5: Create RLS policies for golf_shots
-- ============================================================================

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can read their team shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can insert their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can update their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can delete their own shots" ON golf_shots;

-- Players can read shots for their own rounds
CREATE POLICY "Players can read their own shots"
  ON golf_shots FOR SELECT
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Coaches can read shots for their team's rounds
CREATE POLICY "Coaches can read their team shots"
  ON golf_shots FOR SELECT
  USING (
    round_id IN (
      SELECT r.id
      FROM golf_rounds r
      JOIN golf_players gp ON gp.id = r.player_id
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

-- Players can insert shots for their own rounds
CREATE POLICY "Players can insert their own shots"
  ON golf_shots FOR INSERT
  WITH CHECK (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Players can update shots for their own rounds
CREATE POLICY "Players can update their own shots"
  ON golf_shots FOR UPDATE
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- Players can delete shots for their own rounds
CREATE POLICY "Players can delete their own shots"
  ON golf_shots FOR DELETE
  USING (
    round_id IN (
      SELECT id FROM golf_rounds
      WHERE player_id IN (
        SELECT id FROM golf_players
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- STEP 6: Add helpful comments
-- ============================================================================

COMMENT ON POLICY "Players can read their own rounds" ON golf_rounds IS
  'Allows players to view their own golf rounds';

COMMENT ON POLICY "Coaches can read their team rounds" ON golf_rounds IS
  'Allows coaches to view rounds from players on their team';

COMMENT ON POLICY "Players can insert their own rounds" ON golf_rounds IS
  'Allows players to create new rounds for themselves';

COMMENT ON TABLE golf_rounds IS 'RLS enabled with player and coach policies';
COMMENT ON TABLE golf_holes IS 'RLS enabled with player and coach policies';
COMMENT ON TABLE golf_shots IS 'RLS enabled with player and coach policies';
