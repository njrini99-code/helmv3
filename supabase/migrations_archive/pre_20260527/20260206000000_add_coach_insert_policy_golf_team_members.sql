-- ============================================================================
-- Migration: add_coach_insert_policy_golf_team_members
-- Purpose: Allow coaches to INSERT into golf_team_members when accepting
-- join requests. The original "Golf coaches can manage team members" FOR ALL
-- policy was dropped during RLS recursion fixes, and only SELECT, UPDATE,
-- DELETE policies were recreated for coaches - INSERT was missed.
-- ============================================================================

CREATE POLICY "golf_team_members_insert_coach" ON golf_team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_golf_team_coach(team_id)
  );

COMMENT ON POLICY "golf_team_members_insert_coach" ON golf_team_members IS
  'Allows coaches to add players to their team (e.g. accepting join requests)';
