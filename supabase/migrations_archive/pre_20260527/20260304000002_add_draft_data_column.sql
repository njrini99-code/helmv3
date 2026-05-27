-- ============================================================================
-- Add draft_data column to golf_rounds
-- Stops abusing the notes column for storing draft JSON
-- ============================================================================

-- Add the column
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS draft_data JSONB DEFAULT NULL;

-- Migrate existing draft data from notes to draft_data
-- Only for in_progress rounds where notes contains valid JSON (starts with '{')
-- Wrapped in exception handler so invalid JSON doesn't abort the migration
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, notes FROM golf_rounds
    WHERE status = 'in_progress'
      AND notes IS NOT NULL
      AND notes LIKE '{%'
  LOOP
    BEGIN
      UPDATE golf_rounds
      SET draft_data = r.notes::JSONB,
          notes = NULL
      WHERE id = r.id;
    EXCEPTION WHEN invalid_text_representation OR others THEN
      -- Skip rows with invalid JSON — leave notes intact
      RAISE NOTICE 'Skipping round % — notes is not valid JSON', r.id;
    END;
  END LOOP;
END $$;

-- Add a comment for documentation
COMMENT ON COLUMN golf_rounds.draft_data IS 'JSON blob storing full draft state for in-progress rounds (step, setupData, holes, completedHoleStats, etc.)';
