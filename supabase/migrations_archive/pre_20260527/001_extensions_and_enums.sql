-- ============================================================================
-- Migration: 001_extensions_and_enums.sql
-- Purpose: Extensions and all ENUM types for both baseball and golf
-- Consolidated from: 001_schema.sql, 005_fix_pipeline_stage_enum.sql, 016_create_golf_schema.sql
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- BASEBALL ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE coach_type AS ENUM ('college', 'high_school', 'juco', 'showcase');
CREATE TYPE player_type AS ENUM ('high_school', 'showcase', 'juco', 'college');
CREATE TYPE pipeline_stage AS ENUM ('watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested');
CREATE TYPE team_type AS ENUM ('college', 'high_school', 'juco', 'showcase', 'travel_ball');
CREATE TYPE organization_type AS ENUM ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE member_status AS ENUM ('active', 'inactive', 'injured', 'alumni');
CREATE TYPE plan_status AS ENUM ('draft', 'sent', 'in_progress', 'completed', 'archived');
CREATE TYPE event_type AS ENUM ('camp', 'evaluation', 'visit', 'game', 'practice', 'meeting', 'other');
CREATE TYPE achievement_type AS ENUM ('award', 'honor', 'record', 'other');
CREATE TYPE engagement_type AS ENUM ('profile_view', 'watchlist_add', 'watchlist_remove', 'message', 'video_view');
CREATE TYPE stat_type AS ENUM ('batting', 'pitching', 'fielding', 'catching');

-- ============================================================================
-- GOLF ENUMS
-- ============================================================================

CREATE TYPE golf_player_year AS ENUM ('freshman', 'sophomore', 'junior', 'senior', 'fifth_year', 'graduate');
CREATE TYPE golf_player_status AS ENUM ('active', 'injured', 'redshirt', 'inactive');
CREATE TYPE golf_round_type AS ENUM ('tournament', 'qualifier', 'practice', 'casual');
CREATE TYPE golf_round_status AS ENUM ('in_progress', 'paused', 'completed', 'abandoned');
CREATE TYPE golf_event_type AS ENUM ('practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other');
CREATE TYPE golf_qualifier_status AS ENUM ('upcoming', 'in_progress', 'completed');
CREATE TYPE golf_urgency_level AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE golf_task_status AS ENUM ('pending', 'completed', 'overdue');
CREATE TYPE golf_transportation_type AS ENUM ('bus', 'van', 'fly', 'carpool');
CREATE TYPE golf_attendance_status AS ENUM ('attending', 'not_attending', 'maybe', 'pending', 'excused', 'unexcused');
CREATE TYPE golf_alert_sensitivity AS ENUM ('aggressive', 'balanced', 'conservative');
CREATE TYPE golf_sync_provider AS ENUM ('google', 'apple', 'outlook', 'caldav');
CREATE TYPE golf_sync_status AS ENUM ('synced', 'pending', 'error', 'conflict');
CREATE TYPE golf_conflict_resolution AS ENUM ('local_wins', 'remote_wins', 'manual', 'newest_wins');
CREATE TYPE golf_player_access_level AS ENUM ('none', 'own_only', 'team_with_permission', 'full_team');
CREATE TYPE golf_notification_level AS ENUM ('all', 'important', 'minimal', 'none');
CREATE TYPE golf_recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');
CREATE TYPE golf_insight_verbosity AS ENUM ('concise', 'balanced', 'detailed');
CREATE TYPE golf_shot_club AS ENUM ('driver', '3_wood', '5_wood', '7_wood', 'hybrid', '2_iron', '3_iron', '4_iron', '5_iron', '6_iron', '7_iron', '8_iron', '9_iron', 'pw', 'gw', 'sw', 'lw', 'putter');
CREATE TYPE golf_shot_result AS ENUM ('excellent', 'good', 'average', 'poor', 'miss');
CREATE TYPE golf_miss_direction AS ENUM ('left', 'right', 'short', 'long', 'left_short', 'left_long', 'right_short', 'right_long');
