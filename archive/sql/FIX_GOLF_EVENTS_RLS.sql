-- =====================================================
-- FIX GOLF EVENTS RLS - Allow Players to View Calendar
-- =====================================================
-- ISSUE: Players joining teams can't see personal events
-- CAUSE: RLS policy doesn't handle team_id IS NULL
-- =====================================================

-- Drop broken policy
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

-- Create fixed policy
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  -- Personal events (no team required)
  team_id IS NULL
  OR
  -- Team events (must be on the team)
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Coaches can see their team's events
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);

-- Also fix INSERT policy for players creating personal events
DROP POLICY IF EXISTS "Players can create personal events" ON golf_events;

CREATE POLICY "Players can create personal events"
ON golf_events FOR INSERT
WITH CHECK (
  -- Personal events (no team_id)
  team_id IS NULL
  AND
  created_by IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

-- Verify policies
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN policyname LIKE '%view%' THEN '✅ Players/coaches can view events'
    WHEN policyname LIKE '%create%' THEN '✅ Players can create personal events'
    WHEN policyname LIKE '%manage%' THEN '✅ Coaches can manage team events'
  END as description
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'golf_events'
ORDER BY policyname;
