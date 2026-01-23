-- Migration: Add priority column to golf_player_focus_areas if it doesn't exist
-- This column was defined in the original schema but may be missing in production

-- Add priority column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'golf_player_focus_areas' AND column_name = 'priority'
    ) THEN
        ALTER TABLE golf_player_focus_areas ADD COLUMN priority INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add status column if missing (used in queries)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'golf_player_focus_areas' AND column_name = 'status'
    ) THEN
        ALTER TABLE golf_player_focus_areas ADD COLUMN status TEXT DEFAULT 'active'
            CHECK (status IN ('active', 'completed', 'archived'));
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
