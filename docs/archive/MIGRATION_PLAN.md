# Database Migration Plan: Current Schema → Full SCHEMA.md
**Project:** Helm Sports Labs
**Date:** December 17, 2024
**Goal:** Align database with comprehensive SCHEMA.md specification

---

## Overview

This document outlines the step-by-step migration from the current simplified schema (`001_schema.sql`) to the full specification defined in `SCHEMA.md`. The migration is designed to be **incremental, non-breaking, and production-safe**.

---

## Migration Strategy

### Approach: **Incremental Feature-Based Migration**

We'll migrate in **phases**, each representing a cohesive feature set. Each phase:
- ✅ Can be deployed independently
- ✅ Maintains backward compatibility
- ✅ Includes RLS policies and indexes
- ✅ Updates TypeScript types
- ✅ Includes rollback procedures

### Timeline Estimate
- **Phase 1:** 1-2 days (Foundation)
- **Phase 2:** 2-3 days (Player Enhancements)
- **Phase 3:** 2-3 days (Team Management)
- **Phase 4:** 2-3 days (Events & Camps)
- **Phase 5:** 1-2 days (Analytics Enhancement)
- **Phase 6:** 1-2 days (Video Enhancement)

**Total:** ~2 weeks for complete migration

---

## Phase 1: Foundation & Organizations (Priority: CRITICAL)

### Objective
Create the unified `organizations` table and migrate away from separate `colleges` and `high_schools` tables.

### New Tables

#### 1.1 Create `organizations` Table
```sql
-- Migration: 005_organizations.sql

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball')),
  division TEXT,  -- D1, D2, D3, NAIA, JUCO
  conference TEXT,
  location_city TEXT,
  location_state VARCHAR(2),
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  description TEXT,
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_state ON organizations(location_state);
CREATE INDEX idx_organizations_division ON organizations(division);
CREATE INDEX idx_organizations_name_trgm ON organizations USING gin(name gin_trgm_ops);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Organizations are publicly readable
CREATE POLICY "Organizations are viewable by all" ON organizations
  FOR SELECT TO authenticated USING (true);

-- Admins can manage organizations (add later)
-- CREATE POLICY "Admins can manage organizations" ON organizations
--   FOR ALL USING (auth.jwt()->>'role' = 'admin');
```

#### 1.2 Migrate Data from colleges → organizations
```sql
-- Migration: 006_migrate_colleges_to_organizations.sql

INSERT INTO organizations (
  id, name, type, division, conference,
  location_city, location_state, logo_url, website_url,
  created_at
)
SELECT
  id,
  name,
  'college'::text,
  division,
  conference,
  city,
  state,
  logo_url,
  website,
  created_at
FROM colleges;

-- Update coaches to reference organizations
ALTER TABLE coaches ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

UPDATE coaches
SET organization_id = college_id
WHERE college_id IS NOT NULL;

-- Keep college_id for backward compatibility (mark as deprecated)
-- Can remove in Phase 7 cleanup
```

#### 1.3 Migrate Data from high_schools → organizations
```sql
INSERT INTO organizations (
  id, name, type, location_city, location_state, created_at
)
SELECT
  id,
  name,
  'high_school'::text,
  city,
  state,
  created_at
FROM high_schools;

-- Update players to reference organizations
ALTER TABLE players ADD COLUMN high_school_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

UPDATE players
SET high_school_org_id = high_school_id
WHERE high_school_id IS NOT NULL;

-- Keep high_school_id for backward compatibility
```

#### 1.4 Add Missing Coach Fields
```sql
-- Migration: 007_enhance_coaches.sql

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS athletic_conference VARCHAR(100);
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS program_philosophy TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS program_values TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS what_we_look_for TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Migrate conference → athletic_conference
UPDATE coaches SET athletic_conference = conference WHERE conference IS NOT NULL;
-- Keep 'conference' column for backward compatibility

-- Add trigger if missing
CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### 1.5 Update TypeScript Types
```typescript
// types/database.ts additions

export type OrganizationType = 'college' | 'high_school' | 'juco' | 'showcase_org' | 'travel_ball';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  division: string | null;
  conference: string | null;
  location_city: string | null;
  location_state: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  description: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
  updated_at: string;
}

// Update Coach interface
export interface Coach {
  // ... existing fields
  organization_id: string | null;
  organization_name: string | null;
  athletic_conference: string | null;
  program_philosophy: string | null;
  program_values: string | null;
  what_we_look_for: string | null;
  logo_url: string | null;
  secondary_color: string | null;
  onboarding_step: number;
}
```

### Rollback Procedure
```sql
-- Rollback: Remove new columns, keep old structure
ALTER TABLE coaches DROP COLUMN IF EXISTS organization_id;
ALTER TABLE players DROP COLUMN IF EXISTS high_school_org_id;
DROP TABLE IF EXISTS organizations;
```

---

## Phase 2: Player Enhancements (Priority: HIGH)

### Objective
Add player-centric features: settings, metrics, achievements, stats, evaluations.

### New Tables

#### 2.1 Create `player_settings`
```sql
-- Migration: 008_player_settings.sql

