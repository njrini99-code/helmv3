-- ============================================================================
-- GOLF RLS POLICIES
-- Migration: 017_golf_rls_policies.sql
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL GOLF TABLES
-- ============================================================================

ALTER TABLE golf_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_qualifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_qualifier_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_classes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if user is a golf coach for a specific team
CREATE OR REPLACE FUNCTION is_golf_coach_of_team(team_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_coaches
    WHERE user_id = auth.uid()
    AND team_id = team_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a golf player on a specific team
CREATE OR REPLACE FUNCTION is_golf_player_of_team(team_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_players
    WHERE user_id = auth.uid()
    AND team_id = team_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a member of a golf team (coach or player)
CREATE OR REPLACE FUNCTION is_golf_team_member(team_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_golf_coach_of_team(team_uuid) OR is_golf_player_of_team(team_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get the golf coach ID for the current user
CREATE OR REPLACE FUNCTION get_golf_coach_id()
RETURNS UUID AS $$
  SELECT id FROM golf_coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get the golf player ID for the current user
CREATE OR REPLACE FUNCTION get_golf_player_id()
RETURNS UUID AS $$
  SELECT id FROM golf_players WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================

CREATE POLICY "Golf organizations viewable by authenticated users"
  ON golf_organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Coaches can create organizations"
  ON golf_organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Coaches can update own organization"
  ON golf_organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
      AND golf_coaches.organization_id = golf_organizations.id
    )
  );

-- ============================================================================
-- TEAMS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view their team"
  ON golf_teams FOR SELECT
  TO authenticated
  USING (is_golf_team_member(id));

CREATE POLICY "Coaches can create teams"
  ON golf_teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Coaches can update their team"
  ON golf_teams FOR UPDATE
  TO authenticated
  USING (is_golf_coach_of_team(id));

-- Allow viewing team by invite code (for joining)
CREATE POLICY "Anyone can view team by invite code"
  ON golf_teams FOR SELECT
  TO authenticated
  USING (invite_code IS NOT NULL);

-- ============================================================================
-- COACHES POLICIES
-- ============================================================================

CREATE POLICY "Coaches can manage own profile"
  ON golf_coaches FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Team members can view their coach"
  ON golf_coaches FOR SELECT
  TO authenticated
  USING (
    team_id IS NOT NULL
    AND is_golf_team_member(team_id)
  );

-- ============================================================================
-- PLAYERS POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own profile"
  ON golf_players FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Coaches can view their team's players"
  ON golf_players FOR SELECT
  TO authenticated
  USING (
    team_id IS NOT NULL
    AND is_golf_coach_of_team(team_id)
  );

CREATE POLICY "Team players can view teammates"
  ON golf_players FOR SELECT
  TO authenticated
  USING (
    team_id IS NOT NULL
    AND is_golf_player_of_team(team_id)
  );

CREATE POLICY "Coaches can update their team's players"
  ON golf_players FOR UPDATE
  TO authenticated
  USING (
    team_id IS NOT NULL
    AND is_golf_coach_of_team(team_id)
  );

CREATE POLICY "Coaches can insert players to their team"
  ON golf_players FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IS NULL
    OR is_golf_coach_of_team(team_id)
  );

-- ============================================================================
-- ROUNDS POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own rounds"
  ON golf_rounds FOR ALL
  TO authenticated
  USING (
    player_id = get_golf_player_id()
  );

CREATE POLICY "Coaches can view team player rounds"
  ON golf_rounds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.id = golf_rounds.player_id
      AND p.team_id IS NOT NULL
      AND is_golf_coach_of_team(p.team_id)
    )
  );

CREATE POLICY "Coaches can verify team player rounds"
  ON golf_rounds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.id = golf_rounds.player_id
      AND p.team_id IS NOT NULL
      AND is_golf_coach_of_team(p.team_id)
    )
  );

-- ============================================================================
-- HOLES POLICIES
-- ============================================================================

CREATE POLICY "Players can manage holes for own rounds"
  ON golf_holes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds r
      WHERE r.id = golf_holes.round_id
      AND r.player_id = get_golf_player_id()
    )
  );

CREATE POLICY "Coaches can view holes for team player rounds"
  ON golf_holes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds r
      JOIN golf_players p ON p.id = r.player_id
      WHERE r.id = golf_holes.round_id
      AND p.team_id IS NOT NULL
      AND is_golf_coach_of_team(p.team_id)
    )
  );

