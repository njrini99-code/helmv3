-- ============================================================================
-- Migration: 049_focus_area_insight_link.sql
-- Purpose: Add source_insight_id to focus areas for insight->focus area workflow
-- ============================================================================

-- Add source_insight_id column to link focus areas to their originating insights
ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS source_insight_id UUID REFERENCES golf_coach_insights(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_golf_focus_areas_source_insight
ON golf_player_focus_areas(source_insight_id)
WHERE source_insight_id IS NOT NULL;

-- Add additional columns that match the development-client.tsx expectations
-- (These may already exist from the original schema)
ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS area_type TEXT;

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS target_metric TEXT;

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS current_value DECIMAL(10,2);

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS target_value DECIMAL(10,2);

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE golf_player_focus_areas
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Comment for documentation
COMMENT ON COLUMN golf_player_focus_areas.source_insight_id IS 'Links focus area to the CoachHelm insight that triggered its creation';
