-- PROFILE_CUSTOMIZATION_SCHEMA.sql
-- Add these tables and columns to support profile customization and privacy toggles

-- ============================================
-- PLAYER PROFILE SETTINGS (extends player_settings)
-- ============================================

ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_full_name BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_location BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_school BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_contact_email BOOLEAN DEFAULT false;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT false;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_social_links BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_height_weight BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_position BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_grad_year BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_bats_throws BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_videos BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_dream_schools BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_calendar BOOLEAN DEFAULT false;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_stats BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_gpa BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_test_scores BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS allow_messages BOOLEAN DEFAULT true;
ALTER TABLE player_settings ADD COLUMN IF NOT EXISTS show_in_discover BOOLEAN DEFAULT true;

-- ============================================
-- PLAYER DREAM SCHOOLS
-- ============================================

CREATE TABLE IF NOT EXISTS player_dream_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  college_program_id UUID REFERENCES college_programs(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, rank),
  UNIQUE(player_id, college_program_id)
);

CREATE INDEX idx_dream_schools_player ON player_dream_schools(player_id);

-- ============================================
-- PROGRAM/ORGANIZATION SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  
  -- Program Info Visibility
  show_description BOOLEAN DEFAULT true,
  show_program_stats BOOLEAN DEFAULT true,
  show_conference_info BOOLEAN DEFAULT true,
  show_facilities BOOLEAN DEFAULT true,
  show_commitments BOOLEAN DEFAULT true,
  
  -- Staff Visibility
  show_staff_bios BOOLEAN DEFAULT true,
  show_staff_photos BOOLEAN DEFAULT true,
  show_recruiting_indicators BOOLEAN DEFAULT true,
  
  -- Contact Visibility
  show_email BOOLEAN DEFAULT true,
  show_phone BOOLEAN DEFAULT true,
  show_social_links BOOLEAN DEFAULT true,
  
  -- Features
  show_camps BOOLEAN DEFAULT true,
  show_calendar BOOLEAN DEFAULT false,
  allow_player_messages BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORGANIZATION STAFF MEMBERS
-- ============================================

CREATE TABLE IF NOT EXISTS organization_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL, -- Link to coach if they have account
  
  -- Staff Info
  name TEXT NOT NULL,
  title TEXT NOT NULL, -- 'Head Coach', 'Pitching Coach', 'Recruiting Coordinator'
  bio TEXT,
  headshot_url TEXT,
  email TEXT,
  phone TEXT,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_staff_org ON organization_staff(organization_id);

-- ============================================
-- ORGANIZATION FACILITIES
-- ============================================

CREATE TABLE IF NOT EXISTS organization_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  facility_type TEXT, -- 'stadium', 'indoor', 'weight_room', 'locker_room'
  description TEXT,
  capacity TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facilities_org ON organization_facilities(organization_id);

-- ============================================
-- ORGANIZATION MEDIA/PHOTOS
-- ============================================

CREATE TABLE IF NOT EXISTS organization_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  media_type TEXT NOT NULL, -- 'cover_photo', 'gallery', 'logo'
  url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_media_org ON organization_media(organization_id);

-- ============================================
-- PLAYER VERIFIED STATS
-- ============================================

CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  
  -- Source
  source TEXT, -- 'PBR', 'Perfect Game', 'self', 'coach'
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  season TEXT, -- '2024 Fall', '2024 Spring'
  
  -- Pitching Stats
  fb_velo_low INTEGER,
  fb_velo_high INTEGER,
  fb_velo_avg DECIMAL(4,1),
  breaking_velo INTEGER,
  changeup_velo INTEGER,
  era DECIMAL(4,2),
  wins INTEGER,
  losses INTEGER,
  saves INTEGER,
  innings_pitched DECIMAL(5,1),
  strikeouts INTEGER,
  walks INTEGER,
  whip DECIMAL(4,2),
  
  -- Hitting Stats
  batting_avg DECIMAL(4,3),
  on_base_pct DECIMAL(4,3),
  slugging_pct DECIMAL(4,3),
  home_runs INTEGER,
  rbis INTEGER,
  stolen_bases INTEGER,
  hits INTEGER,
  at_bats INTEGER,
  
  -- Running/Athletic
  sixty_yard DECIMAL(4,2),
  ten_yard_split DECIMAL(4,2),
  
  -- Fielding
  pop_time DECIMAL(4,2), -- Catchers
  inf_velo INTEGER, -- Infield throw velocity
  of_velo INTEGER, -- Outfield throw velocity
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_player_stats_player ON player_stats(player_id);

-- ============================================
-- CALENDAR EVENTS (Enhanced)
-- ============================================

-- Add columns to existing events table or create new one
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_category TEXT; -- 'practice', 'game', 'camp', 'visit', 'showcase'
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS practice_plan_id UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT; -- iCal RRULE for recurring events
ALTER TABLE events ADD COLUMN IF NOT EXISTS notify_team BOOLEAN DEFAULT false;

-- ============================================
-- PRACTICE PLANS
-- ============================================

CREATE TABLE IF NOT EXISTS practice_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES coaches(id),
  
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER,
  
  -- Plan Content (JSON array of activities)
  activities JSONB DEFAULT '[]',
  -- Example: [{"name": "Warm Up", "duration": 15, "description": "..."}, ...]
  
  -- Status
  is_template BOOLEAN DEFAULT false, -- Save as reusable template
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_practice_plans_team ON practice_plans(team_id);

-- ============================================
-- COMMITMENTS (for programs to display)
-- ============================================

CREATE TABLE IF NOT EXISTS program_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL, -- Link if player is on platform
  
  -- Player Info (for players not on platform)
  player_name TEXT NOT NULL,
  position TEXT,
  grad_year INTEGER,
  high_school TEXT,
  city TEXT,
  state TEXT,
  
  -- Commitment Details
  commitment_date DATE,
  is_signed BOOLEAN DEFAULT false,
  signed_date DATE,
  
  -- Display
  is_public BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commitments_org ON program_commitments(organization_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Player settings - players can only see/edit their own
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own settings" ON player_settings
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can update own settings" ON player_settings
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Organization settings - coaches of org can edit
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view org settings" ON organization_settings
  FOR SELECT USING (true);

CREATE POLICY "Org coaches can update settings" ON organization_settings
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Dream schools - players can manage their own
ALTER TABLE player_dream_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dream schools if player allows" ON player_dream_schools
  FOR SELECT USING (true); -- Filtered in app based on player_settings.show_dream_schools

CREATE POLICY "Players can manage own dream schools" ON player_dream_schools
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
