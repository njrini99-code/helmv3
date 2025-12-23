-- Fix infinite recursion in team_coach_staff RLS policies
-- The issue: policy was querying team_coach_staff within itself

-- Drop existing policies
DROP POLICY IF EXISTS "Team staff viewable by team" ON public.team_coach_staff;
DROP POLICY IF EXISTS "Head coaches can manage team staff" ON public.team_coach_staff;

-- Create a helper function that bypasses RLS to check if user is on team staff
CREATE OR REPLACE FUNCTION public.is_user_on_team_staff(team_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = team_uuid
    AND c.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate policies without circular references

-- 1. Team staff can view team staff (using helper function to avoid recursion)
CREATE POLICY "Team staff viewable by team" ON public.team_coach_staff
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
      AND (
        -- Head coach can see
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR
        -- Staff member can see (using helper function)
        is_user_on_team_staff(t.id)
        OR
        -- Active team member can see
        EXISTS (
          SELECT 1 FROM team_members tm
          JOIN players p ON p.id = tm.player_id
          WHERE tm.team_id = t.id
          AND p.user_id = auth.uid()
          AND tm.status = 'active'
        )
      )
    )
  );

-- 2. Head coaches can manage team staff
CREATE POLICY "Head coaches can manage team staff" ON public.team_coach_staff
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
      AND t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- Add comment explaining the fix
COMMENT ON FUNCTION public.is_user_on_team_staff(UUID) IS
  'Helper function with SECURITY DEFINER to check team staff membership without RLS recursion';