CREATE TABLE player_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE UNIQUE,

  -- Privacy
  is_discoverable BOOLEAN DEFAULT TRUE,
  show_gpa BOOLEAN DEFAULT FALSE,
  show_test_scores BOOLEAN DEFAULT FALSE,
  show_contact_info BOOLEAN DEFAULT FALSE,
  show_location BOOLEAN DEFAULT TRUE,

  -- Notifications
  notify_on_eval BOOLEAN DEFAULT TRUE,
  notify_on_interest BOOLEAN DEFAULT TRUE,
  notify_on_message BOOLEAN DEFAULT TRUE,
  notify_on_watchlist_add BOOLEAN DEFAULT TRUE,
  notify_on_profile_view BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_settings_player ON player_settings(player_id);

-- RLS
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own settings" ON player_settings
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Create default settings for existing players
INSERT INTO player_settings (player_id)
SELECT id FROM players
ON CONFLICT (player_id) DO NOTHING;
```

#### 2.2 Create `player_metrics`
```sql
-- Migration: 009_player_metrics.sql

CREATE TABLE player_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  metric_label VARCHAR(100) NOT NULL,
  metric_value VARCHAR(50) NOT NULL,
  metric_type VARCHAR(50),  -- 'hitting', 'pitching', 'fielding', 'running'

  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  verified_date TIMESTAMPTZ,

  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX idx_player_metrics_type ON player_metrics(metric_type);

-- RLS
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own metrics" ON player_metrics
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Public metrics viewable" ON player_metrics
  FOR SELECT TO authenticated USING (true);
```

#### 2.3 Create `player_achievements`
```sql
-- Migration: 010_player_achievements.sql

CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  achievement_text TEXT NOT NULL,
  achievement_type VARCHAR(50),
  achievement_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_achievements_player ON player_achievements(player_id);

-- RLS
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own achievements" ON player_achievements
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Public achievements viewable" ON player_achievements
  FOR SELECT TO authenticated USING (true);
```

#### 2.4 Create `recruiting_interests`
```sql
-- Migration: 011_recruiting_interests.sql

CREATE TABLE recruiting_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  school_name TEXT NOT NULL,
  conference TEXT,
  division TEXT,

  status VARCHAR(30) NOT NULL DEFAULT 'interested'
    CHECK (status IN (
      'interested', 'contacted', 'questionnaire',
      'unofficial_visit', 'official_visit',
      'offer', 'verbal', 'signed', 'declined'
    )),
  interest_level VARCHAR(10) CHECK (interest_level IN ('low', 'medium', 'high')),

  coach_name TEXT,
  notes TEXT,
  last_contact_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(player_id, organization_id)
);

CREATE INDEX idx_recruiting_player ON recruiting_interests(player_id);
CREATE INDEX idx_recruiting_status ON recruiting_interests(status);
CREATE INDEX idx_recruiting_org ON recruiting_interests(organization_id);

-- RLS
ALTER TABLE recruiting_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own interests" ON recruiting_interests
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
```

#### 2.5 Create `player_stats`
```sql
-- Migration: 012_player_stats.sql

CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id UUID,  -- Will reference events table in Phase 4

  stat_type VARCHAR(50) NOT NULL,
  stat_date DATE,
  opponent VARCHAR(255),
  source VARCHAR(100),

  -- Baseball Hitting
  at_bats INTEGER,
  hits INTEGER,
  singles INTEGER,
  doubles INTEGER,
  triples INTEGER,
  home_runs INTEGER,
  rbis INTEGER,
  runs INTEGER,
  stolen_bases INTEGER,
  caught_stealing INTEGER,
  walks INTEGER,
  strikeouts INTEGER,
  hit_by_pitch INTEGER,
  sacrifice_flies INTEGER,
  batting_avg DECIMAL(4,3),
  on_base_pct DECIMAL(4,3),
  slugging_pct DECIMAL(4,3),

  -- Pitching
  innings_pitched DECIMAL(4,1),
  pitches_thrown INTEGER,
  strikes INTEGER,
  balls INTEGER,
  strikeouts_pitched INTEGER,
  walks_allowed INTEGER,
  hits_allowed INTEGER,
  runs_allowed INTEGER,
  earned_runs INTEGER,
  home_runs_allowed INTEGER,
  era DECIMAL(5,2),
  whip DECIMAL(4,2),

  -- Fielding
  putouts INTEGER,
  assists INTEGER,
  errors INTEGER,
  fielding_pct DECIMAL(4,3),

  recorded_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_stats_player ON player_stats(player_id);
CREATE INDEX idx_player_stats_date ON player_stats(stat_date);
CREATE INDEX idx_player_stats_type ON player_stats(stat_type);

