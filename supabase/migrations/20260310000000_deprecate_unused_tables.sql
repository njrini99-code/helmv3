-- Deprecate 24 confirmed-unused tables by renaming with _deprecated_ prefix.
-- These tables have zero application code references (verified across all src/,
-- supabase/functions/, scripts/, tools/, e2e/, tests/, core/, helm-intelligence/).
--
-- Step 1: Rename child tables first (FK dependency order)
-- Step 2: Rename parent tables
-- Step 3: Rename standalone tables
-- Step 4: Drop unused view
--
-- If any errors surface after deploy, simply rename back:
--   ALTER TABLE _deprecated_<name> RENAME TO <name>;

BEGIN;

-- ============================================================
-- STEP 1: Child tables (have FKs to other unreferenced tables)
-- ============================================================

ALTER TABLE IF EXISTS golf_poll_responses RENAME TO _deprecated_golf_poll_responses;
ALTER TABLE IF EXISTS golf_calendar_sync_log RENAME TO _deprecated_golf_calendar_sync_log;

-- ============================================================
-- STEP 2: Parent tables (referenced by child tables above)
-- ============================================================

ALTER TABLE IF EXISTS golf_availability_polls RENAME TO _deprecated_golf_availability_polls;
ALTER TABLE IF EXISTS golf_calendar_sync_state RENAME TO _deprecated_golf_calendar_sync_state;

-- ============================================================
-- STEP 3: All other standalone unreferenced tables
-- ============================================================

-- Golf
ALTER TABLE IF EXISTS golf_coach_settings RENAME TO _deprecated_golf_coach_settings;
ALTER TABLE IF EXISTS golf_event_exclusions RENAME TO _deprecated_golf_event_exclusions;
ALTER TABLE IF EXISTS golf_event_status_log RENAME TO _deprecated_golf_event_status_log;
ALTER TABLE IF EXISTS golf_external_calendars RENAME TO _deprecated_golf_external_calendars;
ALTER TABLE IF EXISTS golf_insight_feedback RENAME TO _deprecated_golf_insight_feedback;
ALTER TABLE IF EXISTS golf_insight_weights RENAME TO _deprecated_golf_insight_weights;
ALTER TABLE IF EXISTS golf_player_availability_blocks RENAME TO _deprecated_golf_player_availability_blocks;
ALTER TABLE IF EXISTS golf_player_insight_preferences RENAME TO _deprecated_golf_player_insight_preferences;
ALTER TABLE IF EXISTS golf_player_settings RENAME TO _deprecated_golf_player_settings;
ALTER TABLE IF EXISTS golf_putting_tendencies RENAME TO _deprecated_golf_putting_tendencies;
ALTER TABLE IF EXISTS golf_travel_expense_splits RENAME TO _deprecated_golf_travel_expense_splits;

-- Baseball
ALTER TABLE IF EXISTS baseball_academics RENAME TO _deprecated_baseball_academics;
ALTER TABLE IF EXISTS baseball_announcement_documents RENAME TO _deprecated_baseball_announcement_documents;
ALTER TABLE IF EXISTS baseball_announcement_tasks RENAME TO _deprecated_baseball_announcement_tasks;
ALTER TABLE IF EXISTS baseball_coach_settings RENAME TO _deprecated_baseball_coach_settings;
ALTER TABLE IF EXISTS baseball_dream_schools RENAME TO _deprecated_baseball_dream_schools;

-- Shared/Platform
ALTER TABLE IF EXISTS feature_flags RENAME TO _deprecated_feature_flags;
ALTER TABLE IF EXISTS organization_settings RENAME TO _deprecated_organization_settings;
ALTER TABLE IF EXISTS page_views RENAME TO _deprecated_page_views;
ALTER TABLE IF EXISTS player_dream_schools RENAME TO _deprecated_player_dream_schools;

-- ============================================================
-- STEP 4: Drop unused view
-- ============================================================

DROP VIEW IF EXISTS player_putt_tendencies;

COMMIT;
