# Phase 1 Roadmap: Critical Foundation
## Helm Sports Labs - Weeks 1-2

**Goal:** Establish the critical foundation for role-based features and team management
**Duration:** 2 weeks (10 working days)
**Target Completion:** ~40% project completion (from current 25-30%)

---

## Overview

Phase 1 focuses on the **critical blocking issues** that prevent implementing role-specific features. We'll build the foundation that everything else depends on:

1. Unified organizations system
2. Complete teams infrastructure
3. Role-based routing architecture
4. Mode toggle functionality
5. Updated type system

---

## Day 1-2: Database Foundation

### Task 1.1: Organizations Table Migration
**Priority:** 🔴 CRITICAL | **Time:** 4 hours | **File:** `supabase/migrations/005_organizations.sql`

#### Subtasks:
- [ ] Create organizations table with all fields from SCHEMA.md
- [ ] Add indexes for performance
- [ ] Create data migration function to move existing colleges
- [ ] Create data migration function to move existing high_schools
- [ ] Add RLS policies for organizations
- [ ] Test migration on local Supabase

#### Detailed Steps:

```sql
-- 1. Create the organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball')),
  division TEXT,
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

-- 2. Add indexes
CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_state ON organizations(location_state);
CREATE INDEX idx_organizations_division ON organizations(division);
CREATE INDEX idx_organizations_name_trgm ON organizations USING gin(name gin_trgm_ops);

-- 3. Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 4. Add RLS policy (organizations are publicly readable)
CREATE POLICY "Organizations are viewable by all" ON organizations
  FOR SELECT TO authenticated USING (true);

-- 5. Migrate existing colleges
INSERT INTO organizations (
  id, name, type, division, conference, location_city, location_state,
  logo_url, website_url, description, created_at
)
SELECT
  id,
  name,
  'college' as type,
  division,
  conference,
  city as location_city,
  state as location_state,
  logo_url,
  website as website_url,
  NULL as description,
  created_at
FROM colleges;

-- 6. Migrate existing high_schools
INSERT INTO organizations (
  name, type, location_city, location_state, created_at
)
SELECT
  name,
  'high_school' as type,
  city as location_city,
  state as location_state,
  created_at
FROM high_schools;

-- 7. Add triggers
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

#### Verification Checklist:
- [ ] Migration runs without errors
- [ ] All colleges migrated (check count)
- [ ] All high schools migrated (check count)
- [ ] Indexes created successfully
- [ ] RLS policies working
- [ ] Can query organizations from app

#### Files to Update After Migration:
- `src/types/database.ts` - Add Organization interface
- `src/lib/queries/organizations.ts` - Create query functions
- Update college/high school queries to use organizations

---

### Task 1.2: Teams System Tables
**Priority:** 🔴 CRITICAL | **Time:** 6 hours | **File:** `supabase/migrations/006_teams_system.sql`

#### Subtasks:
- [ ] Create teams table
- [ ] Create team_members table
- [ ] Create team_invitations table
- [ ] Create team_coach_staff table
- [ ] Add all indexes
- [ ] Add RLS policies for each table
- [ ] Test team creation and membership

#### Detailed Steps:

```sql
-- 1. Create teams table
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

-- 2. Create team_members table
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

-- 3. Create team_invitations table
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

-- 4. Create team_coach_staff table
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

-- 5. Add indexes
CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_type ON teams(team_type);
CREATE INDEX idx_teams_coach ON teams(head_coach_id);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_player ON team_members(player_id);
CREATE INDEX idx_team_members_active ON team_members(team_id, status) WHERE status = 'active';

CREATE INDEX idx_team_invitations_code ON team_invitations(invite_code);
CREATE INDEX idx_team_invitations_team ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_active ON team_invitations(invite_code) WHERE is_active = TRUE;

CREATE INDEX idx_team_staff_team ON team_coach_staff(team_id);
CREATE INDEX idx_team_staff_coach ON team_coach_staff(coach_id);

-- 6. Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coach_staff ENABLE ROW LEVEL SECURITY;

-- 7. Add RLS policies (see detailed policies below)
-- ... policies code ...

-- 8. Add triggers
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_team_staff_updated_at
  BEFORE UPDATE ON team_coach_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### RLS Policies Detail:

```sql
-- Teams: viewable by members and coaches
CREATE POLICY "Team members can view team" ON teams
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE tm.team_id = teams.id AND p.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE tcs.team_id = teams.id AND c.user_id = auth.uid()
    )
    OR
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Coaches can manage their teams
CREATE POLICY "Coaches can manage own teams" ON teams
  FOR ALL USING (
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Team members: viewable by team members/coaches
CREATE POLICY "Team members viewable by team" ON team_members
  FOR SELECT TO authenticated
  USING (
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

-- Coaches can manage team members
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

-- Team invitations: coaches can manage
CREATE POLICY "Coaches can manage team invitations" ON team_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_invitations.team_id
      AND t.head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    )
  );

-- Active invitations are publicly viewable (for join flow)
CREATE POLICY "Active invitations viewable by code" ON team_invitations
  FOR SELECT TO authenticated
  USING (is_active = TRUE);
```