-- RLS
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own stats" ON player_stats
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view player stats" ON player_stats
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM watchlists rw
        WHERE rw.coach_id = c.id AND rw.player_id = player_stats.player_id
      )
    )
  );
```

#### 2.6 Create `evaluations`
```sql
-- Migration: 013_evaluations.sql

CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  event_id UUID,  -- Will reference events table in Phase 4

  evaluator_name TEXT,
  eval_date DATE DEFAULT CURRENT_DATE,

  -- Grades (0-100 scale, 80 = MLB average)
  overall_grade INTEGER CHECK (overall_grade >= 0 AND overall_grade <= 100),
  arm_grade INTEGER CHECK (arm_grade >= 0 AND arm_grade <= 100),
  bat_grade INTEGER CHECK (bat_grade >= 0 AND bat_grade <= 100),
  speed_grade INTEGER CHECK (speed_grade >= 0 AND speed_grade <= 100),
  fielding_grade INTEGER CHECK (fielding_grade >= 0 AND fielding_grade <= 100),
  baseball_iq_grade INTEGER CHECK (baseball_iq_grade >= 0 AND baseball_iq_grade <= 100),

  strengths TEXT,
  areas_to_improve TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  is_public BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_evaluations_player ON evaluations(player_id);
CREATE INDEX idx_evaluations_evaluator ON evaluations(evaluator_id);
CREATE INDEX idx_evaluations_public ON evaluations(is_public) WHERE is_public = TRUE;

