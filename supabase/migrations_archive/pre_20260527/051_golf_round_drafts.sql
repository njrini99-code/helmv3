-- ============================================================================
-- Migration: 051_golf_round_drafts.sql
-- Purpose: Add auto-save draft support for golf rounds to prevent data loss
-- ============================================================================

-- Add draft-related columns to golf_rounds
ALTER TABLE golf_rounds
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS draft_data JSONB,
ADD COLUMN IF NOT EXISTS last_auto_save TIMESTAMPTZ;

-- Create index for efficient draft lookup by player
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_draft
ON golf_rounds(player_id, is_draft)
WHERE is_draft = TRUE;

-- Create index for finding stale drafts (for cleanup)
CREATE INDEX IF NOT EXISTS idx_golf_rounds_draft_autosave
ON golf_rounds(last_auto_save)
WHERE is_draft = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN golf_rounds.is_draft IS 'Whether this round is an auto-saved draft (not manually saved via "Save for Later")';
COMMENT ON COLUMN golf_rounds.draft_data IS 'JSONB storage for incomplete round data including setup, holes, and shot tracking state';
COMMENT ON COLUMN golf_rounds.last_auto_save IS 'Timestamp of the last auto-save for this draft';

-- Function to clean up old drafts (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_golf_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM golf_rounds
  WHERE is_draft = TRUE
    AND last_auto_save < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_golf_drafts IS 'Removes draft rounds older than 7 days. Can be called periodically via cron or manually.';

-- RLS policies for draft access
-- Players can only see and manage their own drafts

-- Policy for selecting drafts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Players can view own drafts'
    AND tablename = 'golf_rounds'
  ) THEN
    CREATE POLICY "Players can view own drafts" ON golf_rounds
      FOR SELECT TO authenticated
      USING (
        is_draft = TRUE
        AND player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Note: Existing RLS policies for golf_rounds should already cover INSERT/UPDATE/DELETE
-- for players on their own rounds. The is_draft flag doesn't change ownership rules.
