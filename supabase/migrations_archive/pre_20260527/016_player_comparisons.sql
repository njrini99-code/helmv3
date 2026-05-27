-- ============================================================================
-- Migration: 016_player_comparisons.sql
-- Purpose: Saved player comparisons for coaches
-- Consolidated from: 018_create_player_comparisons.sql
-- ============================================================================

-- Player Comparisons
CREATE TABLE IF NOT EXISTS player_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  player_ids UUID[] NOT NULL,
  comparison_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comparisons_coach ON player_comparisons(coach_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON player_comparisons(created_at DESC);

-- Triggers
CREATE OR REPLACE FUNCTION update_player_comparisons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER player_comparisons_updated_at
  BEFORE UPDATE ON player_comparisons
  FOR EACH ROW EXECUTE FUNCTION update_player_comparisons_updated_at();

-- Documentation
COMMENT ON TABLE player_comparisons IS 'Saved player comparisons for coaches to reference later';
COMMENT ON COLUMN player_comparisons.player_ids IS 'Array of player UUIDs being compared';
COMMENT ON COLUMN player_comparisons.comparison_data IS 'Cached stats, notes, radar chart data, etc.';
