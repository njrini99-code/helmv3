-- ============================================================================
-- DATA CLEANUP MIGRATION
-- Removes orphaned records and test data identified in Phase 4 audit
-- ============================================================================

-- ============================================================================
-- PART 1: Delete orphaned baseball players (seed data with NULL user_id)
-- These are 30 demo players created on 2025-12-17 with no real user accounts
-- ============================================================================

-- First, remove any watchlist entries referencing these players
DELETE FROM watchlists
WHERE player_id IN (
  SELECT id FROM players WHERE user_id IS NULL
);

-- Remove any player_settings for orphaned players
DELETE FROM player_settings
WHERE player_id IN (
  SELECT id FROM players WHERE user_id IS NULL
);

-- Remove any videos for orphaned players
DELETE FROM videos
WHERE player_id IN (
  SELECT id FROM players WHERE user_id IS NULL
);

-- Now delete the orphaned players
DELETE FROM players WHERE user_id IS NULL;

-- Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned baseball players with NULL user_id', deleted_count;
END $$;

-- ============================================================================
-- PART 2: Delete incomplete player profiles (NULL names, older than 7 days)
-- These are users who signed up but abandoned onboarding
-- ============================================================================

-- Get the user_ids of incomplete profiles to delete
CREATE TEMP TABLE users_to_cleanup AS
SELECT p.user_id
FROM players p
WHERE (p.first_name IS NULL OR p.first_name = '')
  AND (p.last_name IS NULL OR p.last_name = '')
  AND p.created_at < NOW() - INTERVAL '7 days'
  AND p.user_id IS NOT NULL;

-- Delete from players first
DELETE FROM players
WHERE user_id IN (SELECT user_id FROM users_to_cleanup);

-- Delete from users table
DELETE FROM users
WHERE id IN (SELECT user_id FROM users_to_cleanup);

-- Note: auth.users cleanup needs to be done via Supabase dashboard or Admin API
-- The following is a comment for manual cleanup:
-- DELETE FROM auth.users WHERE id IN (SELECT user_id FROM users_to_cleanup);

DROP TABLE users_to_cleanup;

-- ============================================================================
-- PART 3: Delete orphaned golf teams (teams without any coach assigned)
-- These are test teams created during development
-- ============================================================================

-- First check if any players are on these teams and unassign them
UPDATE golf_players
SET team_id = NULL
WHERE team_id IN (
  SELECT gt.id
  FROM golf_teams gt
  LEFT JOIN golf_coaches gc ON gc.team_id = gt.id
  WHERE gc.id IS NULL
);

-- Now delete orphaned teams
DELETE FROM golf_teams
WHERE id NOT IN (
  SELECT DISTINCT team_id
  FROM golf_coaches
  WHERE team_id IS NOT NULL
);

-- ============================================================================
-- PART 4: Clean up orphaned golf organizations (orgs without teams)
-- ============================================================================

DELETE FROM golf_organizations
WHERE id NOT IN (
  SELECT DISTINCT organization_id
  FROM golf_teams
  WHERE organization_id IS NOT NULL
)
AND id NOT IN (
  SELECT DISTINCT organization_id
  FROM golf_coaches
  WHERE organization_id IS NOT NULL
);

-- ============================================================================
-- PART 5: Ensure invite_code exists on all golf_teams
-- ============================================================================

-- Add invite_code column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'golf_teams' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE golf_teams ADD COLUMN invite_code TEXT UNIQUE;
  END IF;
END $$;

-- Generate invite codes for teams that don't have one
UPDATE golf_teams
SET invite_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8))
WHERE invite_code IS NULL;

-- ============================================================================
-- PART 6: Add profile_complete flag to track onboarding status
-- ============================================================================

-- For golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'golf_players' AND column_name = 'profile_complete'
  ) THEN
    ALTER TABLE golf_players ADD COLUMN profile_complete BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Update existing records based on name presence
UPDATE golf_players
SET profile_complete = true
WHERE first_name IS NOT NULL
  AND first_name != ''
  AND last_name IS NOT NULL
  AND last_name != '';

-- For baseball players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'profile_complete'
  ) THEN
    ALTER TABLE players ADD COLUMN profile_complete BOOLEAN DEFAULT false;
  END IF;
END $$;

UPDATE players
SET profile_complete = true
WHERE first_name IS NOT NULL
  AND first_name != ''
  AND last_name IS NOT NULL
  AND last_name != '';

-- ============================================================================
-- SUMMARY COMMENT
-- ============================================================================
COMMENT ON TABLE golf_teams IS
  'Golf teams with invite_code for player joining. Cleaned up orphaned teams 2026-01-01.';
