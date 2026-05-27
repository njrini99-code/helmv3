-- ============================================================================
-- Migration: 007_watchlists.sql
-- Purpose: Recruiting watchlists/pipeline
-- Consolidated from: 001_schema.sql, 015_enhance_watchlist.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pipeline_stage pipeline_stage DEFAULT 'watchlist',
  notes TEXT,
  priority INTEGER DEFAULT 0,
  tags TEXT[],
  fit_score INTEGER,
  source TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stage ON watchlists(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_watchlists_priority ON watchlists(coach_id, priority DESC);

-- Trigger
CREATE TRIGGER update_watchlists_updated_at
  BEFORE UPDATE ON watchlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
