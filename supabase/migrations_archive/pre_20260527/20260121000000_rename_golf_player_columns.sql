-- Migration: Rename golf_players columns to match code expectations
-- grad_year -> graduation_year
-- city -> hometown  
-- Add missing columns

-- Rename columns
ALTER TABLE golf_players RENAME COLUMN grad_year TO graduation_year;
ALTER TABLE golf_players RENAME COLUMN city TO hometown;

-- Add profile_complete if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'golf_players' AND column_name = 'profile_complete') THEN
        ALTER TABLE golf_players ADD COLUMN profile_complete BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
