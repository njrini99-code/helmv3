-- ============================================================================
-- MIGRATION: 064_enable_rls_team_scoping.sql
-- PURPOSE: Enable RLS on core tables and create team-scoped policies
-- CRITICAL: This fixes the authentication/authorization issues
-- ============================================================================

-- ============================================================================
-- SECTION 1: Helper Functions
-- ============================================================================

-- Function to get all team_ids the current user belongs to
CREATE OR REPLACE FUNCTION public.get_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Get team_id if user is a coach
  SELECT team_id
  FROM public.golf_coaches
  WHERE user_id = (SELECT auth.uid())
    AND team_id IS NOT NULL

  UNION

  -- Get team_id if user is a player
  SELECT team_id
  FROM public.golf_players
  WHERE user_id = (SELECT auth.uid())
    AND team_id IS NOT NULL
$$;

-- Function to check if user is a coach
CREATE OR REPLACE FUNCTION public.is_user_coach()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_coaches
    WHERE user_id = (SELECT auth.uid())
  )
$$;

-- Function to check if user is a player
CREATE OR REPLACE FUNCTION public.is_user_player()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_players
    WHERE user_id = (SELECT auth.uid())
  )
$$;

-- Function to get current user's coach ID (if they are a coach)
CREATE OR REPLACE FUNCTION public.get_user_coach_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.golf_coaches
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1
$$;

-- Function to get current user's player ID (if they are a player)
CREATE OR REPLACE FUNCTION public.get_user_player_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.golf_players
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1
$$;

-- ============================================================================
-- SECTION 2: Enable RLS on Core Tables
-- ============================================================================

ALTER TABLE public.golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_travel_itineraries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 3: golf_players Policies
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "players_select_own" ON public.golf_players;
DROP POLICY IF EXISTS "players_select_teammates" ON public.golf_players;
DROP POLICY IF EXISTS "players_insert_own" ON public.golf_players;
DROP POLICY IF EXISTS "players_update_own" ON public.golf_players;
DROP POLICY IF EXISTS "players_delete_own" ON public.golf_players;

-- SELECT: Users can see their own profile
CREATE POLICY "players_select_own" ON public.golf_players
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- SELECT: Users can see teammates (same team_id)
CREATE POLICY "players_select_teammates" ON public.golf_players
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Users can create their own profile
CREATE POLICY "players_insert_own" ON public.golf_players
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- UPDATE: Users can update their own profile
CREATE POLICY "players_update_own" ON public.golf_players
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- DELETE: Users can delete their own profile
CREATE POLICY "players_delete_own" ON public.golf_players
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- SECTION 4: golf_coaches Policies
-- ============================================================================

DROP POLICY IF EXISTS "coaches_select_own" ON public.golf_coaches;
DROP POLICY IF EXISTS "coaches_select_team" ON public.golf_coaches;
DROP POLICY IF EXISTS "coaches_insert_own" ON public.golf_coaches;
DROP POLICY IF EXISTS "coaches_update_own" ON public.golf_coaches;

-- SELECT: Coaches can see their own profile
CREATE POLICY "coaches_select_own" ON public.golf_coaches
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- SELECT: Team members can see their team's coaches
CREATE POLICY "coaches_select_team" ON public.golf_coaches
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Users can create their own coach profile
CREATE POLICY "coaches_insert_own" ON public.golf_coaches
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- UPDATE: Coaches can update their own profile
CREATE POLICY "coaches_update_own" ON public.golf_coaches
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================================
-- SECTION 5: golf_teams Policies
-- ============================================================================

DROP POLICY IF EXISTS "teams_select_member" ON public.golf_teams;
DROP POLICY IF EXISTS "teams_insert_coach" ON public.golf_teams;
DROP POLICY IF EXISTS "teams_update_coach" ON public.golf_teams;

-- SELECT: Team members can see their team
CREATE POLICY "teams_select_member" ON public.golf_teams
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_user_team_ids()));

