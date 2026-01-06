-- ============================================================================
-- Performance Optimization: Add Missing Indexes
-- ============================================================================
-- This migration adds critical indexes identified in performance audit
-- Expected impact: 50-70% faster queries across all golf dashboard pages
--
-- Note: CONCURRENTLY removed to run in transaction block (Supabase SQL Editor)
-- Index creation is fast on current data size (< 1 second per index)
-- ============================================================================

-- 1. golf_rounds: Status + date composite index
-- Used by: Dashboard, rounds page, stats page
-- Impact: Filters on status='completed' are used everywhere
CREATE INDEX IF NOT EXISTS idx_golf_rounds_status_date
ON golf_rounds(status, round_date DESC)
WHERE status = 'completed';

-- 2. golf_rounds: Player + status + date composite
-- Used by: Player stats, player dashboard, coach viewing player rounds
-- Impact: Eliminates full table scan when filtering by player + status
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_status_date
ON golf_rounds(player_id, status, round_date DESC);

-- 3. golf_events: Team + date composite
-- Used by: Calendar page, dashboard events, team schedule
-- Impact: Faster team event queries with date sorting
CREATE INDEX IF NOT EXISTS idx_golf_events_team_date
ON golf_events(team_id, start_date);

-- 4. golf_shots: Ordering composite
-- Used by: Shot tracking, round details, stats calculation
-- Impact: Faster shot retrieval and sorting
CREATE INDEX IF NOT EXISTS idx_golf_shots_ordering
ON golf_shots(round_id, hole_number, shot_number);

-- 5. golf_players: Team index (CRITICAL - appears to be missing)
-- Used by: ALL team-based queries (roster, stats, etc.)
-- Impact: HUGE - eliminates full table scan on every team query
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id
ON golf_players(team_id)
WHERE team_id IS NOT NULL;

-- 6. golf_announcements: Team + created_at composite
-- Used by: Activity feed, announcements page
-- Impact: Faster announcement retrieval with sorting
CREATE INDEX IF NOT EXISTS idx_golf_announcements_team_created
ON golf_announcements(team_id, created_at DESC);

-- 7. golf_holes: Round + hole number composite
-- Used by: Round details, stats calculation
-- Impact: Faster hole retrieval and sorting
CREATE INDEX IF NOT EXISTS idx_golf_holes_round_number
ON golf_holes(round_id, hole_number);

-- Add comments for documentation
COMMENT ON INDEX idx_golf_rounds_status_date IS 'Performance: Filters rounds by completion status with date sorting';
COMMENT ON INDEX idx_golf_rounds_player_status_date IS 'Performance: Player-specific round queries with status filter';
COMMENT ON INDEX idx_golf_events_team_date IS 'Performance: Team event queries with date sorting';
COMMENT ON INDEX idx_golf_shots_ordering IS 'Performance: Shot retrieval in correct order';
COMMENT ON INDEX idx_golf_players_team_id IS 'Performance: CRITICAL - Team roster queries';
COMMENT ON INDEX idx_golf_announcements_team_created IS 'Performance: Team announcements with date sorting';
COMMENT ON INDEX idx_golf_holes_round_number IS 'Performance: Hole retrieval in order';