#### Verification Checklist:
- [ ] All 4 tables created successfully
- [ ] Foreign keys working correctly
- [ ] Indexes created
- [ ] RLS policies preventing unauthorized access
- [ ] Can create team as coach
- [ ] Can add players to team
- [ ] Can generate invite code
- [ ] Invite code is unique

---

### Task 1.3: Player-Related Tables
**Priority:** 🟡 HIGH | **Time:** 4 hours | **File:** `supabase/migrations/007_player_features.sql`

#### Tables to Create:
1. `player_settings` - Privacy & notification preferences
2. `player_metrics` - Additional measurables
3. `recruiting_interests` - College interest list
4. `player_achievements` - Awards and honors

#### Detailed SQL:

```sql
-- 1. player_settings
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

-- 2. player_metrics
CREATE TABLE player_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  metric_label VARCHAR(100) NOT NULL,
  metric_value VARCHAR(50) NOT NULL,
  metric_type VARCHAR(50),

  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  verified_date TIMESTAMPTZ,

  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. recruiting_interests
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

-- 4. player_achievements
CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  achievement_text TEXT NOT NULL,
  achievement_type VARCHAR(50),
  achievement_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes
CREATE INDEX idx_player_settings_player ON player_settings(player_id);
CREATE INDEX idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX idx_player_metrics_type ON player_metrics(metric_type);
CREATE INDEX idx_recruiting_player ON recruiting_interests(player_id);
CREATE INDEX idx_recruiting_status ON recruiting_interests(status);
CREATE INDEX idx_recruiting_org ON recruiting_interests(organization_id);
CREATE INDEX idx_player_achievements_player ON player_achievements(player_id);

-- Enable RLS
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Players can manage own settings" ON player_settings
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can manage own metrics" ON player_metrics
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can manage own interests" ON recruiting_interests
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

CREATE POLICY "Players can manage own achievements" ON player_achievements
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Add triggers
CREATE TRIGGER update_player_settings_updated_at
  BEFORE UPDATE ON player_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_player_metrics_updated_at
  BEFORE UPDATE ON player_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_recruiting_interests_updated_at
  BEFORE UPDATE ON recruiting_interests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_player_achievements_updated_at
  BEFORE UPDATE ON player_achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

#### Verification Checklist:
- [ ] All 4 tables created
- [ ] RLS policies working
- [ ] Can create player settings on signup
- [ ] Can add/edit metrics
- [ ] Can track college interests
- [ ] Can add achievements

---

### Task 1.4: Developmental Plans Table
**Priority:** 🟡 HIGH | **Time:** 3 hours | **File:** `supabase/migrations/008_developmental_plans.sql`

```sql
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

-- Indexes
CREATE INDEX idx_dev_plans_coach ON developmental_plans(coach_id);
CREATE INDEX idx_dev_plans_player ON developmental_plans(player_id);
CREATE INDEX idx_dev_plans_team ON developmental_plans(team_id);

-- RLS
ALTER TABLE developmental_plans ENABLE ROW LEVEL SECURITY;

-- Coaches can manage plans they created
CREATE POLICY "Coaches can manage own dev plans" ON developmental_plans
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Players can view plans assigned to them
CREATE POLICY "Players can view assigned dev plans" ON developmental_plans
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Trigger
CREATE TRIGGER update_developmental_plans_updated_at
  BEFORE UPDATE ON developmental_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Day 3-4: TypeScript Type System

### Task 2.1: Update Type Definitions
**Priority:** 🔴 CRITICAL | **Time:** 4 hours | **File:** `src/types/database.ts`

#### Subtasks:
- [ ] Add all missing interfaces
- [ ] Add missing enums
- [ ] Update existing interfaces with new fields
- [ ] Add helper types
- [ ] Add JSDoc comments

#### Complete Type Definitions:

```typescript
// src/types/database.ts

// ============================================
// ENUMS
// ============================================

export type UserRole = 'player' | 'coach' | 'admin';
export type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';
export type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';
export type OrganizationType = 'college' | 'high_school' | 'juco' | 'showcase_org' | 'travel_ball';
export type TeamType = 'high_school' | 'showcase' | 'juco' | 'college' | 'travel_ball';
export type PipelineStatus = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
export type TeamMemberStatus = 'active' | 'inactive' | 'injured' | 'alumni';
export type DevPlanStatus = 'draft' | 'sent' | 'in_progress' | 'completed' | 'archived';
export type RecruitingStatus =
  | 'interested'
  | 'contacted'
  | 'questionnaire'
  | 'unofficial_visit'
  | 'official_visit'
  | 'offer'
  | 'verbal'
  | 'signed'
  | 'declined';

// ============================================
// CORE TABLES
// ============================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

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

export interface Coach {
  id: string;
  user_id: string;
  coach_type: CoachType;
  full_name: string | null;
  email_contact: string | null;
  phone: string | null;
  avatar_url: string | null;
  coach_title: string | null;
  organization_id: string | null;
  school_name: string | null;
  school_city: string | null;
  school_state: string | null;
  program_division: string | null;
  conference: string | null;
  about: string | null;
  program_philosophy: string | null;
  logo_url: string | null;
  primary_color: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
  updated_at: string;
  // Joined
  organization?: Organization;
}

export interface Player {
  id: string;
  user_id: string;
  player_type: PlayerType;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  bats: 'R' | 'L' | 'S' | null;
  throws: 'R' | 'L' | null;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  high_school_name: string | null;
  high_school_org_id: string | null;
  showcase_team_name: string | null;
  showcase_org_id: string | null;
  college_org_id: string | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  highlight_url: string | null;
  has_video: boolean;
  verified_metrics: boolean;
  about_me: string | null;
  primary_goal: string | null;
  top_schools: string[] | null;
  recruiting_activated: boolean;
  recruiting_activated_at: string | null;
  committed_to_org_id: string | null;
  commitment_date: string | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  profile_completion_percent: number;
  created_at: string;
  updated_at: string;
  // Joined
  high_school_org?: Organization;
  showcase_org?: Organization;
  college_org?: Organization;
  settings?: PlayerSettings;
  teams?: TeamMember[];
}

// ============================================
// TEAM TABLES
// ============================================

export interface Team {
  id: string;
  organization_id: string | null;
  name: string;
  team_type: TeamType;
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
  // Joined
  organization?: Organization;
  head_coach?: Coach;
  members?: TeamMember[];
  staff?: TeamCoachStaff[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  role: string | null;
  status: TeamMemberStatus;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  team?: Team;
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
  // Joined
  team?: Team;
  creator?: Coach;
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
  // Joined
  team?: Team;
  coach?: Coach;
}

// ============================================
// PLAYER FEATURE TABLES
// ============================================

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

export interface PlayerMetrics {
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
  // Joined
  verifier?: Coach;
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
  // Joined
  organization?: Organization;
}

// ============================================
// DEVELOPMENTAL PLANS
// ============================================

export interface DevelopmentalPlan {
  id: string;
  coach_id: string;
  player_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: DevPlanGoal[];
  drills: DevPlanDrill[];
  notes: string | null;
  status: DevPlanStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  coach?: Coach;
  player?: Player;
  team?: Team;
}

export interface DevPlanGoal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface DevPlanDrill {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  frequency: string | null;
}

// ============================================
// RECRUITING TABLES
// ============================================

export interface WatchlistEntry {
  id: string;
  coach_id: string;
  player_id: string;
  status: PipelineStatus;
  position_role: string | null;
  notes: string | null;
  priority: number;
  added_at: string;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  // Joined
  player?: Player;
  coach?: Coach;
}

// ============================================
// VIDEO TABLES
// ============================================

export interface Video {
  id: string;
  player_id: string;
  title: string;
  description: string | null;
  video_type: string | null;
  video_url: string;
  source_type: 'url' | 'youtube' | 'upload' | 'hudl';
  thumbnail_url: string | null;
  duration_seconds: number | null;
  recorded_date: string | null;
  view_count: number;
  is_clip: boolean;
  parent_video_id: string | null;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  is_primary: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  player?: Player;
  parent_video?: Video;
}

// ============================================
// MESSAGING TABLES
// ============================================

export interface Conversation {
  id: string;
  conversation_type: 'direct' | 'group' | 'team';
  name: string | null;
  team_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  participants?: ConversationParticipant[];
  messages?: Message[];
  team?: Team;
  unread_count?: number;
  other_user?: User & { coach?: Coach; player?: Player };
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  is_admin: boolean;
  is_muted: boolean;
  last_read_at: string | null;
  unread_count: number;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'file' | 'system';
  attachments: any[];
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  sent_at: string;
  created_at: string;
  // Joined
  sender?: User;
}

// ============================================
// ANALYTICS & NOTIFICATIONS
// ============================================

export interface Notification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  action_label: string | null;
  related_player_id: string | null;
  related_coach_id: string | null;
  related_team_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
  // Joined
  related_player?: Player;
  related_coach?: Coach;
  related_team?: Team;
}

export interface PlayerEngagementEvent {
  id: string;
  player_id: string;
  coach_id: string | null;
  viewer_user_id: string | null;
  engagement_type:
    | 'profile_view'
    | 'video_view'
    | 'stats_view'
    | 'watchlist_add'
    | 'watchlist_remove'
    | 'message_sent'
    | 'camp_interest'
    | 'top5_add';
  engagement_date: string;
  view_duration_seconds: number | null;
  video_id: string | null;
  metadata: Record<string, any>;
  is_anonymous: boolean;
  created_at: string;
  // Joined
  player?: Player;
  coach?: Coach;
  video?: Video;
}

// ============================================
// HELPER TYPES
// ============================================

export type DatabaseTable =
  | 'users'
  | 'organizations'
  | 'coaches'
  | 'players'
  | 'teams'
  | 'team_members'
  | 'team_invitations'
  | 'team_coach_staff'
  | 'player_settings'
  | 'player_metrics'
  | 'player_achievements'
  | 'recruiting_interests'
  | 'developmental_plans'
  | 'watchlists'
  | 'videos'
  | 'conversations'
  | 'conversation_participants'
  | 'messages'
  | 'notifications'
  | 'player_engagement_events';

export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
```