-- INSERT: Coaches can create teams
CREATE POLICY "teams_insert_coach" ON public.golf_teams
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_user_coach());

-- UPDATE: Coaches can update their team
CREATE POLICY "teams_update_coach" ON public.golf_teams
  FOR UPDATE
  TO authenticated
  USING (id IN (
    SELECT team_id FROM public.golf_coaches
    WHERE user_id = (SELECT auth.uid())
  ));

-- ============================================================================
-- SECTION 6: golf_events Policies
-- ============================================================================

DROP POLICY IF EXISTS "events_select_team" ON public.golf_events;
DROP POLICY IF EXISTS "events_insert_coach" ON public.golf_events;
DROP POLICY IF EXISTS "events_update_coach" ON public.golf_events;
DROP POLICY IF EXISTS "events_delete_coach" ON public.golf_events;

-- SELECT: Team members can see their team's events
CREATE POLICY "events_select_team" ON public.golf_events
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT public.get_user_team_ids())
    OR
    -- Also allow viewing individual events assigned to the player
    player_id = (SELECT public.get_user_player_id())
  );

-- INSERT: Coaches can create events for their team
CREATE POLICY "events_insert_coach" ON public.golf_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be a coach
    public.is_user_coach()
    AND
    -- Team must be coach's team
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
    AND
    -- created_by must be the coach's ID
    created_by = (SELECT public.get_user_coach_id())
  );

-- UPDATE: Event creator or team coach can update
CREATE POLICY "events_update_coach" ON public.golf_events
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT public.get_user_coach_id())
    OR
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- DELETE: Only event creator can delete
CREATE POLICY "events_delete_coach" ON public.golf_events
  FOR DELETE
  TO authenticated
  USING (created_by = (SELECT public.get_user_coach_id()));

-- ============================================================================
-- SECTION 7: golf_event_rsvps Policies
-- ============================================================================

DROP POLICY IF EXISTS "rsvps_select_team" ON public.golf_event_rsvps;
DROP POLICY IF EXISTS "rsvps_insert_player" ON public.golf_event_rsvps;
DROP POLICY IF EXISTS "rsvps_update_player" ON public.golf_event_rsvps;

-- SELECT: Team members can see RSVPs for their team's events
CREATE POLICY "rsvps_select_team" ON public.golf_event_rsvps
  FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE team_id IN (SELECT public.get_user_team_ids())
    )
  );

-- INSERT: Players can RSVP to their team's events
CREATE POLICY "rsvps_insert_player" ON public.golf_event_rsvps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be the player
    player_id = (SELECT public.get_user_player_id())
    AND
    -- Event must be for their team
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE team_id IN (SELECT public.get_user_team_ids())
    )
  );

-- UPDATE: Players can update their own RSVP
CREATE POLICY "rsvps_update_player" ON public.golf_event_rsvps
  FOR UPDATE
  TO authenticated
  USING (player_id = (SELECT public.get_user_player_id()));

-- ============================================================================
-- SECTION 8: golf_event_attendance Policies
-- ============================================================================

DROP POLICY IF EXISTS "attendance_select_team" ON public.golf_event_attendance;
DROP POLICY IF EXISTS "attendance_insert" ON public.golf_event_attendance;
DROP POLICY IF EXISTS "attendance_update" ON public.golf_event_attendance;

-- SELECT: Team members can see attendance for their events
CREATE POLICY "attendance_select_team" ON public.golf_event_attendance
  FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.golf_events
      WHERE team_id IN (SELECT public.get_user_team_ids())
    )
  );

-- INSERT: Players can record their attendance, coaches can record for anyone on team
CREATE POLICY "attendance_insert" ON public.golf_event_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Player recording own attendance
    player_id = (SELECT public.get_user_player_id())
    OR
    -- Coach recording for team player
    (
      public.is_user_coach()
      AND
      player_id IN (
        SELECT id FROM public.golf_players
        WHERE team_id IN (SELECT public.get_user_team_ids())
      )
    )
  );

