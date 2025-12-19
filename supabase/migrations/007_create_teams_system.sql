-- Migration: Create complete teams system
-- Tables: teams, team_members, team_invitations, team_coach_staff

-- ==============================================
-- TEAMS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  team_type VARCHAR(20) NOT NULL CHECK (team_type IN ('high_school', 'showcase', 'juco', 'college', 'travel_ball')),
  season_year INTEGER,
  age_group VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(2),
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#16A34A',
  secondary_color VARCHAR(7),
  head_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for teams
CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_type ON teams(team_type);
CREATE INDEX idx_teams_coach ON teams(head_coach_id);
CREATE INDEX idx_teams_season ON teams(season_year) WHERE season_year IS NOT NULL;

-- ==============================================
-- TEAM MEMBERS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  jersey_number INTEGER,
  position VARCHAR(10),
  role VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'injured', 'alumni')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(team_id, player_id)
);

-- Indexes for team_members
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_player ON team_members(player_id);
CREATE INDEX idx_team_members_active ON team_members(team_id, status) WHERE status = 'active';
CREATE INDEX idx_team_members_player_active ON team_members(player_id, status) WHERE status = 'active';

-- ==============================================
-- TEAM INVITATIONS TABLE (Join Links)
-- ==============================================

CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invite_code VARCHAR(20) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for team_invitations
CREATE INDEX idx_team_invitations_code ON team_invitations(invite_code);
CREATE INDEX idx_team_invitations_team ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_active ON team_invitations(invite_code) WHERE is_active = TRUE;
CREATE INDEX idx_team_invitations_expires ON team_invitations(expires_at) WHERE expires_at IS NOT NULL;

-- ==============================================
-- TEAM COACH STAFF TABLE (Multiple coaches per team)
-- ==============================================

CREATE TABLE IF NOT EXISTS team_coach_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(team_id, coach_id)
);

-- Indexes for team_coach_staff
CREATE INDEX idx_team_staff_team ON team_coach_staff(team_id);
CREATE INDEX idx_team_staff_coach ON team_coach_staff(coach_id);
CREATE INDEX idx_team_staff_primary ON team_coach_staff(team_id, is_primary) WHERE is_primary = TRUE;

-- ==============================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coach_staff ENABLE ROW LEVEL SECURITY;

-- ===== TEAMS POLICIES =====

-- Teams: Viewable by members and coaches
CREATE POLICY "Team members can view team"
  ON teams
  FOR SELECT
  TO authenticated
  USING (
    -- Player is a member
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE tm.team_id = teams.id
        AND p.user_id = auth.uid()
        AND tm.status = 'active'
    )
    OR
    -- Coach is on staff
    EXISTS (
      SELECT 1 FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE tcs.team_id = teams.id
        AND c.user_id = auth.uid()
    )
    OR
    -- User is the head coach
    head_coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Head coaches can manage their teams
CREATE POLICY "Head coaches can manage their teams"
  ON teams
  FOR ALL
  TO authenticated
  USING (
    head_coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- ===== TEAM MEMBERS POLICIES =====

-- Team members viewable by team members and coaches
CREATE POLICY "Team members viewable by team"
  ON team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_members.team_id
      AND (
        -- User is head coach
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR
        -- User is on coaching staff
        EXISTS (
          SELECT 1 FROM team_coach_staff tcs
          JOIN coaches c ON c.id = tcs.coach_id
          WHERE tcs.team_id = t.id AND c.user_id = auth.uid()
        )
        OR
        -- User is a team member
        EXISTS (
          SELECT 1 FROM team_members tm2
          JOIN players p ON p.id = tm2.player_id
          WHERE tm2.team_id = t.id AND p.user_id = auth.uid() AND tm2.status = 'active'
        )
      )
    )
  );

-- Coaches can manage team members
CREATE POLICY "Coaches can manage team members"
  ON team_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_members.team_id
      AND (
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM team_coach_staff tcs
          JOIN coaches c ON c.id = tcs.coach_id
          WHERE tcs.team_id = t.id AND c.user_id = auth.uid()
        )
      )
    )
  );

-- ===== TEAM INVITATIONS POLICIES =====

-- Coaches can manage team invitations they created
CREATE POLICY "Coaches can manage team invitations"
  ON team_invitations
  FOR ALL
  TO authenticated
  USING (
    created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_invitations.team_id
      AND t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- Active invitations viewable by anyone with the code (for join flow)
CREATE POLICY "Active invitations viewable by code"
  ON team_invitations
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- ===== TEAM COACH STAFF POLICIES =====

-- Team staff viewable by team members and coaches
CREATE POLICY "Team staff viewable by team"
  ON team_coach_staff
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
      AND (
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM team_coach_staff tcs2
          JOIN coaches c ON c.id = tcs2.coach_id
          WHERE tcs2.team_id = t.id AND c.user_id = auth.uid()
        )
        OR
        EXISTS (
          SELECT 1 FROM team_members tm
          JOIN players p ON p.id = tm.player_id
          WHERE tm.team_id = t.id AND p.user_id = auth.uid() AND tm.status = 'active'
        )
      )
    )
  );

-- Head coaches can manage team staff
CREATE POLICY "Head coaches can manage team staff"
  ON team_coach_staff
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
      AND t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- ==============================================
-- TRIGGERS
-- ==============================================

-- Trigger for teams updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for team_members updated_at
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for team_coach_staff updated_at
CREATE TRIGGER update_team_coach_staff_updated_at
  BEFORE UPDATE ON team_coach_staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE teams IS 'Teams represent groups of players (HS, Showcase, JUCO, College, Travel Ball)';
COMMENT ON TABLE team_members IS 'Players membership in teams - supports multi-team for HS+Showcase players';
COMMENT ON TABLE team_invitations IS 'Join link system for coaches to invite players to teams';
COMMENT ON TABLE team_coach_staff IS 'Multiple coaches can be on staff for a single team';
