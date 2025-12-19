-- Migration: Create events and camps tables
-- Tables: events, camps, camp_registrations

-- ==============================================
-- EVENTS TABLE (Games, showcases, tournaments)
-- ==============================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

  -- Event details
  name TEXT NOT NULL,
  description TEXT,

  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'game',
    'showcase',
    'tournament',
    'camp',
    'combine',
    'tryout',
    'practice',
    'other'
  )),

  -- Date/time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  is_all_day BOOLEAN DEFAULT FALSE,

  -- Location
  location_venue VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,

  -- Game-specific fields
  opponent VARCHAR(255),
  home_away VARCHAR(10) CHECK (home_away IN ('home', 'away', 'neutral')),
  result VARCHAR(1) CHECK (result IN ('W', 'L', 'T')),
  score_us INTEGER,
  score_them INTEGER,

  -- Classification
  level VARCHAR(50),

  -- Visibility
  is_public BOOLEAN DEFAULT TRUE,

  notes TEXT,

  created_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for events
CREATE INDEX idx_events_org ON events(organization_id);
CREATE INDEX idx_events_team ON events(team_id);
CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_team_start ON events(team_id, start_time) WHERE team_id IS NOT NULL;
CREATE INDEX idx_events_public ON events(start_time) WHERE is_public = TRUE;
CREATE INDEX idx_events_created_by ON events(created_by) WHERE created_by IS NOT NULL;

-- ==============================================
-- CAMPS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Date/time
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,

  -- Location
  location VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,

  -- Registration
  capacity INTEGER,
  registration_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,
  price DECIMAL(8,2),

  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft',
    'published',
    'open',
    'limited',
    'full',
    'cancelled',
    'completed'
  )),

  registration_deadline DATE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for camps
CREATE INDEX idx_camps_coach ON camps(coach_id);
CREATE INDEX idx_camps_org ON camps(organization_id);
CREATE INDEX idx_camps_date ON camps(start_date);
CREATE INDEX idx_camps_status ON camps(status);
CREATE INDEX idx_camps_published ON camps(start_date) WHERE status IN ('published', 'open', 'limited');
CREATE INDEX idx_camps_state ON camps(location_state) WHERE location_state IS NOT NULL;

-- ==============================================
-- CAMP REGISTRATIONS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS camp_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  status VARCHAR(20) DEFAULT 'interested' CHECK (status IN (
    'interested',
    'registered',
    'confirmed',
    'attended',
    'no_show',
    'cancelled'
  )),

  registered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(camp_id, player_id)
);

-- Indexes for camp_registrations
CREATE INDEX idx_camp_reg_camp ON camp_registrations(camp_id);
CREATE INDEX idx_camp_reg_player ON camp_registrations(player_id);
CREATE INDEX idx_camp_reg_status ON camp_registrations(status);
CREATE INDEX idx_camp_reg_camp_status ON camp_registrations(camp_id, status);
CREATE INDEX idx_camp_reg_player_status ON camp_registrations(player_id, status);

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_registrations ENABLE ROW LEVEL SECURITY;

-- ===== EVENTS POLICIES =====

-- Public events viewable by all
CREATE POLICY "Public events viewable by all"
  ON events
  FOR SELECT
  TO authenticated
  USING (is_public = TRUE);