-- RLS
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own evaluations" ON evaluations
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can manage own evaluations" ON evaluations
  FOR ALL USING (
    evaluator_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Public evaluations viewable" ON evaluations
  FOR SELECT TO authenticated USING (is_public = true);
```

#### 2.7 Add Missing Player Fields
```sql
-- Migration: 014_enhance_players.sql

ALTER TABLE players ADD COLUMN IF NOT EXISTS showcase_team_name VARCHAR(255);
ALTER TABLE players ADD COLUMN IF NOT EXISTS showcase_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS highlight_url TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS verified_metrics BOOLEAN DEFAULT FALSE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS primary_goal VARCHAR(50);
ALTER TABLE players ADD COLUMN IF NOT EXISTS top_schools TEXT[];
ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_activated_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS committed_to_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Generate full_name column
ALTER TABLE players ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
  GENERATED ALWAYS AS (
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
  ) STORED;

-- Migrate committed_to → committed_to_org_id
UPDATE players
SET committed_to_org_id = committed_to
WHERE committed_to IS NOT NULL;
```

#### 2.8 Update TypeScript Types
```typescript
// Add to types/database.ts

export interface PlayerSettings {
  id: string;
  player_id: string;
  is_discoverable: boolean;
  show_gpa: boolean;
  show_test_scores: boolean;
  show_contact_info: boolean;
  show_location: boolean;
  notify_on_eval: boolean;
  notify_on_interest: boolean;
  notify_on_message: boolean;
  notify_on_watchlist_add: boolean;
  notify_on_profile_view: boolean;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayerMetric {
  id: string;
  player_id: string;
  metric_label: string;
  metric_value: string;
  metric_type: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_date: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerAchievement {
  id: string;
  player_id: string;
  achievement_text: string;
  achievement_type: string | null;
  achievement_date: string | null;
  created_at: string;
  updated_at: string;
}

export type RecruitingStatus = 'interested' | 'contacted' | 'questionnaire' |
  'unofficial_visit' | 'official_visit' | 'offer' | 'verbal' | 'signed' | 'declined';

export interface RecruitingInterest {
  id: string;
  player_id: string;
  organization_id: string | null;
  school_name: string;
  conference: string | null;
  division: string | null;
  status: RecruitingStatus;
  interest_level: 'low' | 'medium' | 'high' | null;
  coach_name: string | null;
  notes: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerStats {
  id: string;
  player_id: string;
  event_id: string | null;
  stat_type: string;
  stat_date: string | null;
  opponent: string | null;
  source: string | null;
  // ... all stat fields
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  player_id: string;
  evaluator_id: string | null;
  event_id: string | null;
  evaluator_name: string | null;
  eval_date: string;
  overall_grade: number | null;
  arm_grade: number | null;
  bat_grade: number | null;
  speed_grade: number | null;
  fielding_grade: number | null;
  baseball_iq_grade: number | null;
  strengths: string | null;
  areas_to_improve: string | null;
  notes: string | null;
  tags: string[] | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Update Player interface
export interface Player {
  // ... existing fields
  full_name: string | null;
  high_school_org_id: string | null;
  showcase_team_name: string | null;
  showcase_org_id: string | null;
  college_org_id: string | null;
  highlight_url: string | null;
  verified_metrics: boolean;
  primary_goal: string | null;
  top_schools: string[] | null;
  recruiting_activated_at: string | null;
  committed_to_org_id: string | null;
  onboarding_step: number;
}
```

### Rollback Procedure
```sql
DROP TABLE IF EXISTS evaluations;
DROP TABLE IF EXISTS player_stats;
DROP TABLE IF EXISTS recruiting_interests;
DROP TABLE IF EXISTS player_achievements;
DROP TABLE IF EXISTS player_metrics;
DROP TABLE IF EXISTS player_settings;
```

---

## Phase 3: Team Management (Priority: MEDIUM)

### Objective
Add complete team management system for coaches.

### New Tables

#### 3.1 Create `teams`
```sql
-- Migration: 015_teams.sql

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  team_type VARCHAR(20) NOT NULL
    CHECK (team_type IN ('high_school', 'showcase', 'juco', 'college', 'travel_ball')),

  season_year INTEGER,
  age_group VARCHAR(20),

  city VARCHAR(100),
  state VARCHAR(2),

  logo_url TEXT,
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7),

  head_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_type ON teams(team_type);
CREATE INDEX idx_teams_coach ON teams(head_coach_id);

-- RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members and coaches can view team" ON teams
  FOR SELECT TO authenticated USING (
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE tm.team_id = teams.id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE tcs.team_id = teams.id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Head coaches can manage their teams" ON teams
  FOR ALL USING (
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

#### 3.2 Create `team_members`
```sql
-- Migration: 016_team_members.sql

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  jersey_number INTEGER,
  position VARCHAR(10),
  role VARCHAR(50),

  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'injured', 'alumni')),

  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(team_id, player_id)
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_player ON team_members(player_id);
CREATE INDEX idx_team_members_active ON team_members(team_id, status) WHERE status = 'active';

-- RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members viewable by team" ON team_members
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_members.team_id
      AND (
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM team_coach_staff tcs
          JOIN coaches c ON c.id = tcs.coach_id
          WHERE tcs.team_id = t.id AND c.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM team_members tm2
          JOIN players p ON p.id = tm2.player_id
          WHERE tm2.team_id = t.id AND p.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Coaches can manage team members" ON team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_members.team_id
      AND (
        t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM team_coach_staff tcs
          JOIN coaches c ON c.id = tcs.coach_id
          WHERE tcs.team_id = t.id AND c.user_id = auth.uid()
        )
      )
    )
  );
```

#### 3.3 Create `team_invitations`
```sql
-- Migration: 017_team_invitations.sql

CREATE TABLE team_invitations (
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

CREATE INDEX idx_team_invitations_code ON team_invitations(invite_code);
CREATE INDEX idx_team_invitations_team ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_active ON team_invitations(invite_code) WHERE is_active = TRUE;

-- RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage team invitations" ON team_invitations
  FOR ALL USING (
    created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone can view active invitations" ON team_invitations
  FOR SELECT USING (is_active = TRUE);
```

#### 3.4 Create `team_coach_staff`
```sql
-- Migration: 018_team_coach_staff.sql

CREATE TABLE team_coach_staff (
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

CREATE INDEX idx_team_staff_team ON team_coach_staff(team_id);
CREATE INDEX idx_team_staff_coach ON team_coach_staff(coach_id);

-- RLS
ALTER TABLE team_coach_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff viewable by team" ON team_coach_staff
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
    )
  );

CREATE POLICY "Head coaches can manage staff" ON team_coach_staff
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_coach_staff.team_id
      AND t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );
```

#### 3.5 Create `developmental_plans`
```sql
-- Migration: 019_developmental_plans.sql

CREATE TABLE developmental_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

  title VARCHAR(255) NOT NULL,
  description TEXT,

  start_date DATE,
  end_date DATE,

  goals JSONB DEFAULT '[]',
  drills JSONB DEFAULT '[]',
  notes TEXT,

  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'in_progress', 'completed', 'archived')),
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_dev_plans_coach ON developmental_plans(coach_id);
CREATE INDEX idx_dev_plans_player ON developmental_plans(player_id);
CREATE INDEX idx_dev_plans_team ON developmental_plans(team_id);

-- RLS
ALTER TABLE developmental_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own plans" ON developmental_plans
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can view their plans" ON developmental_plans
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
```

#### 3.6 Create `coach_notes`
```sql
-- Migration: 020_coach_notes.sql

CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  note_content TEXT NOT NULL,
  is_private BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_coach_notes_coach ON coach_notes(coach_id);
CREATE INDEX idx_coach_notes_player ON coach_notes(player_id);
CREATE INDEX idx_coach_notes_coach_player ON coach_notes(coach_id, player_id);

-- RLS
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own notes" ON coach_notes
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

#### 3.7 Create `coach_calendar_events`
```sql
-- Migration: 021_coach_calendar_events.sql

CREATE TABLE coach_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) CHECK (event_type IN ('camp', 'evaluation', 'visit', 'game', 'practice', 'meeting', 'other')),

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  is_all_day BOOLEAN DEFAULT FALSE,

  location VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),

  recurrence_rule TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_calendar_coach ON coach_calendar_events(coach_id);
CREATE INDEX idx_calendar_start ON coach_calendar_events(start_time);
CREATE INDEX idx_calendar_coach_range ON coach_calendar_events(coach_id, start_time, end_time);

-- RLS
ALTER TABLE coach_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own calendar" ON coach_calendar_events
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

### TypeScript Types (Add to database.ts)
```typescript
export interface Team {
  id: string;
  organization_id: string | null;
  name: string;
  team_type: string;
  season_year: number | null;
  age_group: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  head_coach_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  role: string | null;
  status: 'active' | 'inactive' | 'injured' | 'alumni';
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  player?: Player;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  invite_code: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

export interface TeamCoachStaff {
  id: string;
  team_id: string;
  coach_id: string;
  role: string | null;
  is_primary: boolean;
  joined_at: string;
  created_at: string;
  updated_at: string;
  coach?: Coach;
}

export interface DevelopmentalPlan {
  id: string;
  coach_id: string;
  player_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: any[];
  drills: any[];
  notes: string | null;
  status: 'draft' | 'sent' | 'in_progress' | 'completed' | 'archived';
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachNote {
  id: string;
  coach_id: string;
  player_id: string;
  note_content: string;
  is_private: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CoachCalendarEvent {
  id: string;
  coach_id: string;
  title: string;
  description: string | null;
  event_type: 'camp' | 'evaluation' | 'visit' | 'game' | 'practice' | 'meeting' | 'other' | null;
  start_time: string;
  end_time: string | null;
  timezone: string;
  is_all_day: boolean;
  location: string | null;
  location_city: string | null;
  location_state: string | null;
  recurrence_rule: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Phase 4: Events & Camps (Priority: MEDIUM)

### Objective
Add event management and camp hosting capabilities.

### New Tables

#### 4.1 Create `events`
```sql
-- Migration: 022_events.sql

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT,

  event_type VARCHAR(50) NOT NULL
    CHECK (event_type IN ('game', 'showcase', 'tournament', 'camp', 'combine', 'tryout', 'practice', 'other')),

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  is_all_day BOOLEAN DEFAULT FALSE,

  location_venue VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,

  opponent VARCHAR(255),
  home_away VARCHAR(10) CHECK (home_away IN ('home', 'away', 'neutral')),
  result VARCHAR(1) CHECK (result IN ('W', 'L', 'T')),
  score_us INTEGER,
  score_them INTEGER,

  level VARCHAR(50),
  is_public BOOLEAN DEFAULT TRUE,
  notes TEXT,

  created_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_events_org ON events(organization_id);
CREATE INDEX idx_events_team ON events(team_id);
CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_type ON events(event_type);

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public events viewable by all" ON events
  FOR SELECT USING (is_public = TRUE);

CREATE POLICY "Team events viewable by team" ON events
  FOR SELECT USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE p.user_id = auth.uid()
    )
    OR team_id IN (
      SELECT t.id FROM teams t
      WHERE t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Coaches can manage events they created" ON events
  FOR ALL USING (
    created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

#### 4.2 Create `camps`
```sql
-- Migration: 023_camps.sql

CREATE TABLE camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,

  location VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,

  capacity INTEGER,
  registration_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,

  price DECIMAL(8,2),

  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'open', 'limited', 'full', 'cancelled', 'completed')),

  registration_deadline DATE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_camps_coach ON camps(coach_id);
CREATE INDEX idx_camps_org ON camps(organization_id);
CREATE INDEX idx_camps_date ON camps(start_date);
CREATE INDEX idx_camps_status ON camps(status);

-- RLS
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published camps viewable by all" ON camps
  FOR SELECT USING (
    status IN ('published', 'open', 'limited', 'full')
    OR coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can manage own camps" ON camps
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

#### 4.3 Create `camp_registrations`
```sql
-- Migration: 024_camp_registrations.sql

CREATE TABLE camp_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  status VARCHAR(20) DEFAULT 'interested'
    CHECK (status IN ('interested', 'registered', 'confirmed', 'attended', 'no_show', 'cancelled')),

  registered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(camp_id, player_id)
);

CREATE INDEX idx_camp_reg_camp ON camp_registrations(camp_id);
CREATE INDEX idx_camp_reg_player ON camp_registrations(player_id);
CREATE INDEX idx_camp_reg_status ON camp_registrations(status);

-- RLS
ALTER TABLE camp_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage own registrations" ON camp_registrations
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view registrations for their camps" ON camp_registrations
  FOR SELECT USING (
    camp_id IN (SELECT id FROM camps WHERE coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
  );

-- Trigger to update camp counts
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
    IF OLD.status = 'interested' AND NEW.status IN ('registered', 'confirmed') THEN
      UPDATE camps SET
        interested_count = interested_count - 1,
        registration_count = registration_count + 1
      WHERE id = NEW.camp_id;
    ELSIF OLD.status IN ('registered', 'confirmed') AND NEW.status = 'cancelled' THEN
      UPDATE camps SET registration_count = registration_count - 1 WHERE id = NEW.camp_id;
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

CREATE TRIGGER camp_registration_counts
  AFTER INSERT OR UPDATE OR DELETE ON camp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_camp_counts();
```

#### 4.4 Add event_id Foreign Keys
```sql
-- Migration: 025_add_event_references.sql

-- Add event_id to player_stats
ALTER TABLE player_stats
ADD CONSTRAINT fk_player_stats_event
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Add event_id to evaluations
ALTER TABLE evaluations
ADD CONSTRAINT fk_evaluations_event
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
```

### TypeScript Types
```typescript
export interface Event {
  id: string;
  organization_id: string | null;
  team_id: string | null;
  name: string;
  description: string | null;
  event_type: 'game' | 'showcase' | 'tournament' | 'camp' | 'combine' | 'tryout' | 'practice' | 'other';
  start_time: string;
  end_time: string | null;
  timezone: string;
  is_all_day: boolean;
  location_venue: string | null;
  location_city: string | null;
  location_state: string | null;
  location_address: string | null;
  opponent: string | null;
  home_away: 'home' | 'away' | 'neutral' | null;
  result: 'W' | 'L' | 'T' | null;
  score_us: number | null;
  score_them: number | null;
  level: string | null;
  is_public: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Camp {
  id: string;
  coach_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_city: string | null;
  location_state: string | null;
  location_address: string | null;
  capacity: number | null;
  registration_count: number;
  interested_count: number;
  price: number | null;
  status: 'draft' | 'published' | 'open' | 'limited' | 'full' | 'cancelled' | 'completed';
  registration_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampRegistration {
  id: string;
  camp_id: string;
  player_id: string;
  status: 'interested' | 'registered' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';
  registered_at: string | null;
  cancelled_at: string | null;
  attended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  camp?: Camp;
  player?: Player;
}
```

---

## Phase 5: Analytics Enhancement (Priority: LOW)

### Objective
Enhance analytics tracking and engagement events.

### Tables to Enhance

#### 5.1 Enhance `player_engagement_events`
```sql
-- Migration: 026_enhanced_analytics.sql

-- Rename profile_views to player_engagement_events
ALTER TABLE profile_views RENAME TO player_engagement_events;

-- Add new columns
ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE player_engagement_events RENAME COLUMN viewer_id TO viewer_user_id;
ALTER TABLE player_engagement_events RENAME COLUMN viewer_type TO engagement_type;

-- Update engagement_type to be more specific
ALTER TABLE player_engagement_events
ALTER COLUMN engagement_type TYPE VARCHAR(50);

ALTER TABLE player_engagement_events
ADD CONSTRAINT check_engagement_type
CHECK (engagement_type IN (
  'profile_view', 'video_view', 'stats_view',
  'watchlist_add', 'watchlist_remove',
  'message_sent', 'camp_interest', 'top5_add'
));

ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS engagement_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS view_duration_seconds INTEGER;
ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS video_id UUID;
ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE player_engagement_events ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;

-- Add indexes
CREATE INDEX idx_engagement_coach ON player_engagement_events(coach_id);
CREATE INDEX idx_engagement_date ON player_engagement_events(engagement_date);
CREATE INDEX idx_engagement_type ON player_engagement_events(engagement_type);
CREATE INDEX idx_engagement_player_date ON player_engagement_events(player_id, engagement_date DESC);

-- Update RLS
DROP POLICY IF EXISTS "Players see own views" ON player_engagement_events;
DROP POLICY IF EXISTS "Anyone can create views" ON player_engagement_events;

CREATE POLICY "Players can view own engagement" ON player_engagement_events
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can record engagement" ON player_engagement_events
  FOR INSERT WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR viewer_user_id = auth.uid()
  );
```

#### 5.2 Create Analytics Function
```sql
-- Migration: 027_analytics_functions.sql

CREATE OR REPLACE FUNCTION get_player_engagement_summary(
  p_player_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_views BIGINT,
  unique_coaches BIGINT,
  watchlist_adds BIGINT,
  video_views BIGINT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE engagement_type = 'profile_view') as total_views,
    COUNT(DISTINCT coach_id) FILTER (WHERE engagement_type = 'profile_view') as unique_coaches,
    COUNT(*) FILTER (WHERE engagement_type = 'watchlist_add') as watchlist_adds,
    COUNT(*) FILTER (WHERE engagement_type = 'video_view') as video_views,
    NOW() - (p_days || ' days')::INTERVAL as period_start,
    NOW() as period_end
  FROM player_engagement_events
  WHERE player_id = p_player_id
    AND engagement_date >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
```

---

## Phase 6: Video Enhancement (Priority: LOW)

### Objective
Add video library and comparison features.

### New Tables

#### 6.1 Rename and Enhance `videos` → `player_videos`
```sql
-- Migration: 028_enhance_videos.sql

-- Rename table
ALTER TABLE videos RENAME TO player_videos;

-- Add new columns
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS video_type VARCHAR(50) DEFAULT 'highlight'
  CHECK (video_type IN ('highlight', 'game', 'training', 'showcase', 'at_bat', 'pitching', 'fielding'));
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'url'
  CHECK (source_type IN ('url', 'youtube', 'upload', 'hudl'));
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS recorded_date DATE;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS is_clip BOOLEAN DEFAULT FALSE;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS parent_video_id UUID REFERENCES player_videos(id) ON DELETE SET NULL;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS clip_start_seconds INTEGER;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS clip_end_seconds INTEGER;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Rename duration → duration_seconds
ALTER TABLE player_videos RENAME COLUMN duration TO duration_seconds;

-- Rename url → video_url
ALTER TABLE player_videos RENAME COLUMN url TO video_url;

-- Add indexes
CREATE INDEX idx_videos_type ON player_videos(video_type);
CREATE INDEX idx_videos_primary ON player_videos(player_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX idx_videos_parent ON player_videos(parent_video_id) WHERE parent_video_id IS NOT NULL;

-- Update RLS
DROP POLICY IF EXISTS "Videos are public" ON player_videos;

CREATE POLICY "Public videos viewable" ON player_videos
  FOR SELECT TO authenticated USING (is_public = true);
```

#### 6.2 Create `video_library`
```sql
-- Migration: 029_video_library.sql

CREATE TABLE video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES player_videos(id) ON DELETE CASCADE,

  folder VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  is_starred BOOLEAN DEFAULT FALSE,

  added_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(coach_id, video_id)
);

CREATE INDEX idx_video_library_coach ON video_library(coach_id);
CREATE INDEX idx_video_library_player ON video_library(player_id);

-- RLS
ALTER TABLE video_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own library" ON video_library
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

#### 6.3 Create `player_comparisons`
```sql
-- Migration: 030_player_comparisons.sql

CREATE TABLE player_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  name VARCHAR(255),
  description TEXT,

  player_ids UUID[] NOT NULL,

  comparison_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_comparisons_coach ON player_comparisons(coach_id);

-- RLS
ALTER TABLE player_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own comparisons" ON player_comparisons
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

### TypeScript Types
```typescript
export interface VideoLibrary {
  id: string;
  coach_id: string;
  player_id: string;
  video_id: string;
  folder: string | null;
  tags: string[];
  notes: string | null;
  is_starred: boolean;
  added_at: string;
  created_at: string;
  updated_at: string;
  video?: Video;
}

export interface PlayerComparison {
  id: string;
  coach_id: string;
  name: string | null;
  description: string | null;
  player_ids: string[];
  comparison_data: any;
  created_at: string;
  updated_at: string;
}
```

---

## Phase 7: Final Cleanup & Optimization (Priority: LOW)

### Objective
Remove deprecated fields, optimize queries, final polish.

#### 7.1 Remove Deprecated Tables/Fields
```sql
-- Migration: 031_cleanup.sql

-- Can safely remove if all data migrated to organizations
-- DROP TABLE IF EXISTS colleges CASCADE;
-- DROP TABLE IF EXISTS high_schools CASCADE;

-- Remove deprecated columns
-- ALTER TABLE coaches DROP COLUMN IF EXISTS college_id;
-- ALTER TABLE coaches DROP COLUMN IF EXISTS conference;
-- ALTER TABLE players DROP COLUMN IF EXISTS high_school_id;
-- ALTER TABLE players DROP COLUMN IF EXISTS committed_to;

-- Rename watchlists → recruit_watchlist
-- ALTER TABLE watchlists RENAME TO recruit_watchlist;

-- Rename pipeline_stage → status and update enum
-- ALTER TABLE recruit_watchlist ALTER COLUMN pipeline_stage TYPE VARCHAR(20);
-- UPDATE recruit_watchlist SET pipeline_stage = 'high_priority' WHERE pipeline_stage = 'priority';
-- ALTER TABLE recruit_watchlist RENAME COLUMN pipeline_stage TO status;
```

#### 7.2 Add Performance Indexes
```sql
-- Migration: 032_performance_indexes.sql

-- Players discovery (most common query)
CREATE INDEX IF NOT EXISTS idx_players_discovery ON players(
  recruiting_activated, grad_year, primary_position, state
) WHERE recruiting_activated = true;

-- Watchlist by status
CREATE INDEX IF NOT EXISTS idx_watchlist_coach_status ON watchlists(coach_id, pipeline_stage);

-- Messages performance
CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages(conversation_id, sent_at DESC);

-- Engagement analytics (30-day window)
CREATE INDEX IF NOT EXISTS idx_engagement_player_30d ON player_engagement_events(player_id, engagement_date)
  WHERE engagement_date > NOW() - INTERVAL '30 days';
```

---

## Testing Strategy

### Per-Phase Testing

After each phase:
1. ✅ **Migration Test:** Run migration on test database
2. ✅ **Rollback Test:** Verify rollback works
3. ✅ **RLS Test:** Verify policies work correctly
4. ✅ **Performance Test:** Check query performance
5. ✅ **Integration Test:** Test with existing UI components
6. ✅ **Type Check:** Verify TypeScript compilation

### Test Queries
```sql
-- Test RLS for players
SET ROLE authenticated;
SET request.jwt.claims.sub TO '<player_user_id>';
SELECT * FROM player_settings; -- Should see only own

-- Test RLS for coaches
SET request.jwt.claims.sub TO '<coach_user_id>';
SELECT * FROM coach_notes; -- Should see only own
SELECT * FROM players WHERE recruiting_activated = TRUE; -- Should see all active

-- Test performance
EXPLAIN ANALYZE SELECT * FROM players
WHERE recruiting_activated = TRUE
AND grad_year = 2025
AND primary_position = 'P'
AND state = 'CA';
```

---

## Rollback Strategy

### Emergency Rollback
If critical issues arise during a phase:

1. **Stop migrations** immediately
2. **Run phase rollback SQL** (documented per phase)
3. **Revert code changes** (git revert)
4. **Verify application stability**
5. **Investigate root cause**

### Partial Rollback
If only one table causes issues:
1. Drop problematic table
2. Remove related foreign keys
3. Keep other phase changes
4. Update TypeScript types

---

## Deployment Checklist

### Pre-Deployment
- [ ] Backup production database
- [ ] Test migrations on staging
- [ ] Review RLS policies
- [ ] Update TypeScript types
- [ ] Run type checks (`npm run type-check`)
- [ ] Test all affected UI components
- [ ] Document breaking changes
- [ ] Communicate with team

### Deployment
- [ ] Enable maintenance mode (optional)
- [ ] Run migrations sequentially
- [ ] Verify each migration success
- [ ] Run post-migration tests
- [ ] Monitor error logs
- [ ] Verify UI functionality
- [ ] Check performance metrics

### Post-Deployment
- [ ] Monitor production for 24 hours
- [ ] Check RLS policy effectiveness
- [ ] Review slow query logs
- [ ] Gather user feedback
- [ ] Document lessons learned

---

## Success Criteria

### Phase Completion
Each phase is considered complete when:
- ✅ All migrations run successfully
- ✅ All RLS policies pass tests
- ✅ TypeScript types updated and compile
- ✅ UI components work with new schema
- ✅ Performance meets benchmarks
- ✅ Rollback tested and documented

### Full Migration Success
The full migration is successful when:
- ✅ All 6 phases completed
- ✅ Zero RLS policy violations
- ✅ Zero breaking changes to existing features
- ✅ Performance improved or maintained
- ✅ All premium UI features working
- ✅ Documentation complete

---

## Timeline & Resources

### Estimated Timeline
- **Phase 1:** 1-2 days (Foundation - CRITICAL)
- **Phase 2:** 2-3 days (Player Enhancements - HIGH)
- **Phase 3:** 2-3 days (Team Management - MEDIUM)
- **Phase 4:** 2-3 days (Events & Camps - MEDIUM)
- **Phase 5:** 1-2 days (Analytics - LOW)
- **Phase 6:** 1-2 days (Video - LOW)
- **Phase 7:** 1 day (Cleanup - LOW)

**Total:** ~2-3 weeks for complete migration

### Resources Required
- 1 Backend Developer (migrations, RLS)
- 1 Frontend Developer (TypeScript types, UI testing)
- 1 QA Engineer (testing, validation)
- Access to staging environment
- Database backup system

---

## Appendix

### A. Complete Enum List
```sql
CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE coach_type AS ENUM ('college', 'high_school', 'juco', 'showcase');
CREATE TYPE player_type AS ENUM ('high_school', 'showcase', 'juco', 'college');
CREATE TYPE organization_type AS ENUM ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball');
CREATE TYPE pipeline_status AS ENUM ('watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested');
CREATE TYPE recruiting_status AS ENUM ('interested', 'contacted', 'questionnaire', 'unofficial_visit', 'official_visit', 'offer', 'verbal', 'signed', 'declined');
CREATE TYPE camp_status AS ENUM ('draft', 'published', 'open', 'limited', 'full', 'cancelled', 'completed');
CREATE TYPE team_member_status AS ENUM ('active', 'inactive', 'injured', 'alumni');
CREATE TYPE dev_plan_status AS ENUM ('draft', 'sent', 'in_progress', 'completed', 'archived');
```

### B. Critical RLS Policies Reference
See SCHEMA.md lines 1171-1533 for complete RLS policy definitions.

### C. Index Performance Benchmarks
Target query times:
- Player discovery: < 50ms
- Watchlist fetch: < 20ms
- Messages load: < 30ms
- Profile view: < 100ms

---

**Document End**

*This migration plan provides a complete roadmap from the current simplified schema to the full SCHEMA.md specification. Follow phases sequentially for safest migration.*
