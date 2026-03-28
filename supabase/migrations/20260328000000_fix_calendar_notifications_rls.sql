-- ============================================================================
-- Fix golf_calendar_notifications INSERT RLS policy
-- ============================================================================
-- Bug: The existing INSERT policy references golf_coaches.team_id and
--      golf_players.team_id, but neither column exists in production.
--      Coach → team is via: golf_coaches.organization_id → golf_teams.organization_id
--      Player → team is via: golf_team_members(player_id, team_id)
--
-- This caused "new row violates row-level security policy" whenever a coach
-- tried to insert notifications for their team players in createGolfEvent.
-- ============================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "golf_calendar_notifications_insert_own" ON golf_calendar_notifications;

-- Also drop the old permissive one from migration 063 if it somehow survived
DROP POLICY IF EXISTS "golf_notifications_insert" ON golf_calendar_notifications;

-- Recreate with correct join path through golf_teams and golf_team_members
CREATE POLICY "golf_calendar_notifications_insert_own"
ON golf_calendar_notifications FOR INSERT TO authenticated
WITH CHECK (
  -- Users can insert notifications for themselves
  user_id = auth.uid()
  OR
  -- Coaches can insert notifications for players on their team
  user_id IN (
    SELECT gp.user_id
    FROM golf_players gp
    JOIN golf_team_members gtm ON gtm.player_id = gp.id
    JOIN golf_teams gt ON gt.id = gtm.team_id
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
      AND gtm.status = 'active'
  )
);
