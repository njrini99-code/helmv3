-- Migration: Create player_comparisons table
-- Description: Enables coaches to save player comparisons for future reference

-- Create player_comparisons table
CREATE TABLE IF NOT EXISTS player_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Players being compared (array of player IDs)
  player_ids UUID[] NOT NULL,

  -- Comparison data (cached stats, notes, radar chart data, etc.)
  comparison_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comparisons_coach ON player_comparisons(coach_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON player_comparisons(created_at DESC);

-- Enable RLS
ALTER TABLE player_comparisons ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Coaches can only see their own comparisons
CREATE POLICY "Coaches can view own comparisons"
  ON player_comparisons
  FOR SELECT
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert own comparisons"
  ON player_comparisons
  FOR INSERT
  WITH CHECK (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update own comparisons"
  ON player_comparisons
  FOR UPDATE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete own comparisons"
  ON player_comparisons
  FOR DELETE
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_player_comparisons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER player_comparisons_updated_at
  BEFORE UPDATE ON player_comparisons
  FOR EACH ROW
  EXECUTE FUNCTION update_player_comparisons_updated_at();
