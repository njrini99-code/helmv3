-- Migration 037: Baseball Missing Tables
-- Creates baseball-specific tables that are referenced in code but missing from database

-- ============================================================================
-- 1. baseball_team_invitations - Team join invite links
-- ============================================================================

-- Reconciliation: migration 036 renamed legacy `team_invitations` to
-- `baseball_team_invitations` but kept the legacy column names from
-- 006_teams.sql. Align them with the new schema so `CREATE TABLE IF NOT EXISTS`
-- becomes a no-op with the correct shape and downstream DDL succeeds.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'baseball_team_invitations'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'baseball_team_invitations' AND column_name = 'invite_code') THEN
      ALTER TABLE baseball_team_invitations RENAME COLUMN invite_code TO code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'baseball_team_invitations' AND column_name = 'created_by') THEN
      ALTER TABLE baseball_team_invitations RENAME COLUMN created_by TO created_by_coach_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'baseball_team_invitations' AND column_name = 'current_uses') THEN
      ALTER TABLE baseball_team_invitations RENAME COLUMN current_uses TO used_count;
    END IF;
    ALTER TABLE baseball_team_invitations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS baseball_team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  code VARCHAR(8) UNIQUE NOT NULL,
  created_by_coach_id UUID NOT NULL REFERENCES baseball_coaches(id),
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_team_invitations_team ON baseball_team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_team_invitations_code ON baseball_team_invitations(code);

-- RLS for baseball_team_invitations
ALTER TABLE baseball_team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their team invitations" ON baseball_team_invitations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_coach_staff tcs
      JOIN baseball_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
      AND tcs.team_id = baseball_team_invitations.team_id
    )
  );

CREATE POLICY "Anyone can view active invitations by code" ON baseball_team_invitations
  FOR SELECT TO authenticated
  USING (is_active = true);

-- ============================================================================
-- 2. baseball_team_lineups - Saved batting lineups
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_team_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  created_by_coach_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_team_lineups_team ON baseball_team_lineups(team_id);

-- RLS for baseball_team_lineups
ALTER TABLE baseball_team_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their team lineups" ON baseball_team_lineups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_coach_staff tcs
      JOIN baseball_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
      AND tcs.team_id = baseball_team_lineups.team_id
    )
  );

CREATE POLICY "Players can view their team lineups" ON baseball_team_lineups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      JOIN baseball_players p ON p.id = tm.player_id
      WHERE p.user_id = auth.uid()
      AND tm.team_id = baseball_team_lineups.team_id
    )
  );

-- ============================================================================
-- 3. baseball_lineup_positions - Player positions in lineups
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_lineup_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES baseball_team_lineups(id) ON DELETE CASCADE,
  batting_order INT NOT NULL CHECK (batting_order >= 1 AND batting_order <= 9),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lineup_id, batting_order),
  UNIQUE(lineup_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_lineup_positions_lineup ON baseball_lineup_positions(lineup_id);

-- RLS for baseball_lineup_positions
ALTER TABLE baseball_lineup_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage lineup positions" ON baseball_lineup_positions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_lineups l
      JOIN baseball_team_coach_staff tcs ON tcs.team_id = l.team_id
      JOIN baseball_coaches c ON c.id = tcs.coach_id
      WHERE l.id = baseball_lineup_positions.lineup_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can view lineup positions" ON baseball_lineup_positions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_lineups l
      JOIN baseball_team_members tm ON tm.team_id = l.team_id
      JOIN baseball_players p ON p.id = tm.player_id
      WHERE l.id = baseball_lineup_positions.lineup_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. baseball_player_stats - Practice/game statistics
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES baseball_coaches(id),
  stat_type TEXT NOT NULL CHECK (stat_type IN ('practice', 'game', 'other')),
  session_date DATE NOT NULL,
  session_name TEXT,

  -- Hitting stats
  at_bats INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbis INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,

  -- Pitching stats
  innings_pitched NUMERIC(4,1) DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  hits_allowed INTEGER DEFAULT 0,
  walks_allowed INTEGER DEFAULT 0,
  strikeouts_thrown INTEGER DEFAULT 0,

  -- Fielding stats
  putouts INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,

  -- Metrics
  exit_velocity NUMERIC(5,1),
  pitch_velocity NUMERIC(5,1),

  source TEXT DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_player ON baseball_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_team_date ON baseball_player_stats(team_id, session_date DESC);

-- RLS for baseball_player_stats
ALTER TABLE baseball_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage player stats" ON baseball_player_stats
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_coach_staff tcs
      JOIN baseball_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
      AND tcs.team_id = baseball_player_stats.team_id
    )
  );

