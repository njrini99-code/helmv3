-- ============================================================================
-- COMPREHENSIVE TEAM-BASED RLS FIX
-- Based on GolfHelm Auth Data Audit
-- Implements proper team-scoping for all golf tables
-- ============================================================================

-- ============================================================================
-- Helper Function: Get User's Team IDs
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_user_team_ids();

-- Create helper function for team membership
CREATE OR REPLACE FUNCTION public.get_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM public.golf_coaches WHERE user_id = auth.uid() AND team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.golf_players WHERE user_id = auth.uid() AND team_id IS NOT NULL
$$;

-- Add comment
COMMENT ON FUNCTION public.get_user_team_ids() IS
'Returns all team_ids that the current authenticated user belongs to (as either coach or player)';

-- ============================================================================
-- GOLF_PLAYERS: Team-scoped access
-- ============================================================================

ALTER TABLE public.golf_players DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_players' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_players', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view their own profile + teammates
CREATE POLICY "golf_players_view_self" ON public.golf_players
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "golf_players_view_teammates" ON public.golf_players
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Users can create their own profile
CREATE POLICY "golf_players_insert_own_profile" ON public.golf_players
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own profile
CREATE POLICY "golf_players_update_own_profile" ON public.golf_players
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own profile
CREATE POLICY "golf_players_delete_own_profile" ON public.golf_players
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- GOLF_COACHES: Team-scoped access
-- ============================================================================

ALTER TABLE public.golf_coaches DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coaches' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_coaches', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view their own profile + team coaches
CREATE POLICY "golf_coaches_view_self" ON public.golf_coaches
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "golf_coaches_view_team_coaches" ON public.golf_coaches
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Users can create their own profile
CREATE POLICY "golf_coaches_insert_own_profile" ON public.golf_coaches
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own profile
CREATE POLICY "golf_coaches_update_own_profile" ON public.golf_coaches
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own profile
CREATE POLICY "golf_coaches_delete_own_profile" ON public.golf_coaches
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- GOLF_TEAMS: Team-scoped access
-- ============================================================================

ALTER TABLE public.golf_teams DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_teams' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_teams', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.golf_teams ENABLE ROW LEVEL SECURITY;

-- SELECT: Team members can view their own team
CREATE POLICY "golf_teams_view_own_team" ON public.golf_teams
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_user_team_ids()));

-- INSERT: Anyone can create a team (for onboarding)
CREATE POLICY "golf_teams_insert" ON public.golf_teams
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Only team members can update their team
CREATE POLICY "golf_teams_update" ON public.golf_teams
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.get_user_team_ids()))
  WITH CHECK (id IN (SELECT public.get_user_team_ids()));

-- DELETE: Only coaches on the team can delete it
CREATE POLICY "golf_teams_delete" ON public.golf_teams
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- GOLF_EVENTS: Team-scoped access
-- ============================================================================

ALTER TABLE public.golf_events DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_events', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.golf_events ENABLE ROW LEVEL SECURITY;

-- SELECT: Team members can view their team's events
CREATE POLICY "golf_events_view_team_events" ON public.golf_events
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Only coaches can create events for their team
CREATE POLICY "golf_events_insert" ON public.golf_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
    AND
    created_by IN (
      SELECT id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Only the creating coach can update events
CREATE POLICY "golf_events_update" ON public.golf_events
  FOR UPDATE
  TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by IN (
      SELECT id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  );

-- DELETE: Only the creating coach can delete events
CREATE POLICY "golf_events_delete" ON public.golf_events
  FOR DELETE
  TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- GOLF_EVENT_ATTENDANCE: Team-scoped access
-- ============================================================================

ALTER TABLE public.golf_event_attendance DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_event_attendance' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_event_attendance', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.golf_event_attendance ENABLE ROW LEVEL SECURITY;

-- SELECT: Can view attendance for events on your team
CREATE POLICY "golf_event_attendance_view" ON public.golf_event_attendance
  FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.golf_events WHERE team_id IN (SELECT public.get_user_team_ids())
    )
  );

-- INSERT: Coaches can add attendance, players can add their own
CREATE POLICY "golf_event_attendance_insert" ON public.golf_event_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Players can add their own attendance
    player_id IN (SELECT id FROM public.golf_players WHERE user_id = auth.uid())
    OR
    -- Coaches can add attendance for their team's players
    (
      event_id IN (
        SELECT id FROM public.golf_events
        WHERE team_id IN (SELECT team_id FROM public.golf_coaches WHERE user_id = auth.uid())
      )
      AND
      player_id IN (
        SELECT gp.id FROM public.golf_players gp
        INNER JOIN public.golf_coaches gc ON gp.team_id = gc.team_id
        WHERE gc.user_id = auth.uid()
      )
    )
  );

-- UPDATE: Players can update their own attendance, coaches can update their team's
CREATE POLICY "golf_event_attendance_update" ON public.golf_event_attendance
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM public.golf_players WHERE user_id = auth.uid())
    OR
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE created_by IN (SELECT id FROM public.golf_coaches WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (SELECT id FROM public.golf_players WHERE user_id = auth.uid())
    OR
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE created_by IN (SELECT id FROM public.golf_coaches WHERE user_id = auth.uid())
    )
  );

-- DELETE: Same as update
CREATE POLICY "golf_event_attendance_delete" ON public.golf_event_attendance
  FOR DELETE
  TO authenticated
  USING (
    player_id IN (SELECT id FROM public.golf_players WHERE user_id = auth.uid())
    OR
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE created_by IN (SELECT id FROM public.golf_coaches WHERE user_id = auth.uid())
    )
  );

-- ============================================================================
-- Add indexes for RLS performance
-- ============================================================================

-- Already exist from previous migrations, but ensure they're there
CREATE INDEX IF NOT EXISTS idx_golf_players_user_id ON public.golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON public.golf_players(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_user_id ON public.golf_coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_team_id ON public.golf_coaches(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_team_id ON public.golf_events(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_created_by ON public.golf_events(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_event_id ON public.golf_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_player_id ON public.golf_event_attendance(player_id);

-- ============================================================================
-- Verify RLS is enabled
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Team-Based RLS Migration Complete ===';
  RAISE NOTICE 'RLS enabled on: golf_players, golf_coaches, golf_teams, golf_events, golf_event_attendance';
  RAISE NOTICE 'All tables now properly scoped by team_id';
  RAISE NOTICE 'Helper function created: get_user_team_ids()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update code to properly handle team_id filtering';
  RAISE NOTICE '2. Ensure all coaches have valid team_id set';
  RAISE NOTICE '3. Test messaging, roster, and calendar features';
END $$;
