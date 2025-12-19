-- Helm Sports Labs - Database Schema
-- Version: 1.0
-- Run this in Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE coach_type AS ENUM ('college', 'high_school', 'juco', 'showcase');
CREATE TYPE player_type AS ENUM ('high_school', 'showcase', 'juco', 'college');
CREATE TYPE pipeline_stage AS ENUM ('watchlist', 'priority', 'offer_extended', 'committed');

-- Organizations
CREATE TABLE colleges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  division VARCHAR(50),
  conference VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(50),
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE high_schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coaches
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_type coach_type NOT NULL,
  full_name VARCHAR(255),
  email_contact VARCHAR(255),
  phone VARCHAR(20),
  avatar_url TEXT,
  coach_title VARCHAR(100),
  college_id UUID REFERENCES colleges(id),
  high_school_id UUID REFERENCES high_schools(id),
  school_name VARCHAR(255),
  school_city VARCHAR(100),
  school_state VARCHAR(50),
  program_division VARCHAR(50),
  about TEXT,
  primary_color VARCHAR(7),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_type player_type NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  avatar_url TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  primary_position VARCHAR(10),
  secondary_position VARCHAR(10),
  grad_year INTEGER,
  bats VARCHAR(1),
  throws VARCHAR(1),
  height_feet INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,
  high_school_name VARCHAR(255),
  high_school_id UUID REFERENCES high_schools(id),
  pitch_velo DECIMAL(4,1),
  exit_velo DECIMAL(4,1),
  sixty_time DECIMAL(3,2),
  gpa DECIMAL(3,2),
  sat_score INTEGER,
  act_score INTEGER,
  about_me TEXT,
  has_video BOOLEAN DEFAULT FALSE,
  recruiting_activated BOOLEAN DEFAULT FALSE,
  committed_to UUID REFERENCES colleges(id),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  profile_completion_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Watchlists (Coach Pipeline)
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pipeline_stage pipeline_stage DEFAULT 'watchlist',
  notes TEXT,
  priority INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, player_id)
);

-- Videos
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  video_type VARCHAR(50),
  url TEXT,
  thumbnail_url TEXT,
  duration INTEGER,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile Views
CREATE TABLE profile_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id),
  viewer_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  action_url TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_players_grad_year ON players(grad_year);
CREATE INDEX idx_players_position ON players(primary_position);
CREATE INDEX idx_players_state ON players(state);
CREATE INDEX idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX idx_watchlists_player ON watchlists(player_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Coaches can manage own profile" ON coaches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Players can manage own profile" ON players FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Coaches manage own watchlist" ON watchlists FOR ALL USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));
CREATE POLICY "Players manage own videos" ON videos FOR ALL USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));
CREATE POLICY "Users see own notifications" ON notifications FOR ALL USING (user_id = auth.uid());

-- Seed colleges
INSERT INTO colleges (name, division, conference, city, state) VALUES
  ('Texas A&M', 'D1', 'SEC', 'College Station', 'TX'),
  ('Texas', 'D1', 'SEC', 'Austin', 'TX'),
  ('Rice', 'D1', 'AAC', 'Houston', 'TX'),
  ('Houston', 'D1', 'Big 12', 'Houston', 'TX'),
  ('TCU', 'D1', 'Big 12', 'Fort Worth', 'TX'),
  ('LSU', 'D1', 'SEC', 'Baton Rouge', 'LA');
