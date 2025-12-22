-- 🏌️ Golf Tables Setup - Copy this entire file and run in Supabase SQL Editor

-- Golf Player Profiles
CREATE TABLE IF NOT EXISTS golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- Changed to allow NULL for dev
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  handicap_index DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golf Rounds
CREATE TABLE IF NOT EXISTS golf_rounds (
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

-- Golf Holes (hole-by-hole scores)
CREATE TABLE IF NOT EXISTS golf_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 6),
  yardage INTEGER,
  score INTEGER,
  score_to_par INTEGER,
  putts INTEGER,
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Golf Hole Shots (detailed shot tracking)
CREATE TABLE IF NOT EXISTS golf_hole_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  shots_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_golf_players_user_id ON golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_email ON golf_players(email);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_id ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_date ON golf_rounds(round_date DESC);
CREATE INDEX IF NOT EXISTS idx_golf_holes_round_id ON golf_holes(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_hole_shots_round_id ON golf_hole_shots(round_id);

-- 🔓 DISABLE RLS FOR DEV MODE (allows testing without authentication)
ALTER TABLE golf_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_hole_shots DISABLE ROW LEVEL SECURITY;

-- ✅ Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Golf tables created successfully! RLS disabled for dev mode.';
  RAISE NOTICE '🚀 You can now test without authentication!';
END $$;
