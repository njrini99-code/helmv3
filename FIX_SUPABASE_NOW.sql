-- 🔧 FIXED SQL - Run this in Supabase SQL Editor
-- This will fix everything and allow dev mode without auth

-- Drop existing tables if they exist (fresh start)
DROP TABLE IF EXISTS golf_hole_shots CASCADE;
DROP TABLE IF EXISTS golf_holes CASCADE;
DROP TABLE IF EXISTS round_holes CASCADE;
DROP TABLE IF EXISTS golf_rounds CASCADE;
DROP TABLE IF EXISTS golf_players CASCADE;

-- Create golf_players (user_id is NULLABLE for dev mode)
CREATE TABLE golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL allowed
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  handicap_index DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create golf_rounds
CREATE TABLE golf_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  course_city TEXT,
  course_state TEXT,
  tees_played TEXT,
  course_rating DECIMAL(4,1),
  course_slope INTEGER,
  round_type TEXT CHECK (round_type IN ('practice', 'qualifying', 'tournament')),
  round_date DATE NOT NULL,
  starting_hole INTEGER,
  total_score INTEGER,
  total_to_par INTEGER,
  total_putts INTEGER,
  fairways_hit INTEGER,
  fairways_total INTEGER DEFAULT 14,
  greens_in_regulation INTEGER,
  greens_total INTEGER DEFAULT 18,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create golf_holes
CREATE TABLE golf_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 6),
  yardage INTEGER,
  score INTEGER DEFAULT 0,
  score_to_par INTEGER,
  putts INTEGER,
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Create golf_hole_shots
CREATE TABLE golf_hole_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  shots_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Create indexes
CREATE INDEX idx_golf_players_user_id ON golf_players(user_id);
CREATE INDEX idx_golf_players_email ON golf_players(email);
CREATE INDEX idx_golf_rounds_player_id ON golf_rounds(player_id);
CREATE INDEX idx_golf_rounds_date ON golf_rounds(round_date DESC);
CREATE INDEX idx_golf_holes_round_id ON golf_holes(round_id);
CREATE INDEX idx_golf_hole_shots_round_id ON golf_hole_shots(round_id);

-- 🔓 DISABLE RLS (allows dev mode without auth)
ALTER TABLE golf_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_hole_shots DISABLE ROW LEVEL SECURITY;

-- ✅ Create a dev test player automatically
INSERT INTO golf_players (first_name, last_name, email, handicap_index)
VALUES ('Dev', 'Tester', 'dev-test@golfhelm.com', 10.0);

-- Show success message
SELECT
  '✅ SUCCESS!' as status,
  'Golf tables created and RLS disabled' as message,
  id as dev_player_id,
  first_name || ' ' || last_name as dev_player_name
FROM golf_players
WHERE email = 'dev-test@golfhelm.com'
LIMIT 1;
