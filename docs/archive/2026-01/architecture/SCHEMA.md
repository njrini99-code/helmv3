# Helm Sports Labs - Complete Database Schema

## Version 2.0 | Rebuild Specification
**Last Updated:** December 2024
**Status:** Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Core Tables](#3-core-tables)
4. [Coach Tables](#4-coach-tables)
5. [Player Tables](#5-player-tables)
6. [Team Tables](#6-team-tables)
7. [Messaging Tables](#7-messaging-tables)
8. [Events & Camps Tables](#8-events--camps-tables)
9. [Analytics Tables](#9-analytics-tables)
10. [Video Tables](#10-video-tables)
11. [RLS Policies](#11-rls-policies)
12. [Database Functions](#12-database-functions)
13. [Indexes](#13-indexes)
14. [TypeScript Interfaces](#14-typescript-interfaces)
15. [Migration Order](#15-migration-order)

---

## 1. Overview

### 1.1 Database Architecture

Helm Sports Labs uses Supabase (PostgreSQL) with Row Level Security (RLS) for data isolation.

**Key Principles:**
- All user data isolated via RLS policies
- UUID primary keys for all tables
- Soft timestamps (created_at, updated_at) on all tables
- Foreign key constraints with appropriate ON DELETE actions
- Indexes on frequently queried columns

### 1.2 User Types

| Type | Table | Description |
|------|-------|-------------|
| Player | `players` | HS, Showcase, JUCO, or College player |
| Coach | `coaches` | College, HS, JUCO, or Showcase coach |
| Admin | `users` | Platform administrator |

### 1.3 Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For geographic features (optional)
```

---

## 2. Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  auth.users │────→│    users    │←────│  profiles   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   coaches   │  │   players   │  │    teams    │
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│recruit_watchlist│ │ player_settings │ │  team_members   │
│   coach_notes   │ │  player_videos  │ │ team_invitations│
│ calendar_events │ │ player_metrics  │ │  team_messages  │
│    camps        │ │   evaluations   │ │   team_events   │
└─────────────────┘ │recruiting_ints  │ └─────────────────┘
                    │  player_stats   │
                    └─────────────────┘
```

---

## 3. Core Tables

### 3.1 users

Links Supabase Auth to application data.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'player' 
    CHECK (role IN ('player', 'coach', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### 3.2 organizations

Stores all organization types (colleges, high schools, showcase orgs, JUCOs).

```sql
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
```

---

## 4. Coach Tables

### 4.1 coaches

```sql
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Coach Type
  coach_type VARCHAR(20) NOT NULL 
    CHECK (coach_type IN ('college', 'high_school', 'juco', 'showcase')),
  
  -- Personal Info
  full_name VARCHAR(255),
  email_contact VARCHAR(255),
  phone VARCHAR(20),
  avatar_url TEXT,
  coach_title VARCHAR(100),  -- "Head Coach", "Assistant Coach", etc.
  
  -- Organization Link
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Legacy fields (for coaches not linked to org)
  school_name VARCHAR(255),
  organization_name VARCHAR(255),
  school_city VARCHAR(100),
  school_state VARCHAR(2),
  program_division VARCHAR(50),
  athletic_conference VARCHAR(100),
  
  -- Program Details (College coaches)
  about TEXT,
  program_philosophy TEXT,
  program_values TEXT,
  what_we_look_for TEXT,
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#16A34A',
  secondary_color VARCHAR(7),
  
  -- Status
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_coaches_user_id ON coaches(user_id);
CREATE INDEX idx_coaches_type ON coaches(coach_type);
CREATE INDEX idx_coaches_org ON coaches(organization_id);
CREATE INDEX idx_coaches_state ON coaches(school_state);
```

### 4.2 recruit_watchlist

Coach's recruiting pipeline.

```sql
CREATE TABLE recruit_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  -- Pipeline Status
  status VARCHAR(20) DEFAULT 'watchlist' 
    CHECK (status IN ('watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested')),
  
  -- Details
  position_role VARCHAR(50),  -- Position coach wants player for
  notes TEXT,
  priority INTEGER DEFAULT 0,
  
  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT NOW(),
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(coach_id, player_id)
);

CREATE INDEX idx_watchlist_coach ON recruit_watchlist(coach_id);
CREATE INDEX idx_watchlist_player ON recruit_watchlist(player_id);
CREATE INDEX idx_watchlist_status ON recruit_watchlist(status);
CREATE INDEX idx_watchlist_coach_status ON recruit_watchlist(coach_id, status);
```

### 4.3 coach_notes

Private notes coaches keep on players.

```sql
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
```

### 4.4 coach_calendar_events

Coach's personal calendar.

```sql
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
  
  -- Recurrence (future)
  recurrence_rule TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_calendar_coach ON coach_calendar_events(coach_id);
CREATE INDEX idx_calendar_start ON coach_calendar_events(start_time);
CREATE INDEX idx_calendar_coach_range ON coach_calendar_events(coach_id, start_time, end_time);
```

---

## 5. Player Tables

### 5.1 players

```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Player Type
  player_type VARCHAR(20) NOT NULL 
    CHECK (player_type IN ('high_school', 'showcase', 'juco', 'college')),
  
  -- Personal Info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(255) GENERATED ALWAYS AS (
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
  ) STORED,
  email VARCHAR(255),
  phone VARCHAR(20),
  avatar_url TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  
  -- Baseball Info
  primary_position VARCHAR(10),
  secondary_position VARCHAR(10),
  grad_year INTEGER,
  bats VARCHAR(1) CHECK (bats IN ('R', 'L', 'S')),
  throws VARCHAR(1) CHECK (throws IN ('R', 'L')),
  
  -- Physical
  height_feet INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,
  
  -- School Info
  high_school_name VARCHAR(255),
  high_school_city VARCHAR(100),
  high_school_state VARCHAR(2),
  high_school_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Showcase Team
  showcase_team_name VARCHAR(255),
  showcase_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- JUCO/College (for those player types)
  college_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Metrics
  pitch_velo DECIMAL(4,1),
  exit_velo DECIMAL(4,1),
  sixty_time DECIMAL(4,2),
  gpa DECIMAL(3,2),
  sat_score INTEGER,
  act_score INTEGER,
  
  -- Content
  highlight_url TEXT,
  has_video BOOLEAN DEFAULT FALSE,
  verified_metrics BOOLEAN DEFAULT FALSE,
  
  -- Profile
  about_me TEXT,
  primary_goal VARCHAR(50),  -- 'D1', 'D2', 'D3', 'NAIA', 'JUCO', 'Pro'
  top_schools TEXT[],  -- Array of school names
  
  -- Recruiting Status
  recruiting_activated BOOLEAN DEFAULT FALSE,
  recruiting_activated_at TIMESTAMPTZ,
  committed_to_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  commitment_date TIMESTAMPTZ,
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  profile_completion_percent INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_players_user_id ON players(user_id);
CREATE INDEX idx_players_type ON players(player_type);
CREATE INDEX idx_players_grad_year ON players(grad_year);
CREATE INDEX idx_players_position ON players(primary_position);
CREATE INDEX idx_players_state ON players(state);
CREATE INDEX idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = TRUE;
CREATE INDEX idx_players_name_trgm ON players USING gin(full_name gin_trgm_ops);
```

### 5.2 player_settings

Privacy and notification preferences.

```sql
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
```

### 5.3 player_metrics

Additional measurables beyond core stats.

```sql
CREATE TABLE player_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  metric_label VARCHAR(100) NOT NULL,  -- "Exit Velocity", "Pop Time", etc.
  metric_value VARCHAR(50) NOT NULL,   -- "92 mph", "1.95s"
  metric_type VARCHAR(50),             -- "hitting", "pitching", "fielding", "running"
  
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES coaches(id) ON DELETE SET NULL,
  verified_date TIMESTAMPTZ,
  
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX idx_player_metrics_type ON player_metrics(metric_type);
```

### 5.4 player_achievements

Awards, honors, accomplishments.

```sql
CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  achievement_text TEXT NOT NULL,
  achievement_type VARCHAR(50),  -- "award", "honor", "milestone"
  achievement_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_player_achievements_player ON player_achievements(player_id);
```

### 5.5 recruiting_interests

Player's college interest list.

```sql
CREATE TABLE recruiting_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  -- School Reference
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  school_name TEXT NOT NULL,  -- Denormalized for display
  conference TEXT,
  division TEXT,
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'interested'
    CHECK (status IN (
      'interested', 'contacted', 'questionnaire', 
      'unofficial_visit', 'official_visit', 
      'offer', 'verbal', 'signed', 'declined'
    )),
  interest_level VARCHAR(10) CHECK (interest_level IN ('low', 'medium', 'high')),
  
  -- Details
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
```

### 5.6 player_stats

Game/event statistics.

```sql
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  
  -- Context
  stat_type VARCHAR(50) NOT NULL,  -- 'game', 'practice', 'showcase', 'season'
  stat_date DATE,
  opponent VARCHAR(255),
  source VARCHAR(100),  -- 'high_school', 'showcase', 'manual'
  
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
CREATE INDEX idx_player_stats_event ON player_stats(event_id);
CREATE INDEX idx_player_stats_type ON player_stats(stat_type);
```

### 5.7 evaluations

Coach evaluations of players.

```sql
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  
  evaluator_name TEXT,  -- For non-system evaluators
  eval_date DATE DEFAULT CURRENT_DATE,
  
  -- Grades (0-100 scale, 80 = MLB average)
  overall_grade INTEGER CHECK (overall_grade >= 0 AND overall_grade <= 100),
  arm_grade INTEGER CHECK (arm_grade >= 0 AND arm_grade <= 100),
  bat_grade INTEGER CHECK (bat_grade >= 0 AND bat_grade <= 100),
  speed_grade INTEGER CHECK (speed_grade >= 0 AND speed_grade <= 100),
  fielding_grade INTEGER CHECK (fielding_grade >= 0 AND fielding_grade <= 100),
  baseball_iq_grade INTEGER CHECK (baseball_iq_grade >= 0 AND baseball_iq_grade <= 100),
  
  -- Feedback
  strengths TEXT,
  areas_to_improve TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Visibility
  is_public BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_evaluations_player ON evaluations(player_id);
CREATE INDEX idx_evaluations_evaluator ON evaluations(evaluator_id);
CREATE INDEX idx_evaluations_event ON evaluations(event_id);
CREATE INDEX idx_evaluations_public ON evaluations(is_public) WHERE is_public = TRUE;
```

---

## 6. Team Tables

### 6.1 teams

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  team_type VARCHAR(20) NOT NULL 
    CHECK (team_type IN ('high_school', 'showcase', 'juco', 'college', 'travel_ball')),
  
  -- Details
  season_year INTEGER,
  age_group VARCHAR(20),  -- "18U", "16U", etc.
  
  -- Location
  city VARCHAR(100),
  state VARCHAR(2),
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7),
  
  -- Coach
  head_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_type ON teams(team_type);
CREATE INDEX idx_teams_coach ON teams(head_coach_id);
```

### 6.2 team_members

Player-team relationships.

```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  -- Role
  jersey_number INTEGER,
  position VARCHAR(10),
  role VARCHAR(50),  -- "Captain", "Starter", etc.
  
  -- Status
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
```

### 6.3 team_invitations

Join links for team roster.

```sql
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  invite_code VARCHAR(20) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  
  -- Limits
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_team_invitations_code ON team_invitations(invite_code);
CREATE INDEX idx_team_invitations_team ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_active ON team_invitations(invite_code) WHERE is_active = TRUE;
```

### 6.4 team_coach_staff

Multiple coaches per team.

```sql
CREATE TABLE team_coach_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  
  role VARCHAR(100),  -- "Head Coach", "Pitching Coach", etc.
  is_primary BOOLEAN DEFAULT FALSE,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(team_id, coach_id)
);

CREATE INDEX idx_team_staff_team ON team_coach_staff(team_id);
CREATE INDEX idx_team_staff_coach ON team_coach_staff(coach_id);
```

### 6.5 developmental_plans

Coach-created development plans for players.

```sql
CREATE TABLE developmental_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Timeline
  start_date DATE,
  end_date DATE,
  
  -- Content
  goals JSONB DEFAULT '[]',  -- Array of {id, title, description, target_date, completed}
  drills JSONB DEFAULT '[]', -- Array of {id, name, description, video_url, frequency}
  notes TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft' 
    CHECK (status IN ('draft', 'sent', 'in_progress', 'completed', 'archived')),
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_dev_plans_coach ON developmental_plans(coach_id);
CREATE INDEX idx_dev_plans_player ON developmental_plans(player_id);
CREATE INDEX idx_dev_plans_team ON developmental_plans(team_id);
```

---

## 7. Messaging Tables

### 7.1 conversations

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Type
  conversation_type VARCHAR(20) DEFAULT 'direct' 
    CHECK (conversation_type IN ('direct', 'group', 'team')),
  
  -- For group/team conversations
  name VARCHAR(255),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  
  -- Metadata
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_conversations_team ON conversations(team_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

### 7.2 conversation_participants

```sql
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Status
  is_admin BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  
  -- Read tracking
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_unread ON conversation_participants(user_id, unread_count) WHERE unread_count > 0;
```

### 7.3 messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' 
    CHECK (message_type IN ('text', 'image', 'video', 'file', 'system')),
  
  -- Attachments (future)
  attachments JSONB DEFAULT '[]',
  
  -- Status
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_conversation_recent ON messages(conversation_id, sent_at DESC) 
  WHERE is_deleted = FALSE;
```

---

## 8. Events & Camps Tables

### 8.1 events

General events (games, showcases, tournaments).

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  
  event_type VARCHAR(50) NOT NULL 
    CHECK (event_type IN ('game', 'showcase', 'tournament', 'camp', 'combine', 'tryout', 'practice', 'other')),
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  is_all_day BOOLEAN DEFAULT FALSE,
  
  -- Location
  location_venue VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,
  
  -- Game specific
  opponent VARCHAR(255),
  home_away VARCHAR(10) CHECK (home_away IN ('home', 'away', 'neutral')),
  result VARCHAR(1) CHECK (result IN ('W', 'L', 'T')),
  score_us INTEGER,
  score_them INTEGER,
  
  -- Details
  level VARCHAR(50),  -- "Varsity", "JV", etc.
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
```

### 8.2 camps

Coach-hosted camps.

```sql
CREATE TABLE camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Timing
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  
  -- Location
  location VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_address TEXT,
  
  -- Capacity
  capacity INTEGER,
  registration_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,
  
  -- Pricing
  price DECIMAL(8,2),
  
  -- Status
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
```

### 8.3 camp_registrations

```sql
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
```

---

## 9. Analytics Tables

### 9.1 player_engagement_events

Tracks all engagement on player profiles.

```sql
CREATE TABLE player_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  -- Who engaged
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  viewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- What happened
  engagement_type VARCHAR(50) NOT NULL 
    CHECK (engagement_type IN (
      'profile_view', 'video_view', 'stats_view',
      'watchlist_add', 'watchlist_remove', 
      'message_sent', 'camp_interest', 'top5_add'
    )),
  
  engagement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Details
  view_duration_seconds INTEGER,
  video_id UUID REFERENCES player_videos(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  
  -- For anonymous tracking (player hasn't activated recruiting)
  is_anonymous BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_engagement_player ON player_engagement_events(player_id);
CREATE INDEX idx_engagement_coach ON player_engagement_events(coach_id);
CREATE INDEX idx_engagement_date ON player_engagement_events(engagement_date);
CREATE INDEX idx_engagement_type ON player_engagement_events(engagement_type);
CREATE INDEX idx_engagement_player_date ON player_engagement_events(player_id, engagement_date DESC);
```

### 9.2 notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Action
  action_url TEXT,
  action_label VARCHAR(100),
  
  -- Related entities
  related_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  related_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  related_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
```

---

## 10. Video Tables

### 10.1 player_videos

```sql
CREATE TABLE player_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  video_type VARCHAR(50) DEFAULT 'highlight'
    CHECK (video_type IN ('highlight', 'game', 'training', 'showcase', 'at_bat', 'pitching', 'fielding')),
  
  -- Source
  video_url TEXT NOT NULL,
  source_type VARCHAR(20) DEFAULT 'url'
    CHECK (source_type IN ('url', 'youtube', 'upload', 'hudl')),
  
  -- Media
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  
  -- Metadata
  recorded_date DATE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  
  -- Stats
  view_count INTEGER DEFAULT 0,
  
  -- Clips
  is_clip BOOLEAN DEFAULT FALSE,
  parent_video_id UUID REFERENCES player_videos(id) ON DELETE SET NULL,
  clip_start_seconds INTEGER,
  clip_end_seconds INTEGER,
  
  -- Status
  is_primary BOOLEAN DEFAULT FALSE,  -- Featured highlight
  is_public BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_videos_player ON player_videos(player_id);
CREATE INDEX idx_videos_type ON player_videos(video_type);
CREATE INDEX idx_videos_primary ON player_videos(player_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX idx_videos_parent ON player_videos(parent_video_id) WHERE parent_video_id IS NOT NULL;
```

### 10.2 video_library (Coach's organized video storage)

```sql
CREATE TABLE video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES player_videos(id) ON DELETE CASCADE,
  
  -- Organization
  folder VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  
  -- Status
  is_starred BOOLEAN DEFAULT FALSE,
  
  added_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(coach_id, video_id)
);

CREATE INDEX idx_video_library_coach ON video_library(coach_id);
CREATE INDEX idx_video_library_player ON video_library(player_id);
```

### 10.3 player_comparisons (Saved comparisons)

```sql
CREATE TABLE player_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  
  name VARCHAR(255),
  description TEXT,
  
  -- Players being compared
  player_ids UUID[] NOT NULL,  -- Array of player IDs
  
  -- Comparison data
  comparison_data JSONB DEFAULT '{}',  -- Cached stats, notes, etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_comparisons_coach ON player_comparisons(coach_id);
```

---

## 11. RLS Policies

### 11.1 Enable RLS on All Tables

```sql
-- Core
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Coaches
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruit_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_calendar_events ENABLE ROW LEVEL SECURITY;

-- Players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coach_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE developmental_plans ENABLE ROW LEVEL SECURITY;

-- Messaging
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_registrations ENABLE ROW LEVEL SECURITY;

-- Analytics
ALTER TABLE player_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Videos
ALTER TABLE player_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_comparisons ENABLE ROW LEVEL SECURITY;
```

### 11.2 Users Policies

```sql
-- Users can view and update own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);
```

### 11.3 Organizations Policies

```sql
-- Organizations are publicly readable
CREATE POLICY "Organizations are viewable by all" ON organizations
  FOR SELECT TO authenticated USING (true);
```

### 11.4 Coaches Policies

```sql
-- Coaches can view own data
CREATE POLICY "Coaches can view own data" ON coaches
  FOR SELECT USING (auth.uid() = user_id);

-- Coaches can update own data
CREATE POLICY "Coaches can update own data" ON coaches
  FOR UPDATE USING (auth.uid() = user_id);

-- Coaches can insert own data
CREATE POLICY "Coaches can insert own data" ON coaches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Public coach profiles are viewable (for players seeing who viewed them)
CREATE POLICY "Public coach info viewable" ON coaches
  FOR SELECT TO authenticated USING (true);
```

### 11.5 Recruit Watchlist Policies

```sql
-- Coaches can manage own watchlist
CREATE POLICY "Coaches can manage own watchlist" ON recruit_watchlist
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Players can see if they're on a watchlist (not details)
CREATE POLICY "Players can see own watchlist entries" ON recruit_watchlist
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
```

### 11.6 Coach Notes Policies

```sql
-- Notes are private to coach
CREATE POLICY "Coaches can manage own notes" ON coach_notes
  FOR ALL USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

### 11.7 Players Policies

```sql
-- Players can view and manage own data
CREATE POLICY "Players can view own data" ON players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Players can update own data" ON players
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Players can insert own data" ON players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Discoverable players are viewable by coaches
CREATE POLICY "Discoverable players viewable by coaches" ON players
  FOR SELECT TO authenticated
  USING (
    -- Own profile
    auth.uid() = user_id
    OR
    -- Or discoverable player viewed by coach
    (
      recruiting_activated = true 
      AND EXISTS (
        SELECT 1 FROM player_settings ps 
        WHERE ps.player_id = players.id AND ps.is_discoverable = true
      )
      AND EXISTS (SELECT 1 FROM coaches WHERE user_id = auth.uid())
    )
    OR
    -- Or team member viewed by team coach
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_coach_staff tcs ON tcs.team_id = tm.team_id
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE tm.player_id = players.id AND c.user_id = auth.uid()
    )
  );
```

### 11.8 Player Settings Policies

```sql
-- Players can manage own settings
CREATE POLICY "Players can manage own settings" ON player_settings
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );
```

### 11.9 Player Stats Policies

```sql
-- Players can view own stats
CREATE POLICY "Players can view own stats" ON player_stats
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Players can manage own stats
CREATE POLICY "Players can manage own stats" ON player_stats
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can view stats of players they have access to
CREATE POLICY "Coaches can view player stats" ON player_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.user_id = auth.uid()
      AND (
        -- On their watchlist
        EXISTS (SELECT 1 FROM recruit_watchlist rw WHERE rw.coach_id = c.id AND rw.player_id = player_stats.player_id)
        OR
        -- On their team
        EXISTS (
          SELECT 1 FROM team_coach_staff tcs
          JOIN team_members tm ON tm.team_id = tcs.team_id
          WHERE tcs.coach_id = c.id AND tm.player_id = player_stats.player_id
        )
      )
    )
  );
```

### 11.10 Evaluations Policies

```sql
-- Players can view own evaluations (public or private)
CREATE POLICY "Players can view own evaluations" ON evaluations
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can manage evaluations they created
CREATE POLICY "Coaches can manage own evaluations" ON evaluations
  FOR ALL USING (
    evaluator_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Public evaluations viewable by all authenticated
CREATE POLICY "Public evaluations viewable" ON evaluations
  FOR SELECT TO authenticated
  USING (is_public = true);
```

### 11.11 Teams Policies

```sql
-- Teams viewable by members and coaches
CREATE POLICY "Team members can view team" ON teams
  FOR SELECT TO authenticated
  USING (
    -- Is a member
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN players p ON p.id = tm.player_id
      WHERE tm.team_id = teams.id AND p.user_id = auth.uid()
    )
    OR
    -- Is a coach
    EXISTS (
      SELECT 1 FROM team_coach_staff tcs
      JOIN coaches c ON c.id = tcs.coach_id
      WHERE tcs.team_id = teams.id AND c.user_id = auth.uid()
    )
    OR
    -- Is head coach
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Coaches can manage their teams
CREATE POLICY "Coaches can manage own teams" ON teams
  FOR ALL USING (
    head_coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );
```

### 11.12 Team Members Policies

```sql
-- Team members viewable by team members/coaches
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
```

### 11.13 Messages Policies

```sql
-- Users can view messages in conversations they're part of
CREATE POLICY "Participants can view messages" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- Users can send messages to conversations they're part of
CREATE POLICY "Participants can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND conversation_id IN (
      SELECT conversation_id FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );
```

### 11.14 Engagement Events Policies

```sql
-- Players can view own engagement (with anonymous handling)
CREATE POLICY "Players can view own engagement" ON player_engagement_events
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Coaches can record engagement
CREATE POLICY "Coaches can record engagement" ON player_engagement_events
  FOR INSERT WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
    OR viewer_user_id = auth.uid()
  );
```

### 11.15 Notifications Policies

```sql
-- Users can manage own notifications
CREATE POLICY "Users can manage own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());
```

### 11.16 Videos Policies

```sql
-- Players can manage own videos
CREATE POLICY "Players can manage own videos" ON player_videos
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Public videos viewable by authenticated users
CREATE POLICY "Public videos viewable" ON player_videos
  FOR SELECT TO authenticated
  USING (is_public = true);
```

---

## 12. Database Functions

### 12.1 Update Timestamps Trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_coaches_updated_at BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- (Repeat for all tables with updated_at column)
```

### 12.2 Player Profile Completion

```sql
CREATE OR REPLACE FUNCTION calculate_profile_completion(p_player_id UUID)
RETURNS INTEGER AS $$
DECLARE
  completion INTEGER := 0;
  total_fields INTEGER := 20;
  filled_fields INTEGER := 0;
  player_rec RECORD;
BEGIN
  SELECT * INTO player_rec FROM players WHERE id = p_player_id;
  
  IF player_rec IS NULL THEN RETURN 0; END IF;
  
  -- Check each field
  IF player_rec.first_name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.last_name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.avatar_url IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.city IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.state IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.primary_position IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.grad_year IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.bats IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.throws IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.height_feet IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.weight_lbs IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.high_school_name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.pitch_velo IS NOT NULL OR player_rec.exit_velo IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.sixty_time IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.gpa IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.about_me IS NOT NULL AND player_rec.about_me != '' THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.primary_goal IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF player_rec.has_video = true THEN filled_fields := filled_fields + 2; END IF;  -- Videos worth more
  IF player_rec.highlight_url IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  
  completion := ROUND((filled_fields::DECIMAL / total_fields) * 100);
  
  -- Update the player record
  UPDATE players SET profile_completion_percent = completion WHERE id = p_player_id;
  
  RETURN completion;
END;
$$ LANGUAGE plpgsql;
```

### 12.3 Get Player Engagement Summary

```sql
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

### 12.4 Increment Camp Registration Count

```sql
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
    -- Handle status changes
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

---

## 13. Indexes

### 13.1 Performance Indexes

```sql
-- Players discovery (most common query)
CREATE INDEX idx_players_discovery ON players(
  recruiting_activated, grad_year, primary_position, state
) WHERE recruiting_activated = true;

-- Watchlist by status
CREATE INDEX idx_watchlist_coach_status ON recruit_watchlist(coach_id, status);

-- Messages performance
CREATE INDEX idx_messages_conv_sent ON messages(conversation_id, sent_at DESC);

-- Engagement analytics
CREATE INDEX idx_engagement_player_30d ON player_engagement_events(player_id, engagement_date)
  WHERE engagement_date > NOW() - INTERVAL '30 days';

-- Text search
CREATE INDEX idx_players_name_search ON players USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_organizations_name_search ON organizations USING gin(name gin_trgm_ops);
```

---

## 14. TypeScript Interfaces

### 14.1 Core Types

```typescript
// types/database.ts

export type UserRole = 'player' | 'coach' | 'admin';
export type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';
export type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';
export type PipelineStatus = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';

export interface User {
  id: string;
  email: string;
  role: UserRole;
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
  athletic_conference: string | null;
  about: string | null;
  program_philosophy: string | null;
  logo_url: string | null;
  primary_color: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
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
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  gpa: number | null;
  about_me: string | null;
  primary_goal: string | null;
  highlight_url: string | null;
  has_video: boolean;
  recruiting_activated: boolean;
  onboarding_completed: boolean;
  profile_completion_percent: number;
  created_at: string;
  updated_at: string;
}

export interface WatchlistEntry {
  id: string;
  coach_id: string;
  player_id: string;
  status: PipelineStatus;
  position_role: string | null;
  notes: string | null;
  priority: number;
  added_at: string;
  created_at: string;
  updated_at: string;
  // Joined
  player?: Player;
}

export interface Team {
  id: string;
  organization_id: string | null;
  name: string;
  team_type: string;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  head_coach_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  head_coach?: Coach;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  status: string;
  joined_at: string;
  // Joined
  player?: Player;
}

export interface Conversation {
  id: string;
  conversation_type: 'direct' | 'group' | 'team';
  name: string | null;
  team_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  // Joined
  participants?: ConversationParticipant[];
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  sent_at: string;
  // Joined
  sender?: User;
}
```

---

## 15. Migration Order

Execute migrations in this order to satisfy foreign key dependencies:

```
001_extensions.sql          -- Enable extensions
002_users.sql               -- Core users table
003_organizations.sql       -- Organizations
004_coaches.sql             -- Coaches
005_players.sql             -- Players
006_player_settings.sql     -- Player settings
007_player_metrics.sql      -- Player metrics
008_player_achievements.sql -- Player achievements
009_recruiting_interests.sql -- Recruiting interests
010_evaluations.sql         -- Evaluations
011_player_stats.sql        -- Player stats
012_teams.sql               -- Teams
013_team_members.sql        -- Team members
014_team_invitations.sql    -- Team invitations
015_team_coach_staff.sql    -- Team coach staff
016_developmental_plans.sql -- Dev plans
017_recruit_watchlist.sql   -- Watchlist
018_coach_notes.sql         -- Coach notes
019_coach_calendar.sql      -- Coach calendar
020_conversations.sql       -- Conversations
021_messages.sql            -- Messages
022_events.sql              -- Events
023_camps.sql               -- Camps
024_camp_registrations.sql  -- Camp registrations
025_player_videos.sql       -- Player videos
026_video_library.sql       -- Video library
027_player_comparisons.sql  -- Player comparisons
028_engagement_events.sql   -- Engagement events
029_notifications.sql       -- Notifications
030_rls_policies.sql        -- All RLS policies
031_functions.sql           -- Database functions
032_triggers.sql            -- Triggers
033_indexes.sql             -- Additional indexes
034_seed_data.sql           -- Seed data (dev only)
```

---

**Document End**

*This schema represents the complete database structure for Helm Sports Labs. All tables, relationships, and policies have been consolidated from the Coaches Dashboard PRD and Players Dashboard PRD.*
