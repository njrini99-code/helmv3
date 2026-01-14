-- ============================================================================
-- Migration: 024_golf_qualifiers.sql
-- Purpose: Golf qualifying events and entries
-- Consolidated from: 016_create_golf_schema.sql (qualifiers section)
-- ============================================================================

-- Golf Qualifiers
CREATE TABLE IF NOT EXISTS golf_qualifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  course_name TEXT,
  course_id UUID REFERENCES golf_courses(id),
  location TEXT,
  num_rounds INTEGER NOT NULL DEFAULT 1,
  holes_per_round INTEGER NOT NULL DEFAULT 18,
  start_date DATE NOT NULL,
  end_date DATE,
  status golf_qualifier_status DEFAULT 'upcoming',
  show_live_leaderboard BOOLEAN DEFAULT TRUE,
  spots_available INTEGER,
  tournament_name TEXT,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_team ON golf_qualifiers(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_status ON golf_qualifiers(status);
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_date ON golf_qualifiers(start_date);

-- Golf Qualifier Entries
CREATE TABLE IF NOT EXISTS golf_qualifier_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualifier_id UUID NOT NULL REFERENCES golf_qualifiers(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  position INTEGER,
  is_tied BOOLEAN DEFAULT FALSE,
  total_score INTEGER,
  total_to_par INTEGER,
  rounds_completed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'registered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(qualifier_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_entries_qualifier ON golf_qualifier_entries(qualifier_id);
CREATE INDEX IF NOT EXISTS idx_golf_entries_player ON golf_qualifier_entries(player_id);

-- Add foreign key from golf_rounds to golf_qualifiers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_golf_rounds_qualifier'
    AND table_name = 'golf_rounds'
  ) THEN
    ALTER TABLE golf_rounds
    ADD CONSTRAINT fk_golf_rounds_qualifier
    FOREIGN KEY (qualifier_id) REFERENCES golf_qualifiers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Triggers
CREATE TRIGGER update_golf_qualifiers_updated_at
  BEFORE UPDATE ON golf_qualifiers
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_qualifier_entries_updated_at
  BEFORE UPDATE ON golf_qualifier_entries
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Helper function: Update qualifier leaderboard
CREATE OR REPLACE FUNCTION update_qualifier_leaderboard(p_qualifier_id UUID)
RETURNS void AS $$
BEGIN
  -- Update entry totals from rounds
  UPDATE golf_qualifier_entries qe
  SET
    total_score = (
      SELECT COALESCE(SUM(total_score), 0)
      FROM golf_rounds
      WHERE qualifier_id = p_qualifier_id AND player_id = qe.player_id
    ),
    total_to_par = (
      SELECT COALESCE(SUM(total_to_par), 0)
      FROM golf_rounds
      WHERE qualifier_id = p_qualifier_id AND player_id = qe.player_id
    ),
    rounds_completed = (
      SELECT COUNT(*)
      FROM golf_rounds
      WHERE qualifier_id = p_qualifier_id AND player_id = qe.player_id AND round_status = 'completed'
    )
  WHERE qe.qualifier_id = p_qualifier_id;

  -- Update positions based on total_to_par
  WITH ranked AS (
    SELECT
      id,
      RANK() OVER (ORDER BY total_to_par ASC) as pos,
      COUNT(*) OVER (PARTITION BY total_to_par) > 1 as tied
    FROM golf_qualifier_entries
    WHERE qualifier_id = p_qualifier_id
  )
  UPDATE golf_qualifier_entries qe
  SET
    position = ranked.pos,
    is_tied = ranked.tied
  FROM ranked
  WHERE qe.id = ranked.id;
END;
$$ LANGUAGE plpgsql;

-- Documentation
COMMENT ON TABLE golf_qualifiers IS 'Qualifying events to determine tournament spots';
COMMENT ON TABLE golf_qualifier_entries IS 'Player entries and standings in qualifiers';