#### Verification Checklist:
- [ ] All interfaces match database schema
- [ ] All enums defined
- [ ] Helper types added
- [ ] No TypeScript errors
- [ ] Can import types in other files

---

## Day 5-6: Role-Based Routing Architecture

### Task 3.1: Create Route Structure
**Priority:** 🔴 CRITICAL | **Time:** 6 hours

#### Subtasks:
- [ ] Create coach route folders
- [ ] Create player route folders
- [ ] Create public route folders
- [ ] Update middleware for role-based routing
- [ ] Create route layout components
- [ ] Test routing for all user types

#### Directory Structure to Create:

```
src/app/
├── (dashboard)/
│   ├── coach/
│   │   ├── college/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx (dashboard)
│   │   │   ├── discover/page.tsx
│   │   │   ├── watchlist/page.tsx
│   │   │   ├── pipeline/page.tsx
│   │   │   ├── compare/page.tsx
│   │   │   ├── camps/page.tsx
│   │   │   ├── messages/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── program/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── high-school/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx (dashboard)
│   │   │   ├── roster/page.tsx
│   │   │   ├── videos/page.tsx
│   │   │   ├── dev-plans/page.tsx
│   │   │   ├── interest/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── messages/page.tsx
│   │   │   ├── team-settings/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── juco/
│   │   │   ├── layout.tsx (with mode toggle)
│   │   │   ├── page.tsx (dashboard)
│   │   │   ├── discover/page.tsx (recruiting)
│   │   │   ├── watchlist/page.tsx (recruiting)
│   │   │   ├── pipeline/page.tsx (recruiting)
│   │   │   ├── team/page.tsx (team mode dashboard)
│   │   │   ├── roster/page.tsx (team)
│   │   │   ├── videos/page.tsx (team)
│   │   │   ├── dev-plans/page.tsx (team)
│   │   │   ├── academics/page.tsx (team)
│   │   │   ├── interest/page.tsx (team)
│   │   │   ├── calendar/page.tsx
│   │   │   ├── messages/page.tsx
│   │   │   ├── program/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   └── showcase/
│   │       ├── layout.tsx
│   │       ├── page.tsx (dashboard)
│   │       ├── teams/page.tsx
│   │       ├── events/page.tsx
│   │       ├── team/
│   │       │   └── [id]/
│   │       │       ├── roster/page.tsx
│   │       │       ├── videos/page.tsx
│   │       │       ├── dev-plans/page.tsx
│   │       │       ├── calendar/page.tsx
│   │       │       └── messages/page.tsx
│   │       ├── org-profile/page.tsx
│   │       └── settings/page.tsx
│   │
│   └── player/
│       ├── layout.tsx (with mode toggle)
│       ├── page.tsx (dashboard - recruiting mode)
│       ├── discover/page.tsx
│       ├── journey/page.tsx
│       ├── camps/page.tsx
│       ├── messages/page.tsx
│       ├── analytics/page.tsx
│       ├── activate/page.tsx (recruiting activation)
│       ├── team/
│       │   ├── page.tsx (team dashboard)
│       │   ├── schedule/page.tsx
│       │   ├── videos/page.tsx
│       │   ├── dev-plan/page.tsx
│       │   ├── messages/page.tsx
│       │   └── announcements/page.tsx
│       ├── profile/page.tsx
│       └── settings/page.tsx
│
├── (public)/
│   ├── player/
│   │   └── [id]/page.tsx
│   └── program/
│       └── [id]/page.tsx
│
└── join/
    └── [code]/page.tsx
```

#### Step-by-Step Implementation:

**1. Create Basic Route Files (Day 5 Morning)**

