-- ============================================================================
-- Migration: 049_golf_coach_philosophy_complete.sql
-- Purpose: Add missing columns to golf_coach_philosophy for complete CoachHelm settings
-- Issue: Code expects 15+ fields but only 11 exist. Settings silently use defaults.
-- ============================================================================

-- ============================================================================
-- ADD MISSING COLUMNS TO golf_coach_philosophy
-- ============================================================================

-- Comparison weights (should sum to 100)
-- These control how different data sources are weighted in player rankings
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS weight_historical INTEGER NOT NULL DEFAULT 35;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS weight_recent_form INTEGER NOT NULL DEFAULT 30;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS weight_tournament INTEGER NOT NULL DEFAULT 20;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS weight_qualifying INTEGER NOT NULL DEFAULT 10;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS weight_subjective INTEGER NOT NULL DEFAULT 5;

-- Alert type toggles - Performance alerts
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_scoring_decline BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_stat_regression BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_tournament_pressure BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_plateau BOOLEAN NOT NULL DEFAULT FALSE;

-- Alert type toggles - Roster & Qualifying alerts
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_bubble_player BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_surge_player BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_streaks BOOLEAN NOT NULL DEFAULT TRUE;

-- Alert type toggles - Pattern alerts
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_recurring_weakness BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_closing_holes BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS alert_par_3_issues BOOLEAN NOT NULL DEFAULT FALSE;

-- Display preferences
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS show_strokes_gained BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS show_advanced_stats BOOLEAN NOT NULL DEFAULT TRUE;

-- Insight verbosity - requires the enum type golf_insight_verbosity
-- First check if the enum exists and create if not
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'golf_insight_verbosity') THEN
        CREATE TYPE golf_insight_verbosity AS ENUM ('minimal', 'standard', 'detailed');
    END IF;
END$$;

-- Add the insight_verbosity column using the enum
ALTER TABLE golf_coach_philosophy
ADD COLUMN IF NOT EXISTS insight_verbosity golf_insight_verbosity NOT NULL DEFAULT 'detailed';

-- ============================================================================
-- ADD CONSTRAINTS FOR WEIGHT COLUMNS
-- ============================================================================

-- Add check constraints to ensure weights are reasonable (0-100 range)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'golf_coach_philosophy_weight_historical_check'
    ) THEN
        ALTER TABLE golf_coach_philosophy
        ADD CONSTRAINT golf_coach_philosophy_weight_historical_check
        CHECK (weight_historical BETWEEN 0 AND 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'golf_coach_philosophy_weight_recent_form_check'
    ) THEN
        ALTER TABLE golf_coach_philosophy
        ADD CONSTRAINT golf_coach_philosophy_weight_recent_form_check
        CHECK (weight_recent_form BETWEEN 0 AND 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'golf_coach_philosophy_weight_tournament_check'
    ) THEN
        ALTER TABLE golf_coach_philosophy
        ADD CONSTRAINT golf_coach_philosophy_weight_tournament_check
        CHECK (weight_tournament BETWEEN 0 AND 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'golf_coach_philosophy_weight_qualifying_check'
    ) THEN
        ALTER TABLE golf_coach_philosophy
        ADD CONSTRAINT golf_coach_philosophy_weight_qualifying_check
        CHECK (weight_qualifying BETWEEN 0 AND 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'golf_coach_philosophy_weight_subjective_check'
    ) THEN
        ALTER TABLE golf_coach_philosophy
        ADD CONSTRAINT golf_coach_philosophy_weight_subjective_check
        CHECK (weight_subjective BETWEEN 0 AND 100);
    END IF;
END$$;

-- ============================================================================
-- UPDATE EXISTING ROWS WITH DEFAULT VALUES
-- ============================================================================

-- This is handled by the DEFAULT values in the ADD COLUMN statements above
-- PostgreSQL automatically populates existing rows with the default value
-- when adding a NOT NULL column with a DEFAULT

-- ============================================================================
-- ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN golf_coach_philosophy.weight_historical IS 'Weight for historical performance data (0-100, should sum to 100 with other weights)';
COMMENT ON COLUMN golf_coach_philosophy.weight_recent_form IS 'Weight for recent form/last few rounds (0-100)';
COMMENT ON COLUMN golf_coach_philosophy.weight_tournament IS 'Weight for tournament performance (0-100)';
COMMENT ON COLUMN golf_coach_philosophy.weight_qualifying IS 'Weight for qualifying round performance (0-100)';
COMMENT ON COLUMN golf_coach_philosophy.weight_subjective IS 'Weight for coach subjective input (0-100)';

COMMENT ON COLUMN golf_coach_philosophy.alert_scoring_decline IS 'Enable alerts when player scoring average declines';
COMMENT ON COLUMN golf_coach_philosophy.alert_stat_regression IS 'Enable alerts when key stats regress';
COMMENT ON COLUMN golf_coach_philosophy.alert_tournament_pressure IS 'Enable alerts for tournament vs practice performance gaps';
COMMENT ON COLUMN golf_coach_philosophy.alert_plateau IS 'Enable alerts when player hits performance plateau';
COMMENT ON COLUMN golf_coach_philosophy.alert_bubble_player IS 'Enable alerts for players near lineup cut line';
COMMENT ON COLUMN golf_coach_philosophy.alert_surge_player IS 'Enable alerts for rapidly improving players';
COMMENT ON COLUMN golf_coach_philosophy.alert_streaks IS 'Enable alerts for hot/cold streaks';
COMMENT ON COLUMN golf_coach_philosophy.alert_recurring_weakness IS 'Enable alerts for recurring weaknesses';
COMMENT ON COLUMN golf_coach_philosophy.alert_closing_holes IS 'Enable alerts for closing hole performance issues';
COMMENT ON COLUMN golf_coach_philosophy.alert_par_3_issues IS 'Enable alerts for par 3 scoring problems';

COMMENT ON COLUMN golf_coach_philosophy.show_strokes_gained IS 'Display strokes gained metrics in insights';
COMMENT ON COLUMN golf_coach_philosophy.show_advanced_stats IS 'Display advanced statistics in insights';
COMMENT ON COLUMN golf_coach_philosophy.insight_verbosity IS 'Level of detail in generated insights (minimal, standard, detailed)';

-- ============================================================================
-- VERIFY MIGRATION SUCCESS
-- ============================================================================

-- This query can be used to verify all columns exist after migration
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'golf_coach_philosophy'
-- ORDER BY ordinal_position;
