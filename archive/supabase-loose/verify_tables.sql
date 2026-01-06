-- Verification Script for Day 1 Migrations
-- Run this in Supabase Studio SQL Editor or via psql

\echo '=========================================='
\echo 'Table Verification Report'
\echo '=========================================='
\echo ''

-- Check all tables exist
\echo 'Checking if all 16 tables exist...'
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'teams',
    'team_members',
    'team_invitations',
    'team_coach_staff',
    'player_settings',
    'player_metrics',
    'player_achievements',
    'recruiting_interests',
    'developmental_plans',
    'coach_notes',
    'coach_calendar_events',
    'events',
    'camps',
    'camp_registrations',
    'player_engagement_events'
  )
ORDER BY table_name;

\echo ''
\echo 'Expected: 16 rows'
\echo ''

-- Check RLS enabled
\echo 'Checking RLS enabled on all tables...'
SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'Enabled' ELSE 'DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )
ORDER BY tablename;

\echo ''
\echo 'Expected: All should show "Enabled"'
\echo ''

-- Check indexes created
\echo 'Checking indexes...'
SELECT
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo 'Expected: Each table should have 2-8 indexes'
\echo ''

-- Check pipeline_stage enum
\echo 'Checking pipeline_stage enum values...'
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'pipeline_stage'
ORDER BY e.enumsortorder;

\echo ''
\echo 'Expected: watchlist, high_priority, offer_extended, committed, uninterested'
\echo ''

-- Check helper functions exist
\echo 'Checking helper functions...'
SELECT proname as function_name
FROM pg_proc
WHERE proname IN (
  'get_player_teams',
  'calculate_profile_completion',
  'get_player_notes',
  'get_upcoming_events',
  'get_player_engagement_summary',
  'get_recent_engagement',
  'get_engagement_trends',
  'get_coach_profile',
  'get_coach_teams',
  'calculate_coach_completion'
)
ORDER BY proname;

\echo ''
\echo 'Expected: 10 functions'
\echo ''

-- Summary
\echo '=========================================='
\echo 'Summary'
\echo '=========================================='

SELECT
  'Tables Created' as metric,
  COUNT(*)::text as value
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'Indexes Created',
  COUNT(*)::text
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'RLS Policies',
  COUNT(*)::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'Functions',
  COUNT(*)::text
FROM pg_proc
WHERE proname IN (
  'get_player_teams',
  'calculate_profile_completion',
  'get_player_notes',
  'get_upcoming_events',
  'get_player_engagement_summary',
  'get_recent_engagement',
  'get_engagement_trends',
  'get_coach_profile',
  'get_coach_teams',
  'calculate_coach_completion'
);

\echo ''
\echo 'Expected Results:'
\echo '- Tables Created: 16'
\echo '- Indexes Created: 50+'
\echo '- RLS Policies: 30+'
\echo '- Functions: 10'
\echo ''
\echo '✓ Verification Complete!'