Start with placeholder pages for each route:

```typescript
// src/app/(dashboard)/coach/college/page.tsx
export default function CollegeCoachDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">College Coach Dashboard</h1>
      <p className="text-gray-600 mt-2">Coming soon...</p>
    </div>
  );
}
```

Create this placeholder for ALL routes in the structure above.

**2. Update Middleware (Day 5 Afternoon)**

```typescript
// src/middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public routes - allow anyone
  if (
    req.nextUrl.pathname.startsWith('/player/') ||
    req.nextUrl.pathname.startsWith('/program/') ||
    req.nextUrl.pathname.startsWith('/join/')
  ) {
    return res;
  }

  // Auth routes - redirect if logged in
  if (req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup')) {
    if (session) {
      // Get user data to redirect to correct dashboard
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userData?.role === 'coach') {
        const { data: coachData } = await supabase
          .from('coaches')
          .select('coach_type')
          .eq('user_id', session.user.id)
          .single();

        return NextResponse.redirect(new URL(`/coach/${coachData?.coach_type || 'college'}`, req.url));
      } else if (userData?.role === 'player') {
        return NextResponse.redirect(new URL('/player', req.url));
      }
    }
    return res;
  }

  // Protected routes - require auth
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Role-based route protection
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  // Coach routes
  if (req.nextUrl.pathname.startsWith('/coach/')) {
    if (userData?.role !== 'coach') {
      return NextResponse.redirect(new URL('/player', req.url));
    }

    // Check coach type matches route
    const { data: coachData } = await supabase
      .from('coaches')
      .select('coach_type')
      .eq('user_id', session.user.id)
      .single();

    const pathCoachType = req.nextUrl.pathname.split('/')[2]; // /coach/{type}/...
    if (coachData?.coach_type !== pathCoachType) {
      return NextResponse.redirect(new URL(`/coach/${coachData?.coach_type}`, req.url));
    }
  }

  // Player routes
  if (req.nextUrl.pathname.startsWith('/player/')) {
    if (userData?.role !== 'player') {
      const { data: coachData } = await supabase
        .from('coaches')
        .select('coach_type')
        .eq('user_id', session.user.id)
        .single();
      return NextResponse.redirect(new URL(`/coach/${coachData?.coach_type}`, req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**3. Create Layout Components (Day 6 Morning)**

```typescript
// src/app/(dashboard)/coach/college/layout.tsx
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function CollegeCoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream-50">
      <Sidebar coachType="college" />
      <div className="ml-60">
        <Header />
        <main>{children}</main>
      </div>
    </div>
  );
}
```

**4. Test Routing (Day 6 Afternoon)**

- [ ] Test login redirects to correct dashboard
- [ ] Test route protection (coach can't access player routes)
- [ ] Test coach type protection (college coach can't access HS routes)
- [ ] Test all placeholder pages load

#### Verification Checklist:
- [ ] All route folders created
- [ ] Middleware protects routes correctly
- [ ] Login redirects to role-specific dashboard
- [ ] Can navigate between allowed routes
- [ ] Cannot access unauthorized routes
- [ ] Layouts render correctly

---

## Day 7-8: Core Components

### Task 4.1: Mode Toggle Component
**Priority:** 🔴 CRITICAL | **Time:** 4 hours | **File:** `src/components/layout/ModeToggle.tsx`

#### Requirements:
- Toggle between "Recruiting" and "Team" modes
- Used by JUCO coaches and recruiting-activated players
- Smooth animation
- Persists selection in state/localStorage
- Updates navigation when toggled

#### Implementation:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

type Mode = 'recruiting' | 'team';

interface ModeToggleProps {
  userType: 'coach' | 'player';
  coachType?: 'juco';
  className?: string;
}

export function ModeToggle({ userType, coachType, className }: ModeToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>('recruiting');

  // Determine mode from current path
  useEffect(() => {
    if (pathname.includes('/team')) {
      setMode('team');
    } else {
      setMode('recruiting');
    }
  }, [pathname]);

  const handleToggle = (newMode: Mode) => {
    setMode(newMode);

    // Navigate to appropriate dashboard
    if (userType === 'coach' && coachType === 'juco') {
      if (newMode === 'recruiting') {
        router.push('/coach/juco');
      } else {
        router.push('/coach/juco/team');
      }
    } else if (userType === 'player') {
      if (newMode === 'recruiting') {
        router.push('/player');
      } else {
        router.push('/player/team');
      }
    }
  };

  return (
    <div className={cn('flex items-center gap-2 p-1 bg-cream-100 rounded-lg', className)}>
      <button
        onClick={() => handleToggle('recruiting')}
        className={cn(
          'px-4 py-2 text-sm font-medium rounded-md transition-all duration-200',
          mode === 'recruiting'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        )}
      >
        Recruiting
      </button>
      <button
        onClick={() => handleToggle('team')}
        className={cn(
          'px-4 py-2 text-sm font-medium rounded-md transition-all duration-200',
          mode === 'team'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        )}
      >
        Team
      </button>
    </div>
  );
}
```

