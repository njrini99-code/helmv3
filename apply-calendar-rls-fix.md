# Apply Calendar RLS Fix

## Issue
The current golf_events RLS policy blocks personal events (where `team_id IS NULL`) because the SQL expression `NULL IN (list)` evaluates to NULL (not TRUE).

## Fix
Run the SQL below in your Supabase Dashboard SQL Editor:

```sql
-- =====================================================
-- FIX GOLF EVENTS RLS - Allow Players to View Calendar
-- =====================================================

-- Drop broken policy
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

-- Create fixed policy
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  -- Personal events (no team required) - THIS IS THE CRITICAL FIX
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
```

## Verification
After running the SQL above, verify the policies:

```sql
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
```

## Steps
1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql
2. Paste the SQL above into the editor
3. Click "Run" or press Cmd+Enter
4. Verify success message
5. Test calendar access at: http://localhost:3000/golf/dashboard/calendar
