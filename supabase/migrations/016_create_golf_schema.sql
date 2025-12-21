-- ============================================================================
-- GOLF SCHEMA - Completely separate from baseball
-- Migration: 016_create_golf_schema.sql
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE golf_player_year AS ENUM ('freshman', 'sophomore', 'junior', 'senior', 'fifth_year', 'graduate');
CREATE TYPE golf_player_status AS ENUM ('active', 'injured', 'redshirt', 'inactive');
CREATE TYPE golf_round_type AS ENUM ('tournament', 'qualifier', 'practice', 'casual');
CREATE TYPE golf_event_type AS ENUM ('practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other');
CREATE TYPE golf_qualifier_status AS ENUM ('upcoming', 'in_progress', 'completed');
CREATE TYPE golf_urgency_level AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE golf_task_status AS ENUM ('pending', 'completed', 'overdue');
CREATE TYPE golf_transportation_type AS ENUM ('bus', 'van', 'fly', 'carpool');
CREATE TYPE golf_attendance_status AS ENUM ('attending', 'not_attending', 'maybe', 'pending');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Golf Organizations (Schools/Programs)
CREATE TABLE golf_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  city TEXT,
  state TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golf Teams (Men's Golf, Women's Golf per organization)
CREATE TABLE golf_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES golf_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  season TEXT,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for invite code lookups
CREATE INDEX idx_golf_teams_invite_code ON golf_teams(invite_code) WHERE invite_code IS NOT NULL;

-- Golf Coaches
CREATE TABLE golf_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES golf_organizations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golf Players
CREATE TABLE golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  year golf_player_year,
  graduation_year INTEGER,
  major TEXT,
  hometown TEXT,
  state TEXT,
  handicap DECIMAL(4,1),
  scholarship_percentage DECIMAL(5,2),
  gpa DECIMAL(3,2),
  status golf_player_status DEFAULT 'active',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROUNDS & HOLES
-- ============================================================================

-- Golf Rounds
CREATE TABLE golf_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  qualifier_id UUID, -- Will reference golf_qualifiers after it's created
  round_number INTEGER,
  course_name TEXT NOT NULL,
  course_city TEXT,
  course_state TEXT,
  course_rating DECIMAL(4,1),
  course_slope INTEGER,
  tees_played TEXT,
  round_type golf_round_type NOT NULL DEFAULT 'practice',
  round_date DATE NOT NULL,
  total_score INTEGER,
  total_to_par INTEGER,
  total_putts INTEGER,
  fairways_hit INTEGER,
  fairways_total INTEGER,
  greens_in_regulation INTEGER,
  greens_total INTEGER,
  total_penalties INTEGER,
  notes TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES golf_coaches(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_golf_rounds_player ON golf_rounds(player_id);
CREATE INDEX idx_golf_rounds_date ON golf_rounds(round_date DESC);
CREATE INDEX idx_golf_rounds_qualifier ON golf_rounds(qualifier_id) WHERE qualifier_id IS NOT NULL;

-- Golf Holes (Individual hole scores within a round)
CREATE TABLE golf_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 5),
  score INTEGER NOT NULL CHECK (score >= 1),
  score_to_par INTEGER GENERATED ALWAYS AS (score - par) STORED,
  putts INTEGER CHECK (putts >= 0),
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  penalties INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(round_id, hole_number)
);

-- Create index for hole lookups
CREATE INDEX idx_golf_holes_round ON golf_holes(round_id);

-- ============================================================================
-- EVENTS & CALENDAR
-- ============================================================================

-- Golf Events
CREATE TABLE golf_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type golf_event_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  course_name TEXT,
  description TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for event queries
CREATE INDEX idx_golf_events_team ON golf_events(team_id);
CREATE INDEX idx_golf_events_date ON golf_events(start_date);

-- Golf Event Attendance
CREATE TABLE golf_event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  status golf_attendance_status DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  UNIQUE(event_id, player_id)
);

-- ============================================================================
-- QUALIFIERS
-- ============================================================================

-- Golf Qualifiers
CREATE TABLE golf_qualifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  course_name TEXT,
  location TEXT,
  num_rounds INTEGER NOT NULL DEFAULT 1,
  holes_per_round INTEGER NOT NULL DEFAULT 18,
  start_date DATE NOT NULL,
  end_date DATE,
  status golf_qualifier_status DEFAULT 'upcoming',
  show_live_leaderboard BOOLEAN DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for qualifier queries
CREATE INDEX idx_golf_qualifiers_team ON golf_qualifiers(team_id);
CREATE INDEX idx_golf_qualifiers_status ON golf_qualifiers(status);

