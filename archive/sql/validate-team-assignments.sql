-- ============================================================================
-- TEAM ASSIGNMENT VALIDATION QUERIES
-- Run these in Supabase SQL Editor to verify data integrity
-- ============================================================================

-- 1. Check for coaches WITHOUT team_id (these users won't see any data!)
SELECT
  'Coaches without team_id' as issue,
  COUNT(*) as count,
  json_agg(json_build_object(
    'coach_id', id,
    'user_id', user_id,
    'first_name', first_name,
    'last_name', last_name,
    'created_at', created_at
  )) as details
FROM golf_coaches
WHERE team_id IS NULL;

-- 2. Check for players WITHOUT team_id (these users won't see any data!)
SELECT
  'Players without team_id' as issue,
  COUNT(*) as count,
  json_agg(json_build_object(
    'player_id', id,
    'user_id', user_id,
    'first_name', first_name,
    'last_name', last_name,
    'created_at', created_at
  )) as details
FROM golf_players
WHERE team_id IS NULL;

-- 3. Verify helper function returns correct team_ids for sample users
-- Replace 'SAMPLE_USER_ID' with an actual user_id from your database
SELECT
  'Sample user team_ids' as test,
  user_id,
  team_id
FROM (
  SELECT user_id, team_id FROM golf_coaches WHERE team_id IS NOT NULL LIMIT 1
  UNION ALL
  SELECT user_id, team_id FROM golf_players WHERE team_id IS NOT NULL LIMIT 1
) sample_users;

-- 4. Check for orphaned records (team_id references non-existent teams)
SELECT
  'Orphaned coach records' as issue,
  COUNT(*) as count
FROM golf_coaches c
WHERE team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM golf_teams t WHERE t.id = c.team_id);

SELECT
  'Orphaned player records' as issue,
  COUNT(*) as count
FROM golf_players p
WHERE team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM golf_teams t WHERE t.id = p.team_id);

-- 5. Summary of team assignments
SELECT
  'Team assignment summary' as report,
  json_build_object(
    'total_teams', (SELECT COUNT(*) FROM golf_teams),
    'coaches_with_teams', (SELECT COUNT(*) FROM golf_coaches WHERE team_id IS NOT NULL),
    'coaches_without_teams', (SELECT COUNT(*) FROM golf_coaches WHERE team_id IS NULL),
    'players_with_teams', (SELECT COUNT(*) FROM golf_players WHERE team_id IS NOT NULL),
    'players_without_teams', (SELECT COUNT(*) FROM golf_players WHERE team_id IS NULL)
  ) as stats;

-- 6. Check RLS is enabled on all tables
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches', 'golf_teams', 'golf_events', 'golf_event_attendance')
ORDER BY tablename;

-- 7. Verify helper function exists
SELECT
  proname as function_name,
  prosecdef as is_security_definer,
  provolatile as volatility
FROM pg_proc
WHERE proname = 'get_user_team_ids';