-- ============================================================================
-- EVENTS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view events"
  ON golf_events FOR SELECT
  TO authenticated
  USING (is_golf_team_member(team_id));

CREATE POLICY "Coaches can manage team events"
  ON golf_events FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- EVENT ATTENDANCE POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own attendance"
  ON golf_event_attendance FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id());

CREATE POLICY "Coaches can view team event attendance"
  ON golf_event_attendance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_events e
      WHERE e.id = golf_event_attendance.event_id
      AND is_golf_coach_of_team(e.team_id)
    )
  );

-- ============================================================================
-- QUALIFIERS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view qualifiers"
  ON golf_qualifiers FOR SELECT
  TO authenticated
  USING (is_golf_team_member(team_id));

CREATE POLICY "Coaches can manage qualifiers"
  ON golf_qualifiers FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- QUALIFIER ENTRIES POLICIES
-- ============================================================================

CREATE POLICY "Team members can view qualifier entries"
  ON golf_qualifier_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_qualifiers q
      WHERE q.id = golf_qualifier_entries.qualifier_id
      AND is_golf_team_member(q.team_id)
    )
  );

CREATE POLICY "Coaches can manage qualifier entries"
  ON golf_qualifier_entries FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_qualifiers q
      WHERE q.id = golf_qualifier_entries.qualifier_id
      AND is_golf_coach_of_team(q.team_id)
    )
  );

-- ============================================================================
-- ANNOUNCEMENTS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view announcements"
  ON golf_announcements FOR SELECT
  TO authenticated
  USING (is_golf_team_member(team_id));

CREATE POLICY "Coaches can manage announcements"
  ON golf_announcements FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- ANNOUNCEMENT ACKNOWLEDGEMENTS POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own acknowledgements"
  ON golf_announcement_acknowledgements FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id());

CREATE POLICY "Coaches can view acknowledgements"
  ON golf_announcement_acknowledgements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_announcements a
      WHERE a.id = golf_announcement_acknowledgements.announcement_id
      AND is_golf_coach_of_team(a.team_id)
    )
  );

-- ============================================================================
-- TASKS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view tasks"
  ON golf_tasks FOR SELECT
  TO authenticated
  USING (is_golf_team_member(team_id));

CREATE POLICY "Coaches can manage tasks"
  ON golf_tasks FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- TASK COMPLETIONS POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own task completions"
  ON golf_task_completions FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id());

CREATE POLICY "Coaches can view task completions"
  ON golf_task_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_tasks t
      WHERE t.id = golf_task_completions.task_id
      AND is_golf_coach_of_team(t.team_id)
    )
  );

-- ============================================================================
-- DOCUMENTS POLICIES
-- ============================================================================

CREATE POLICY "Team members can view team documents"
  ON golf_documents FOR SELECT
  TO authenticated
  USING (
    is_golf_team_member(team_id)
    AND (
      player_visible = true
      OR is_golf_coach_of_team(team_id)
    )
  );

CREATE POLICY "Coaches can manage documents"
  ON golf_documents FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- TRAVEL ITINERARIES POLICIES
-- ============================================================================

CREATE POLICY "Team members can view travel itineraries"
  ON golf_travel_itineraries FOR SELECT
  TO authenticated
  USING (is_golf_team_member(team_id));

CREATE POLICY "Coaches can manage travel itineraries"
  ON golf_travel_itineraries FOR ALL
  TO authenticated
  USING (is_golf_coach_of_team(team_id));

-- ============================================================================
-- COACH NOTES POLICIES
-- ============================================================================

CREATE POLICY "Coaches can manage own notes"
  ON golf_coach_notes FOR ALL
  TO authenticated
  USING (coach_id = get_golf_coach_id());

CREATE POLICY "Players can view shared notes about themselves"
  ON golf_coach_notes FOR SELECT
  TO authenticated
  USING (
    player_id = get_golf_player_id()
    AND shared_with_player = true
  );

-- ============================================================================
-- PLAYER CLASSES POLICIES
-- ============================================================================

CREATE POLICY "Players can manage own classes"
  ON golf_player_classes FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id());

CREATE POLICY "Coaches can view team player classes"
  ON golf_player_classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      WHERE p.id = golf_player_classes.player_id
      AND p.team_id IS NOT NULL
      AND is_golf_coach_of_team(p.team_id)
    )
  );
