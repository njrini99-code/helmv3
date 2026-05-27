-- Migration: Rename golf_players columns to match code expectations
-- grad_year -> graduation_year
-- city -> hometown  
-- Add missing columns

-- Rename columns when replaying from an older schema, but tolerate fresh stacks
-- where earlier migrations already created the code-facing column names.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'grad_year'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'graduation_year'
    ) THEN
        ALTER TABLE golf_players RENAME COLUMN grad_year TO graduation_year;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'graduation_year'
    ) THEN
        ALTER TABLE golf_players ADD COLUMN graduation_year INTEGER;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'city'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'hometown'
    ) THEN
        ALTER TABLE golf_players RENAME COLUMN city TO hometown;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'golf_players'
          AND column_name = 'hometown'
    ) THEN
        ALTER TABLE golf_players ADD COLUMN hometown TEXT;
    END IF;
END $$;

-- Add profile_complete if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'golf_players' AND column_name = 'profile_complete') THEN
        ALTER TABLE golf_players ADD COLUMN profile_complete BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
