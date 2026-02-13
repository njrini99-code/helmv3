-- ============================================================================
-- Migration: 20260212000000_dashboard_performance_indexes.sql
-- Purpose: Add composite indexes for frequently-hit dashboard and stats queries
-- Created: 2026-02-12
-- ============================================================================
--
-- These indexes target query patterns in dashboard-data.ts, stats-data.ts,
-- and travel/expenses.ts that are not already covered by existing indexes
-- in 033_all_indexes.sql and 050_golf_performance_indexes.sql.
--
-- All indexes use IF NOT EXISTS for idempotent deployment.
-- For large production tables, consider running CREATE INDEX CONCURRENTLY
-- outside of a transaction block.
-- ============================================================================


-- ============================================================================
-- GOLF_ROUNDS — Partial index for non-null score filtering
-- ============================================================================

-- Many dashboard and stats queries filter with .not('total_score', 'is', null)
-- in addition to player_id, status, and round_date ordering.
-- This partial index narrows the scan to only scored rounds.
--
-- Used by:
--   dashboard-data.ts: getCoachDashboardData (recent rounds, all rounds, sparklines)
--   dashboard-data.ts: getPlayerDashboardData (player rounds)
--   stats-data.ts: getStatsSummary, getTrendAnalysis, getCourseBreakdown, getTeamComparison
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_completed_scored
  ON golf_rounds(player_id, round_date DESC)
  WHERE status = 'completed' AND total_score IS NOT NULL;

COMMENT ON INDEX idx_golf_rounds_player_completed_scored IS
  'Partial index for the most common query pattern: completed rounds with scores, sorted by date';


-- ============================================================================
-- GOLF_ROUNDS — Course breakdown index
-- ============================================================================

-- Course breakdown groups rounds by (player_id, course_name). The existing
-- indexes do not include course_name.
--
-- Used by:
--   stats-data.ts: getCourseBreakdown — .eq('player_id', id).not('course_name', 'is', null)
--   stats-data.ts: getFilterOptions — .eq('player_id', id) with course_name in SELECT
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_course
  ON golf_rounds(player_id, course_name)
  WHERE status = 'completed' AND course_name IS NOT NULL;

COMMENT ON INDEX idx_golf_rounds_player_course IS
  'Optimizes course breakdown and filter options queries that group by player + course';


-- ============================================================================
-- GOLF_EVENT_ATTENDANCE — Composite index for RSVP aggregation
-- ============================================================================

-- The dashboard loads today's events with nested attendance data and then
-- filters by status ('attending'/'yes'). The existing index in 033 is only
-- on (event_id) without status.
--
-- Used by:
--   dashboard-data.ts: getCoachDashboardData — nested select on attendance with status filter
--   dashboard-data.ts: getPlayerDashboardData — .in('event_id', ids).eq('player_id', id)
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_event_status
  ON golf_event_attendance(event_id, status);

COMMENT ON INDEX idx_golf_event_attendance_event_status IS
  'Optimizes RSVP count aggregation per event with status filtering';

-- Player attendance lookup — used when fetching a player's own RSVP status
-- for today's events: .in('event_id', eventIds).eq('player_id', playerId)
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_player_event
  ON golf_event_attendance(player_id, event_id);

COMMENT ON INDEX idx_golf_event_attendance_player_event IS
  'Optimizes player-specific RSVP lookup across multiple events';


-- ============================================================================
-- GOLF_TRAVEL_EXPENSES — Composite indexes for expense queries
-- ============================================================================

-- Itinerary expense listing, ordered by date.
-- Existing index is single-column on (itinerary_id) without ordering.
--
-- Used by:
--   travel/expenses.ts: getItineraryExpenses — .eq('itinerary_id', id).order('expense_date', DESC)
--   travel/expenses.ts: getItineraryBudget — .eq('itinerary_id', id) with category aggregation
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_itinerary_date
  ON golf_travel_expenses(itinerary_id, expense_date DESC);

COMMENT ON INDEX idx_golf_travel_expenses_itinerary_date IS
  'Optimizes itinerary expense listing sorted by date';

-- Team expense summary with date range filtering.
-- Existing index is single-column on (team_id) without date.
--
-- Used by:
--   travel/expenses.ts: getTeamExpenseSummary — .eq('team_id', id) with date range filters
--   travel/expenses.ts: getExpenses — .eq('team_id', id) with various filters
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_team_date
  ON golf_travel_expenses(team_id, expense_date DESC);

COMMENT ON INDEX idx_golf_travel_expenses_team_date IS
  'Optimizes team expense summary and filtered expense queries with date ordering';


-- ============================================================================
-- GOLF_ROUNDS — Round type filtering index
-- ============================================================================

-- Stats queries often filter by round_type (tournament, practice, qualifier).
-- The existing composite index includes status + round_date but not round_type.
--
-- Used by:
--   stats-data.ts: getStatsSummary — .eq('round_type', type) or .in('round_type', [...])
--   stats-data.ts: getDetailedStats — same pattern with round_type filter
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_type
  ON golf_rounds(player_id, round_type, round_date DESC)
  WHERE status = 'completed';

COMMENT ON INDEX idx_golf_rounds_player_type IS
  'Optimizes round queries filtered by type (tournament/practice/qualifier) within completed rounds';