-- Golf Qualifier Entries (Players participating in a qualifier)
CREATE TABLE golf_qualifier_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualifier_id UUID NOT NULL REFERENCES golf_qualifiers(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  position INTEGER,
  is_tied BOOLEAN DEFAULT FALSE,
  total_score INTEGER,
  total_to_par INTEGER,
  rounds_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(qualifier_id, player_id)
);

-- Add foreign key from golf_rounds to golf_qualifiers
ALTER TABLE golf_rounds
ADD CONSTRAINT fk_golf_rounds_qualifier
FOREIGN KEY (qualifier_id) REFERENCES golf_qualifiers(id) ON DELETE SET NULL;

-- ============================================================================
-- COMMUNICATION
-- ============================================================================

-- Golf Announcements
CREATE TABLE golf_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  urgency golf_urgency_level DEFAULT 'normal',
  requires_acknowledgement BOOLEAN DEFAULT FALSE,
  send_push BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for announcement queries
CREATE INDEX idx_golf_announcements_team ON golf_announcements(team_id);
CREATE INDEX idx_golf_announcements_published ON golf_announcements(published_at DESC);

-- Golf Announcement Acknowledgements
CREATE TABLE golf_announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, player_id)
);

-- ============================================================================
-- TASKS
-- ============================================================================

-- Golf Tasks
CREATE TABLE golf_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES golf_players(id) ON DELETE CASCADE, -- NULL = all players
  due_date DATE,
  requires_upload BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for task queries
CREATE INDEX idx_golf_tasks_team ON golf_tasks(team_id);
CREATE INDEX idx_golf_tasks_due ON golf_tasks(due_date);

-- Golf Task Completions
CREATE TABLE golf_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES golf_tasks(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  upload_url TEXT,
  UNIQUE(task_id, player_id)
);

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

-- Golf Documents
CREATE TABLE golf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  category TEXT,
  player_visible BOOLEAN DEFAULT TRUE,
  uploaded_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for document queries
CREATE INDEX idx_golf_documents_team ON golf_documents(team_id);

-- ============================================================================
-- TRAVEL
-- ============================================================================

-- Golf Travel Itineraries
CREATE TABLE golf_travel_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  event_id UUID REFERENCES golf_events(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  transportation_type golf_transportation_type NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIME,
  departure_location TEXT,
  return_date DATE,
  return_time TIME,
  flight_info TEXT,
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_phone TEXT,
  hotel_confirmation TEXT,
  check_in_date DATE,
  check_out_date DATE,
  room_assignments TEXT,
  uniform_requirements TEXT,
  gear_list TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for travel queries
CREATE INDEX idx_golf_travel_team ON golf_travel_itineraries(team_id);
CREATE INDEX idx_golf_travel_date ON golf_travel_itineraries(departure_date);

-- ============================================================================
-- COACH NOTES
-- ============================================================================

-- Golf Coach Notes (Private notes on players)
CREATE TABLE golf_coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  meeting_date DATE,
  meeting_type TEXT,
  shared_with_player BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for note queries
CREATE INDEX idx_golf_coach_notes_player ON golf_coach_notes(player_id);
CREATE INDEX idx_golf_coach_notes_coach ON golf_coach_notes(coach_id);

-- ============================================================================
-- ACADEMICS
-- ============================================================================

-- Golf Player Classes (Academic schedule)
CREATE TABLE golf_player_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  course_code TEXT,
  course_name TEXT NOT NULL,
  instructor TEXT,
  location TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  semester TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for class queries
CREATE INDEX idx_golf_player_classes_player ON golf_player_classes(player_id);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================

-- Function for auto-updating updated_at (if not already exists)
CREATE OR REPLACE FUNCTION update_golf_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all golf tables with updated_at column
CREATE TRIGGER update_golf_organizations_updated_at
  BEFORE UPDATE ON golf_organizations
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_teams_updated_at
  BEFORE UPDATE ON golf_teams
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_coaches_updated_at
  BEFORE UPDATE ON golf_coaches
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_players_updated_at
  BEFORE UPDATE ON golf_players
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_rounds_updated_at
  BEFORE UPDATE ON golf_rounds
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_events_updated_at
  BEFORE UPDATE ON golf_events
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_qualifiers_updated_at
  BEFORE UPDATE ON golf_qualifiers
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_announcements_updated_at
  BEFORE UPDATE ON golf_announcements
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_tasks_updated_at
  BEFORE UPDATE ON golf_tasks
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_documents_updated_at
  BEFORE UPDATE ON golf_documents
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_travel_itineraries_updated_at
  BEFORE UPDATE ON golf_travel_itineraries
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_coach_notes_updated_at
  BEFORE UPDATE ON golf_coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_player_classes_updated_at
  BEFORE UPDATE ON golf_player_classes
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();
