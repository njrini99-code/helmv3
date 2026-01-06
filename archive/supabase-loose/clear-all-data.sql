-- ============================================================================
-- CLEAR ALL USER ACCOUNTS AND SEED DATA
-- ============================================================================
-- WARNING: This will DELETE ALL DATA from your database
-- Use with caution - this operation cannot be undone
-- ============================================================================

BEGIN;

-- Disable triggers temporarily for faster deletion
SET session_replication_role = replica;

-- ============================================================================
-- 1. CLEAR MESSAGING DATA
-- ============================================================================
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversation_participants CASCADE;
TRUNCATE TABLE conversations CASCADE;

-- ============================================================================
-- 2. CLEAR NOTIFICATIONS
-- ============================================================================
TRUNCATE TABLE notifications CASCADE;

-- ============================================================================
-- 3. CLEAR PLAYER DATA
-- ============================================================================
TRUNCATE TABLE player_engagement_events CASCADE;
TRUNCATE TABLE player_comparisons CASCADE;
TRUNCATE TABLE evaluations CASCADE;
TRUNCATE TABLE player_stats CASCADE;
TRUNCATE TABLE recruiting_interests CASCADE;
TRUNCATE TABLE player_achievements CASCADE;
TRUNCATE TABLE player_metrics CASCADE;
TRUNCATE TABLE player_settings CASCADE;
TRUNCATE TABLE video_library CASCADE;
TRUNCATE TABLE player_videos CASCADE;

-- ============================================================================
-- 4. CLEAR GOLF DATA
-- ============================================================================
TRUNCATE TABLE golf_rounds CASCADE;
TRUNCATE TABLE golf_qualifier_entries CASCADE;
TRUNCATE TABLE golf_qualifiers CASCADE;
TRUNCATE TABLE golf_announcements CASCADE;
TRUNCATE TABLE golf_players CASCADE;
TRUNCATE TABLE golf_coaches CASCADE;
TRUNCATE TABLE golf_teams CASCADE;
TRUNCATE TABLE golf_organizations CASCADE;

-- ============================================================================
-- 5. CLEAR TEAM DATA
-- ============================================================================
TRUNCATE TABLE developmental_plans CASCADE;
TRUNCATE TABLE team_coach_staff CASCADE;
TRUNCATE TABLE team_invitations CASCADE;
TRUNCATE TABLE team_members CASCADE;
TRUNCATE TABLE teams CASCADE;

-- ============================================================================
-- 6. CLEAR CAMP DATA
-- ============================================================================
TRUNCATE TABLE camp_registrations CASCADE;
TRUNCATE TABLE camps CASCADE;

-- ============================================================================
-- 7. CLEAR COACH DATA
-- ============================================================================
TRUNCATE TABLE coach_calendar_events CASCADE;
TRUNCATE TABLE coach_notes CASCADE;
TRUNCATE TABLE recruit_watchlist CASCADE;
TRUNCATE TABLE coaches CASCADE;

-- ============================================================================
-- 8. CLEAR BASEBALL PLAYER DATA
-- ============================================================================
TRUNCATE TABLE players CASCADE;

-- ============================================================================
-- 9. CLEAR ORGANIZATION DATA
-- ============================================================================
TRUNCATE TABLE organizations CASCADE;

-- ============================================================================
-- 10. CLEAR USER ACCOUNTS (LAST - has auth.users foreign key)
-- ============================================================================
TRUNCATE TABLE users CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ============================================================================
-- 11. DELETE AUTH USERS (Supabase Auth)
-- ============================================================================
-- This deletes users from auth.users table
DELETE FROM auth.users;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these to verify all data is cleared:
-- SELECT COUNT(*) FROM users;
-- SELECT COUNT(*) FROM auth.users;
-- SELECT COUNT(*) FROM players;
-- SELECT COUNT(*) FROM coaches;
-- SELECT COUNT(*) FROM golf_players;
-- ============================================================================