-- UPDATE: Coaches can update attendance (check-in, mark no-show)
CREATE POLICY "attendance_update" ON public.golf_event_attendance
  FOR UPDATE
  TO authenticated
  USING (
    -- Own attendance
    player_id = (SELECT public.get_user_player_id())
    OR
    -- Coach updating team attendance
    (
      public.is_user_coach()
      AND
      event_id IN (
        SELECT id FROM public.golf_events
        WHERE team_id IN (SELECT public.get_user_team_ids())
      )
    )
  );

-- ============================================================================
-- SECTION 9: golf_announcements Policies
-- ============================================================================

DROP POLICY IF EXISTS "announcements_select_team" ON public.golf_announcements;
DROP POLICY IF EXISTS "announcements_insert_coach" ON public.golf_announcements;

-- SELECT: Team members can see their team's announcements
CREATE POLICY "announcements_select_team" ON public.golf_announcements
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Coaches can create announcements for their team
CREATE POLICY "announcements_insert_coach" ON public.golf_announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_user_coach()
    AND
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
    AND
    created_by = (SELECT public.get_user_coach_id())
  );

-- ============================================================================
-- SECTION 10: golf_documents Policies
-- ============================================================================

DROP POLICY IF EXISTS "documents_select_team" ON public.golf_documents;
DROP POLICY IF EXISTS "documents_insert_coach" ON public.golf_documents;

-- SELECT: Coaches see all team docs, players see player_visible docs
CREATE POLICY "documents_select_team" ON public.golf_documents
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT public.get_user_team_ids())
    AND
    (
      -- Coaches see all documents
      public.is_user_coach()
      OR
      -- Players see only player-visible documents
      player_visible = true
    )
  );

-- INSERT: Coaches can upload documents
CREATE POLICY "documents_insert_coach" ON public.golf_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_user_coach()
    AND
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- SECTION 11: golf_tasks Policies
-- ============================================================================

DROP POLICY IF EXISTS "tasks_select_team" ON public.golf_tasks;
DROP POLICY IF EXISTS "tasks_insert_coach" ON public.golf_tasks;

-- SELECT: Team members can see their team's tasks
CREATE POLICY "tasks_select_team" ON public.golf_tasks
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Coaches can create tasks
CREATE POLICY "tasks_insert_coach" ON public.golf_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_user_coach()
    AND
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- SECTION 12: golf_travel_itineraries Policies
-- ============================================================================

DROP POLICY IF EXISTS "travel_select_team" ON public.golf_travel_itineraries;
DROP POLICY IF EXISTS "travel_insert_coach" ON public.golf_travel_itineraries;

-- SELECT: Team members can see their travel itineraries
CREATE POLICY "travel_select_team" ON public.golf_travel_itineraries
  FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT public.get_user_team_ids()));

-- INSERT: Coaches can create travel itineraries
CREATE POLICY "travel_insert_coach" ON public.golf_travel_itineraries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_user_coach()
    AND
    team_id IN (
      SELECT team_id FROM public.golf_coaches
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- SECTION 13: Indexes for RLS Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_players_user_id ON public.golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON public.golf_players(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_user_id ON public.golf_coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_team_id ON public.golf_coaches(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_teams_id ON public.golf_teams(id);
CREATE INDEX IF NOT EXISTS idx_golf_events_team_id ON public.golf_events(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_created_by ON public.golf_events(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_events_player_id ON public.golf_events(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_event_id ON public.golf_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_player_id ON public.golf_event_rsvps(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_event_id ON public.golf_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_player_id ON public.golf_event_attendance(player_id);

-- ============================================================================
-- SECTION 14: Verification Queries (run after migration)
-- ============================================================================

-- Verify RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'golf_%';

-- Verify policies exist
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'golf_%';
