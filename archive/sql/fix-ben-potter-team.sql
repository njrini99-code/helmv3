-- ============================================================================
-- FIX: Assign Ben Potter to Main Team
-- Player: Ben Potter (created 2026-01-04)
-- Issue: team_id = NULL (RLS blocks all access)
-- ============================================================================

-- STEP 1: Assign Ben Potter to the main team
UPDATE public.golf_players
SET
  team_id = '1c9ef80d-81bc-499b-8042-bc034b057230',  -- Main team ID
  updated_at = NOW()
WHERE id = '7f462c9a-fef3-4141-8bf2-dd87d5cffc5d';

-- Expected result: UPDATE 1

-- ============================================================================
-- STEP 2: Verify the fix
-- ============================================================================

-- Confirm Ben Potter now has team_id set
SELECT
  id,
  user_id,
  first_name,
  last_name,
  team_id,
  created_at,
  updated_at
FROM golf_players
WHERE id = '7f462c9a-fef3-4141-8bf2-dd87d5cffc5d';

-- Expected: team_id should be '1c9ef80d-81bc-499b-8042-bc034b057230'

-- ============================================================================
-- STEP 3: Final validation - should return 0
-- ============================================================================

SELECT COUNT(*) as players_without_team
FROM golf_players
WHERE team_id IS NULL;

-- Expected: 0

-- ============================================================================
-- STEP 4: Verify all players are on the same team
-- ============================================================================

SELECT
  COUNT(*) as total_players,
  team_id
FROM golf_players
GROUP BY team_id
ORDER BY team_id;

-- Expected: 3 players all on team_id '1c9ef80d-81bc-499b-8042-bc034b057230'
