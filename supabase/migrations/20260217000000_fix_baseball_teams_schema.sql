-- ============================================================================
-- Migration: 20260217000000_fix_baseball_teams_schema.sql
-- Purpose: Align baseball_teams schema with TypeScript types and add missing columns
-- Issue: TypeScript types expect join_code, but DB has head_coach_id not in types
-- ============================================================================

-- 1. Add join_code column to baseball_teams (required by TypeScript types)
--    This is a direct code on the team for simple joining, separate from team_invitations
ALTER TABLE baseball_teams
  ADD COLUMN IF NOT EXISTS join_code TEXT;

-- Generate join codes for existing teams that don't have one
UPDATE baseball_teams
SET join_code = upper(substring(md5(random()::text) from 1 for 6))
WHERE join_code IS NULL;

-- Make join_code NOT NULL after backfill and add unique constraint
ALTER TABLE baseball_teams
  ALTER COLUMN join_code SET NOT NULL;

-- Add unique index for join_code lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_baseball_teams_join_code
  ON baseball_teams(join_code);

-- 2. Ensure head_coach_id exists (it should from 006_teams.sql, but verify)
--    The TypeScript types are missing this - will be fixed by type regeneration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_teams' AND column_name = 'head_coach_id'
  ) THEN
    ALTER TABLE baseball_teams
      ADD COLUMN head_coach_id UUID REFERENCES baseball_coaches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add created_by column if missing (for tracking who created the team)
ALTER TABLE baseball_teams
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 4. Add description column if missing
ALTER TABLE baseball_teams
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================================
-- After running this migration, regenerate TypeScript types:
-- pnpm supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > src/lib/types/database.types.ts
-- ============================================================================
