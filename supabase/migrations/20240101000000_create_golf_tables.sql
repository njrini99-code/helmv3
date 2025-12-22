-- Golf Player Profiles
CREATE TABLE IF NOT EXISTS golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  handicap_index DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Golf Rounds
CREATE TABLE IF NOT EXISTS golf_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  course_city TEXT,
  course_state TEXT,
  tee_name TEXT,
  course_rating DECIMAL(4,1),
  slope_rating INTEGER,
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

-- Round Holes (pre-round hole configuration)
CREATE TABLE IF NOT EXISTS round_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par INTEGER NOT NULL CHECK (par >= 3 AND par <= 6),
  yardage INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_golf_players_user_id ON golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_id ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_date ON golf_rounds(round_date DESC);
CREATE INDEX IF NOT EXISTS idx_golf_holes_round_id ON golf_holes(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_hole_shots_round_id ON golf_hole_shots(round_id);
CREATE INDEX IF NOT EXISTS idx_round_holes_round_id ON round_holes(round_id);

-- Enable Row Level Security
ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_hole_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_holes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for golf_players
CREATE POLICY "Users can view their own golf player profile"
  ON golf_players FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own golf player profile"
  ON golf_players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own golf player profile"
  ON golf_players FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own golf player profile"
  ON golf_players FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for golf_rounds
CREATE POLICY "Users can view their own golf rounds"
  ON golf_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_rounds.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own golf rounds"
  ON golf_rounds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_rounds.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own golf rounds"
  ON golf_rounds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_rounds.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own golf rounds"
  ON golf_rounds FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_rounds.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- RLS Policies for golf_holes
CREATE POLICY "Users can view their own golf holes"
  ON golf_holes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own golf holes"
  ON golf_holes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own golf holes"
  ON golf_holes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own golf holes"
  ON golf_holes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- RLS Policies for golf_hole_shots
CREATE POLICY "Users can view their own golf hole shots"
  ON golf_hole_shots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_hole_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own golf hole shots"
  ON golf_hole_shots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_hole_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own golf hole shots"
  ON golf_hole_shots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_hole_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own golf hole shots"
  ON golf_hole_shots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = golf_hole_shots.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- RLS Policies for round_holes
CREATE POLICY "Users can view their own round holes"
  ON round_holes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = round_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own round holes"
  ON round_holes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = round_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own round holes"
  ON round_holes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = round_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own round holes"
  ON round_holes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM golf_rounds
      JOIN golf_players ON golf_players.id = golf_rounds.player_id
      WHERE golf_rounds.id = round_holes.round_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_golf_players_updated_at BEFORE UPDATE ON golf_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_golf_rounds_updated_at BEFORE UPDATE ON golf_rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_golf_holes_updated_at BEFORE UPDATE ON golf_holes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_golf_hole_shots_updated_at BEFORE UPDATE ON golf_hole_shots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
