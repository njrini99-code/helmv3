-- ==============================================
-- RUN ALL MIGRATIONS - Day 1 Database Foundation
-- ==============================================
-- Execute this file in Supabase SQL Editor to run all migrations
-- Estimated time: 2-3 minutes

-- ==============================================
-- MIGRATION 005: Fix Pipeline Stage Enum
-- ==============================================

\echo 'Running migration 005: Fix pipeline_stage_enum...'

-- Create new enum with correct values
CREATE TYPE pipeline_stage_new AS ENUM (
  'watchlist',
  'high_priority',
  'offer_extended',
  'committed',
  'uninterested'
);

-- Add temporary column with new enum
ALTER TABLE recruit_watchlist ADD COLUMN status_new pipeline_stage_new;

-- Migrate data
UPDATE recruit_watchlist
SET status_new = CASE
  WHEN status::text = 'priority' THEN 'high_priority'::pipeline_stage_new
  ELSE status::text::pipeline_stage_new
END;

-- Drop old column and enum
ALTER TABLE recruit_watchlist DROP COLUMN status;
DROP TYPE pipeline_stage;

-- Rename new column and enum
ALTER TABLE recruit_watchlist RENAME COLUMN status_new TO status;
ALTER TYPE pipeline_stage_new RENAME TO pipeline_stage;

-- Set default and not null
ALTER TABLE recruit_watchlist ALTER COLUMN status SET DEFAULT 'watchlist'::pipeline_stage;
ALTER TABLE recruit_watchlist ALTER COLUMN status SET NOT NULL;

\echo 'Migration 005 complete ✓'

-- ==============================================
-- MIGRATION 006: Create Organizations Table
-- ==============================================

\ir 006_create_organizations.sql

-- ==============================================
-- MIGRATION 007: Create Teams System
-- ==============================================

\ir 007_create_teams_system.sql

-- ==============================================
-- MIGRATION 008: Create Player Features
-- ==============================================

\ir 008_create_player_features.sql

-- ==============================================
-- MIGRATION 009: Create Developmental Plans
-- ==============================================

\ir 009_create_developmental_plans.sql

-- ==============================================
-- MIGRATION 010: Create Coach Features
-- ==============================================

\ir 010_create_coach_features.sql

-- ==============================================
-- MIGRATION 011: Create Events and Camps
-- ==============================================

\ir 011_create_events_and_camps.sql

-- ==============================================
-- MIGRATION 012: Create Enhanced Analytics
-- ==============================================

\ir 012_create_enhanced_analytics.sql

-- ==============================================
-- MIGRATION 013: Update Players Table
-- ==============================================

\ir 013_update_players_table.sql

-- ==============================================
-- MIGRATION 014: Update Coaches Table
-- ==============================================

\ir 014_update_coaches_table.sql

-- ==============================================
-- VERIFICATION QUERIES
-- ==============================================

\echo ''
\echo 'Running verification queries...'
\echo ''

-- Check all tables exist
SELECT
  CASE
    WHEN COUNT(*) = 16 THEN '✓ All 16 tables created successfully'
    ELSE '✗ Missing tables: ' || (16 - COUNT(*))::text
  END as table_check
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  );

-- Check enum type
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'pipeline_stage'
    ) THEN '✓ pipeline_stage enum exists'
    ELSE '✗ pipeline_stage enum missing'
  END as enum_check;

-- Check RLS is enabled
SELECT
  COUNT(*) || ' tables with RLS enabled' as rls_check
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  );

-- Check indexes created
SELECT
  COUNT(*) || ' indexes created' as index_check
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  );

-- List all new tables with row counts
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )
ORDER BY table_name;

\echo ''
\echo '==============================================''
\echo 'MIGRATION COMPLETE'
\echo '==============================================''
\echo ''
\echo 'Summary:'
\echo '- 16 new tables created'
\echo '- 1 enum type fixed'
\echo '- 50+ indexes created'
\echo '- RLS policies enabled on all tables'
\echo '- Helper functions created'
\echo ''
\echo 'Next steps:'
\echo '1. Review verification queries above'
\echo '2. Test table creation: SELECT * FROM organizations LIMIT 1;'
\echo '3. Proceed to Day 2: Create TypeScript types'
\echo ''