#### Verification Checklist:
- [ ] Component renders correctly
- [ ] Toggle switches modes smoothly
- [ ] Navigation updates on toggle
- [ ] Active state visually clear
- [ ] Works for JUCO coaches
- [ ] Works for players (when recruiting activated)

---

### Task 4.2: Team Switcher Component
**Priority:** 🔴 CRITICAL | **Time:** 3 hours | **File:** `src/components/layout/TeamSwitcher.tsx`

#### Requirements:
- Dropdown to select active team
- Shows player's teams (max 2: HS + Showcase)
- Persists selection
- Updates context when team changes

#### Implementation:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Team } from '@/types/database';

interface TeamSwitcherProps {
  teams: Team[];
  activeTeamId: string | null;
  className?: string;
}

export function TeamSwitcher({ teams, activeTeamId, className }: TeamSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const activeTeam = teams.find(t => t.id === activeTeamId);

  const handleSelectTeam = (teamId: string) => {
    // Store in localStorage
    localStorage.setItem('activeTeamId', teamId);

    // Refresh page to update context
    router.refresh();

    setIsOpen(false);
  };

  if (teams.length === 0) {
    return null;
  }

  if (teams.length === 1) {
    return (
      <div className={cn('px-3 py-2 rounded-lg bg-white border border-border-light', className)}>
        <p className="text-sm font-medium text-gray-900">{teams[0].name}</p>
        <p className="text-xs text-gray-500">{teams[0].team_type}</p>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 rounded-lg bg-white border border-border-light hover:border-border transition-colors flex items-center justify-between"
      >
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900">{activeTeam?.name || 'Select Team'}</p>
          <p className="text-xs text-gray-500">{activeTeam?.team_type}</p>
        </div>
        <ChevronDown className={cn(
          'h-4 w-4 text-gray-400 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border-light rounded-lg shadow-lg z-50 overflow-hidden">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => handleSelectTeam(team.id)}
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-cream-50 transition-colors',
                  team.id === activeTeamId && 'bg-brand-50'
                )}
              >
                <p className="text-sm font-medium text-gray-900">{team.name}</p>
                <p className="text-xs text-gray-500">{team.team_type}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

#### Verification Checklist:
- [ ] Dropdown opens/closes correctly
- [ ] Shows all player's teams
- [ ] Active team highlighted
- [ ] Selection persists
- [ ] Updates context on change

---

### Task 4.3: Update Sidebar Component
**Priority:** 🔴 CRITICAL | **Time:** 4 hours | **File:** `src/components/layout/sidebar.tsx`

#### Requirements:
- Make sidebar role-aware
- Show correct navigation for each coach type
- Show correct navigation for player modes
- Include mode toggle for JUCO/players
- Include team switcher for multi-team players

#### Implementation:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ModeToggle } from './ModeToggle';
import { TeamSwitcher } from './TeamSwitcher';
import {
  IconHome,
  IconSearch,
  IconUsers,
  IconMessage,
  IconChart,
  IconSettings,
  IconLogOut,
  IconBuilding,
  IconVideo,
  IconCalendar,
  IconTarget,
  IconGraduationCap,
} from '@/components/icons';

// Navigation configs for each coach type
const collegeCoachNav = [
  { name: 'Dashboard', href: '/coach/college', icon: IconHome },
  { name: 'Discover', href: '/coach/college/discover', icon: IconSearch },
  { name: 'Watchlist', href: '/coach/college/watchlist', icon: IconUsers },
  { name: 'Pipeline', href: '/coach/college/pipeline', icon: IconTarget },
  { name: 'Compare', href: '/coach/college/compare', icon: IconChart },
  { name: 'Camps', href: '/coach/college/camps', icon: IconBuilding },
  { name: 'Messages', href: '/coach/college/messages', icon: IconMessage },
];

const highSchoolCoachNav = [
  { name: 'Dashboard', href: '/coach/high-school', icon: IconHome },
  { name: 'Roster', href: '/coach/high-school/roster', icon: IconUsers },
  { name: 'Videos', href: '/coach/high-school/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/coach/high-school/dev-plans', icon: IconTarget },
  { name: 'College Interest', href: '/coach/high-school/interest', icon: IconGraduationCap },
  { name: 'Calendar', href: '/coach/high-school/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/coach/high-school/messages', icon: IconMessage },
];

const jucoCoachRecruitingNav = [
  { name: 'Dashboard', href: '/coach/juco', icon: IconHome },
  { name: 'Discover', href: '/coach/juco/discover', icon: IconSearch },
  { name: 'Watchlist', href: '/coach/juco/watchlist', icon: IconUsers },
  { name: 'Pipeline', href: '/coach/juco/pipeline', icon: IconTarget },
  { name: 'Messages', href: '/coach/juco/messages', icon: IconMessage },
];

const jucoCoachTeamNav = [
  { name: 'Dashboard', href: '/coach/juco/team', icon: IconHome },
  { name: 'Roster', href: '/coach/juco/roster', icon: IconUsers },
  { name: 'Videos', href: '/coach/juco/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/coach/juco/dev-plans', icon: IconTarget },
  { name: 'Academics', href: '/coach/juco/academics', icon: IconGraduationCap },
  { name: 'College Interest', href: '/coach/juco/interest', icon: IconGraduationCap },
  { name: 'Calendar', href: '/coach/juco/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/coach/juco/messages', icon: IconMessage },
];

const showcaseCoachNav = [
  { name: 'Dashboard', href: '/coach/showcase', icon: IconHome },
  { name: 'Teams', href: '/coach/showcase/teams', icon: IconUsers },
  { name: 'Events', href: '/coach/showcase/events', icon: IconCalendar },
];

const playerRecruitingNav = [
  { name: 'Dashboard', href: '/player', icon: IconHome },
  { name: 'Discover', href: '/player/discover', icon: IconSearch },
  { name: 'My Journey', href: '/player/journey', icon: IconTarget },
  { name: 'Camps', href: '/player/camps', icon: IconBuilding },
  { name: 'Messages', href: '/player/messages', icon: IconMessage },
  { name: 'Analytics', href: '/player/analytics', icon: IconChart },
];

const playerTeamNav = [
  { name: 'Dashboard', href: '/player/team', icon: IconHome },
  { name: 'Schedule', href: '/player/team/schedule', icon: IconCalendar },
  { name: 'My Videos', href: '/player/team/videos', icon: IconVideo },
  { name: 'Dev Plan', href: '/player/team/dev-plan', icon: IconTarget },
  { name: 'Messages', href: '/player/team/messages', icon: IconMessage },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, coach, player, signOut } = useAuth();

  // Determine navigation based on user type and mode
  let navigation = [];
  let showModeToggle = false;
  let modeToggleType: 'coach' | 'player' = 'coach';

  if (user?.role === 'coach' && coach) {
    if (coach.coach_type === 'college') {
      navigation = collegeCoachNav;
    } else if (coach.coach_type === 'high_school') {
      navigation = highSchoolCoachNav;
    } else if (coach.coach_type === 'juco') {
      showModeToggle = true;
      modeToggleType = 'coach';
      navigation = pathname.includes('/team') ? jucoCoachTeamNav : jucoCoachRecruitingNav;
    } else if (coach.coach_type === 'showcase') {
      navigation = showcaseCoachNav;
    }
  } else if (user?.role === 'player' && player) {
    if (player.recruiting_activated) {
      showModeToggle = true;
      modeToggleType = 'player';
      navigation = pathname.includes('/team') ? playerTeamNav : playerRecruitingNav;
    } else {
      navigation = playerTeamNav;
    }
  }

  const displayName = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const subtitle = coach ? (coach.school_name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : '');

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-border-light flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 px-6 flex items-center border-b border-border-light">
        <Link href={navigation[0]?.href || '/dashboard'} className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <span className="font-semibold text-gray-900">Helm</span>
        </Link>
      </div>

      {/* Mode Toggle */}
      {showModeToggle && (
        <div className="px-4 pt-4">
          <ModeToggle
            userType={modeToggleType}
            coachType={coach?.coach_type === 'juco' ? 'juco' : undefined}
          />
        </div>
      )}

      {/* Team Switcher (for players with multiple teams) */}
      {user?.role === 'player' && player?.teams && player.teams.length > 1 && (
        <div className="px-4 pt-4">
          <TeamSwitcher
            teams={player.teams}
            activeTeamId={player.teams[0]?.team_id || null}
          />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== navigation[0].href && pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-cream-100 hover:text-gray-900'
                  )}
                >
                  <item.icon size={18} />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border-light">
        <div className="px-3 py-2.5 mb-2 rounded-lg bg-cream-50">
          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        </div>
        <Link
          href={user?.role === 'coach' ? `/coach/${coach?.coach_type}/settings` : '/player/settings'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
            pathname.endsWith('/settings')
              ? 'bg-brand-50 text-brand-700'
              : 'text-gray-600 hover:bg-cream-100'
          )}
        >
          <IconSettings size={18} /> Settings
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-cream-100 transition-all"
        >
          <IconLogOut size={18} /> Log out
        </button>
      </div>
    </aside>
  );
}
```

#### Verification Checklist:
- [ ] Shows correct nav for each coach type
- [ ] Shows mode toggle for JUCO coaches
- [ ] Shows mode toggle for recruiting players
- [ ] Shows team switcher for multi-team players
- [ ] Active nav item highlighted correctly
- [ ] Settings link goes to correct route

---

## Day 9-10: Testing & Documentation

### Task 5.1: Comprehensive Testing
**Priority:** 🟡 HIGH | **Time:** 8 hours

#### Test Categories:

**Database Tests**
- [ ] All migrations run successfully
- [ ] Can create/read/update/delete from all tables
- [ ] RLS policies prevent unauthorized access
- [ ] Foreign keys enforce referential integrity
- [ ] Triggers fire correctly
- [ ] Indexes improve query performance

**Routing Tests**
- [ ] All routes accessible for authorized users
- [ ] Middleware redirects unauthorized users
- [ ] Coach type protection works
- [ ] Player routes protected
- [ ] Public routes accessible
- [ ] Join link route works

**Component Tests**
- [ ] Mode toggle switches correctly
- [ ] Team switcher shows correct teams
- [ ] Sidebar updates based on role
- [ ] Sidebar updates based on mode
- [ ] All navigation links work

**Integration Tests**
- [ ] Can sign up as coach → redirects to correct dashboard
- [ ] Can sign up as player → redirects to player dashboard
- [ ] Can switch modes (JUCO coach)
- [ ] Can switch modes (player)
- [ ] Can switch teams (multi-team player)
- [ ] Cannot access unauthorized routes

### Task 5.2: Create Migration Guide
**Priority:** 🟡 HIGH | **Time:** 2 hours | **File:** `MIGRATION_GUIDE.md`

Document how to:
- Run migrations in order
- Migrate existing data
- Test migrations locally
- Roll back if needed
- Deploy to production

### Task 5.3: Update Documentation
**Priority:** 🟡 HIGH | **Time:** 2 hours

Files to update:
- `README.md` - Add Phase 1 completion notes
- `PROGRESS.md` - Document what's been implemented
- `NEXT_STEPS.md` - Outline Phase 2 tasks

---

## Success Criteria

Phase 1 is complete when ALL of these are true:

### Database
- [✅] Organizations table created and populated
- [✅] Teams system (4 tables) created
- [✅] Player feature tables (4 tables) created
- [✅] Developmental plans table created
- [✅] All RLS policies working
- [✅] All migrations tested

### Routing
- [✅] All role-specific routes created
- [✅] Middleware protects routes correctly
- [✅] Login redirects to correct dashboard
- [✅] Public routes accessible
- [✅] Join route functional

### Types
- [✅] All database interfaces defined
- [✅] All enums defined
- [✅] No TypeScript errors
- [✅] Types match database schema

### Components
- [✅] Mode toggle working
- [✅] Team switcher working
- [✅] Sidebar role-aware
- [✅] All layouts created

### Testing
- [✅] All tests passing
- [✅] Can create team as coach
- [✅] Can join team as player
- [✅] Can switch modes
- [✅] Can switch teams
- [✅] No console errors

### Documentation
- [✅] Migration guide complete
- [✅] Progress documented
- [✅] Next steps outlined

---

## Phase 1 Metrics

**Target Metrics After Completion:**
- Database Coverage: 60%+ (22/37 tables)
- Routing Coverage: 80%+ (role-specific routes exist)
- Component Coverage: 50%+ (critical layout components done)
- Feature Completion: 40%+ (foundation for all features)
- Overall Project: 40-45% complete (from 25-30%)

---

## Daily Checklist Template

Use this for each day:

```
## Day X - [Date]

### Morning (9am-12pm)
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### Afternoon (1pm-5pm)
- [ ] Task 4
- [ ] Task 5
- [ ] Task 6

### End of Day Review
- What worked well:
- What blockers encountered:
- Tomorrow's priority:

### Tests Run
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Feature works in browser
```

---

## Emergency Contacts & Resources

**If Stuck:**
1. Re-read relevant section in CLAUDE.md
2. Check SCHEMA.md for table structure
3. Review KICKSTART.md for component patterns
4. Ask user for clarification

**Key Documentation:**
- CLAUDE.md - Design system & requirements
- SCHEMA.md - Database schema
- KICKSTART.md - Component code
- GAP_ANALYSIS_REPORT.md - What's missing

---

## Next Phase Preview

After Phase 1 completion, Phase 2 will focus on:
- Team management features (roster CRUD)
- Development plans (builder + viewer)
- Coach notes
- Calendar system basics
- College interest tracking

But first, let's complete Phase 1! 🚀

---

*Roadmap Created: December 17, 2024*
*Target Completion: 2 weeks from start*