-- Team events viewable by team members
CREATE POLICY "Team events viewable by team"
  ON events
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT tm.team_id
      FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE p.user_id = auth.uid() AND tm.status = 'active'
    )
    OR team_id IN (
      SELECT tcs.team_id
      FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
    )
    OR team_id IN (
      SELECT t.id
      FROM teams t
      WHERE t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- Coaches can manage events they created
CREATE POLICY "Coaches can manage own events"
  ON events
  FOR ALL
  TO authenticated
  USING (
    created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Head coaches can manage team events
CREATE POLICY "Head coaches can manage team events"
  ON events
  FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT t.id
      FROM teams t
      WHERE t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- ===== CAMPS POLICIES =====

-- Coaches can manage own camps
CREATE POLICY "Coaches can manage own camps"
  ON camps
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Published camps viewable by all
CREATE POLICY "Published camps viewable by all"
  ON camps
  FOR SELECT
  TO authenticated
  USING (
    status IN ('published', 'open', 'limited', 'full')
  );

-- ===== CAMP REGISTRATIONS POLICIES =====

-- Players can manage own registrations
CREATE POLICY "Players can manage own registrations"
  ON camp_registrations
  FOR ALL
  TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can view registrations for their camps
CREATE POLICY "Coaches can view registrations for their camps"
  ON camp_registrations
  FOR SELECT
  TO authenticated
  USING (
    camp_id IN (
      SELECT id FROM camps
      WHERE coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- Coaches can update registration status
CREATE POLICY "Coaches can update registrations for their camps"
  ON camp_registrations
  FOR UPDATE
  TO authenticated
  USING (
    camp_id IN (
      SELECT id FROM camps
      WHERE coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- ==============================================
-- TRIGGERS
-- ==============================================

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_camps_updated_at
  BEFORE UPDATE ON camps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_camp_registrations_updated_at
  BEFORE UPDATE ON camp_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==============================================
-- CAMP REGISTRATION COUNT TRIGGERS
-- ==============================================

-- Function to update camp counts
CREATE OR REPLACE FUNCTION update_camp_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'interested' THEN
      UPDATE camps SET interested_count = interested_count + 1 WHERE id = NEW.camp_id;
    ELSIF NEW.status IN ('registered', 'confirmed') THEN
      UPDATE camps SET registration_count = registration_count + 1 WHERE id = NEW.camp_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Moving from interested to registered
    IF OLD.status = 'interested' AND NEW.status IN ('registered', 'confirmed') THEN
      UPDATE camps SET
        interested_count = interested_count - 1,
        registration_count = registration_count + 1
      WHERE id = NEW.camp_id;
    -- Moving from registered to cancelled
    ELSIF OLD.status IN ('registered', 'confirmed') AND NEW.status = 'cancelled' THEN
      UPDATE camps SET registration_count = registration_count - 1 WHERE id = NEW.camp_id;
    -- Moving from interested to cancelled
    ELSIF OLD.status = 'interested' AND NEW.status = 'cancelled' THEN
      UPDATE camps SET interested_count = interested_count - 1 WHERE id = NEW.camp_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'interested' THEN
      UPDATE camps SET interested_count = interested_count - 1 WHERE id = OLD.camp_id;
    ELSIF OLD.status IN ('registered', 'confirmed') THEN
      UPDATE camps SET registration_count = registration_count - 1 WHERE id = OLD.camp_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for camp registration counts
CREATE TRIGGER camp_registration_counts
  AFTER INSERT OR UPDATE OR DELETE ON camp_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_camp_counts();

-- Auto-update camp status based on capacity
CREATE OR REPLACE FUNCTION update_camp_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capacity IS NOT NULL THEN
    IF NEW.registration_count >= NEW.capacity THEN
      NEW.status = 'full';
    ELSIF NEW.registration_count >= (NEW.capacity * 0.9) THEN
      NEW.status = 'limited';
    ELSIF NEW.status IN ('full', 'limited') AND NEW.registration_count < (NEW.capacity * 0.9) THEN
      NEW.status = 'open';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_camp_status
  BEFORE UPDATE ON camps
  FOR EACH ROW
  WHEN (NEW.registration_count IS DISTINCT FROM OLD.registration_count)
  EXECUTE FUNCTION update_camp_status();

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE events IS 'Games, showcases, tournaments, practices, and other events';
COMMENT ON TABLE camps IS 'Camps hosted by coaches for recruiting and skill development';
COMMENT ON TABLE camp_registrations IS 'Player registrations and attendance for camps';
