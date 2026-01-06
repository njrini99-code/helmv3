-- ============================================================================
-- FIX: Remove Mike Johnson from Test Coach's Team
-- Issue: Mike Johnson (demo coach) incorrectly assigned to same team_id
-- ============================================================================

-- OPTION A: Set Mike Johnson's team to NULL (makes him teamless)
-- Run this if you want to keep Mike Johnson but remove him from your team
UPDATE golf_coaches
SET
  team_id = NULL,
  updated_at = NOW()
WHERE id = '376fc4c9-006b-4134-bb59-173f33e9b8fb'
  AND full_name = 'Mike Johnson'
  AND email = 'demo.coach@helmgolf.com';

-- Expected result: UPDATE 1

-- ============================================================================
-- OPTION B: Delete Mike Johnson entirely (if he's just demo data)
-- ============================================================================

-- UNCOMMENT BELOW IF YOU WANT TO DELETE HIM COMPLETELY
/*
DELETE FROM golf_coaches
WHERE id = '376fc4c9-006b-4134-bb59-173f33e9b8fb'
  AND full_name = 'Mike Johnson'
  AND email = 'demo.coach@helmgolf.com';
*/

-- ============================================================================
-- VERIFICATION: Check teams after fix
-- ============================================================================

-- Should show only Test Coach on your team
SELECT
  full_name,
  email,
  team_id,
  CASE
    WHEN team_id = '1c9ef80d-81bc-499b-8042-bc034b057230' THEN 'Test Team'
    WHEN team_id IS NULL THEN 'No Team'
    ELSE 'Other Team'
  END as team_status
FROM golf_coaches
WHERE email IN ('demo.coach@helmgolf.com', 'testcoach@testgolf.com')
ORDER BY full_name;

-- Expected result:
-- Mike Johnson:  team_id = NULL (or deleted)
-- Test Coach:    team_id = 1c9ef80d-81bc-499b-8042-bc034b057230