CREATE POLICY "Players can view their own stats" ON baseball_player_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_players p
      WHERE p.user_id = auth.uid()
      AND p.id = baseball_player_stats.player_id
    )
  );

-- ============================================================================
-- 5. baseball_player_percentiles - Calculated percentile rankings
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_percentiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  grad_year INTEGER NOT NULL,
  percentile_exit_velocity INTEGER CHECK (percentile_exit_velocity BETWEEN 0 AND 100),
  percentile_pitch_velocity INTEGER CHECK (percentile_pitch_velocity BETWEEN 0 AND 100),
  percentile_sixty_time INTEGER CHECK (percentile_sixty_time BETWEEN 0 AND 100),
  percentile_gpa INTEGER CHECK (percentile_gpa BETWEEN 0 AND 100),
  composite_athletic INTEGER CHECK (composite_athletic BETWEEN 0 AND 100),
  composite_academic INTEGER CHECK (composite_academic BETWEEN 0 AND 100),
  is_stale BOOLEAN DEFAULT FALSE,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_player_percentiles_grad_year ON baseball_player_percentiles(grad_year);

-- RLS for baseball_player_percentiles
ALTER TABLE baseball_player_percentiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view percentiles" ON baseball_player_percentiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System can manage percentiles" ON baseball_player_percentiles
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- 6. baseball_coach_recruiting_philosophy - Coach recruiting preferences
-- ============================================================================
CREATE TABLE IF NOT EXISTS baseball_coach_recruiting_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,

  -- Weight factors (should sum to 100)
  weight_exit_velocity INTEGER DEFAULT 20,
  weight_pitch_velocity INTEGER DEFAULT 20,
  weight_sixty_time INTEGER DEFAULT 15,
  weight_gpa INTEGER DEFAULT 15,
  weight_height INTEGER DEFAULT 10,
  weight_weight INTEGER DEFAULT 10,
  weight_arm_strength INTEGER DEFAULT 10,

  -- Position preferences
  position_priorities JSONB DEFAULT '[]',

  -- Minimum requirements
  min_gpa DECIMAL(3,2),
  min_exit_velocity INTEGER,
  min_pitch_velocity INTEGER,
  max_sixty_time DECIMAL(4,2),

  -- Geographic preferences
  preferred_states JSONB DEFAULT '[]',
  max_distance_miles INTEGER,

  -- Target recruiting classes
  target_grad_years JSONB DEFAULT '[]',

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_recruiting_philosophy_coach ON baseball_coach_recruiting_philosophy(coach_id);

-- RLS for baseball_coach_recruiting_philosophy
ALTER TABLE baseball_coach_recruiting_philosophy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own philosophy" ON baseball_coach_recruiting_philosophy
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_coaches c
      WHERE c.user_id = auth.uid()
      AND c.id = baseball_coach_recruiting_philosophy.coach_id
    )
  );

-- ============================================================================
-- Update triggers for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_baseball_team_invitations_updated_at ON baseball_team_invitations;
CREATE TRIGGER update_baseball_team_invitations_updated_at
    BEFORE UPDATE ON baseball_team_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_team_lineups_updated_at ON baseball_team_lineups;
CREATE TRIGGER update_baseball_team_lineups_updated_at
    BEFORE UPDATE ON baseball_team_lineups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_player_stats_updated_at ON baseball_player_stats;
CREATE TRIGGER update_baseball_player_stats_updated_at
    BEFORE UPDATE ON baseball_player_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_player_percentiles_updated_at ON baseball_player_percentiles;
CREATE TRIGGER update_baseball_player_percentiles_updated_at
    BEFORE UPDATE ON baseball_player_percentiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_coach_recruiting_philosophy_updated_at ON baseball_coach_recruiting_philosophy;
CREATE TRIGGER update_baseball_coach_recruiting_philosophy_updated_at
    BEFORE UPDATE ON baseball_coach_recruiting_philosophy
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
