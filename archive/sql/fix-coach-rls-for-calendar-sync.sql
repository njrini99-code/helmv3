-- =====================================================
-- FIX: Allow players to read coaches from their team
-- This is needed for calendar sync to work automatically
-- =====================================================

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "golf_coaches_select" ON golf_coaches;

-- Create new policy that allows:
-- 1. Coaches to see themselves and their team coaches
-- 2. Players to see coaches from their team (needed for calendar sync)
CREATE POLICY "golf_coaches_select"
ON golf_coaches FOR SELECT
USING (
  -- Coach can see themselves
  user_id = auth.uid()
  OR
  -- Coach can see other coaches on their team
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
  OR
  -- IMPORTANT: Players can see coaches from their team (for calendar sync)
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

-- Verification query
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'golf_coaches'
  AND policyname = 'golf_coaches_select';
