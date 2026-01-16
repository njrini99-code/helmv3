-- ============================================================================
-- Migration: 050_golf_performance_indexes.sql
-- Purpose: Strategic composite indexes for GolfHelm query performance
-- Created: 2026-01-15
-- ============================================================================
--
-- This migration adds composite indexes optimized for the most common query
-- patterns identified in the GolfHelm application. These indexes target:
-- - Round retrieval (player dashboard, stats pages, round history)
-- - Shot data aggregation (stats calculator, strokes gained)
-- - Event/calendar queries (calendar page, upcoming events)
-- - Team member lookups (roster, permissions, team context)
-- - Qualifier leaderboards (entries sorted by score)
--
-- All indexes use IF NOT EXISTS for idempotent deployment.
-- Note: CONCURRENTLY keyword removed to allow execution in transaction.
--       For production, consider running indexes with CONCURRENTLY outside transaction.
-- ============================================================================

-- ============================================================================
-- GOLF_ROUNDS COMPOSITE INDEXES
-- ============================================================================

-- Primary composite index: player_id + status + round_date DESC
-- Covers: Stats page queries, round history, completed rounds listing
-- Example queries:
--   .eq('player_id', id).eq('status', 'completed').order('round_date', { ascending: false })
--   .in('player_id', playerIds).eq('status', 'completed')
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_status_date
ON golf_rounds(player_id, status, round_date DESC);
COMMENT ON INDEX idx_golf_rounds_player_status_date IS
  'Optimizes player round queries filtered by status and sorted by date - most common query pattern';

-- Coach view index: rounds by multiple players sorted by date
-- Covers: Coach dashboard viewing all team rounds
-- Uses round_date as first column for range scans across all players
CREATE INDEX IF NOT EXISTS idx_golf_rounds_date_player
ON golf_rounds(round_date DESC, player_id);
COMMENT ON INDEX idx_golf_rounds_date_player IS
  'Optimizes coach view of team rounds sorted by date';

-- In-progress rounds lookup (for continue round feature)
-- Partial index for just in_progress status
CREATE INDEX IF NOT EXISTS idx_golf_rounds_in_progress
ON golf_rounds(player_id, updated_at DESC)
WHERE status = 'in_progress';
COMMENT ON INDEX idx_golf_rounds_in_progress IS
  'Optimizes lookup of in-progress rounds for resume functionality';

-- ============================================================================
-- GOLF_SHOTS COMPOSITE INDEXES
-- ============================================================================

-- Primary composite index: round_id + hole_number + shot_number
-- Covers: Loading all shots for a round, ordered by hole and shot sequence
-- Example queries:
--   .in('round_id', roundIds).order('hole_number').order('shot_number')
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_hole_shot
ON golf_shots(round_id, hole_number, shot_number);
COMMENT ON INDEX idx_golf_shots_round_hole_shot IS
  'Optimizes shot retrieval ordered by hole and shot number - used in stats calculator';

-- Stats aggregation index: shot_type for strokes gained calculation
-- Covers: Grouping shots by type for SG calculations
-- Example queries:
--   Filtering by shot_type IN ('tee', 'approach', 'around_green', 'putting')
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_type
ON golf_shots(round_id, shot_type);
COMMENT ON INDEX idx_golf_shots_round_type IS
  'Optimizes shot stats grouping by type for strokes gained calculations';

-- Deletion operations index: for cleaning up shots when round is deleted/updated
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_id
ON golf_shots(round_id);
COMMENT ON INDEX idx_golf_shots_round_id IS
  'Optimizes bulk shot deletion when updating or deleting rounds';

-- ============================================================================
-- GOLF_HOLES COMPOSITE INDEXES
-- ============================================================================

-- Primary composite index: round_id + hole_number
-- Covers: Hole lookup within rounds, stats per hole
-- Note: UNIQUE constraint on (round_id, hole_number) already creates an index,
-- but adding explicit covering index if the constraint doesn't exist
CREATE INDEX IF NOT EXISTS idx_golf_holes_round_number
ON golf_holes(round_id, hole_number);
COMMENT ON INDEX idx_golf_holes_round_number IS
  'Optimizes hole lookup by round and number - heavily used in stats calculator';

-- ============================================================================
-- GOLF_EVENTS COMPOSITE INDEXES
-- ============================================================================

-- Primary composite index: team_id + start_time for calendar queries
-- Covers: Calendar page, upcoming events, event listings
-- Example queries:
--   .eq('team_id', teamId).order('start_time', { ascending: true })
--   .eq('team_id', teamId).gte('start_time', today)
CREATE INDEX IF NOT EXISTS idx_golf_events_team_start_time
ON golf_events(team_id, start_time);
COMMENT ON INDEX idx_golf_events_team_start_time IS
  'Optimizes calendar event queries by team sorted by time';

-- Upcoming events partial index for performance
CREATE INDEX IF NOT EXISTS idx_golf_events_team_upcoming
ON golf_events(team_id, start_time)
WHERE status IN ('confirmed', 'scheduled', 'draft');
COMMENT ON INDEX idx_golf_events_team_upcoming IS
  'Optimizes upcoming/active event queries (excludes cancelled)';

-- Event type filtering with team
CREATE INDEX IF NOT EXISTS idx_golf_events_team_type
ON golf_events(team_id, event_type, start_time);
COMMENT ON INDEX idx_golf_events_team_type IS
  'Optimizes event filtering by type (practice, tournament, etc)';

-- ============================================================================
-- GOLF_TEAM_MEMBERS COMPOSITE INDEXES
-- ============================================================================

-- Primary lookup: team_id to get all players
-- Covers: Roster pages, team player listings, permission checks
-- Example queries:
--   .eq('team_id', teamId).select('player_id')
CREATE INDEX IF NOT EXISTS idx_golf_team_members_team
ON golf_team_members(team_id, status);
COMMENT ON INDEX idx_golf_team_members_team IS
  'Optimizes team roster queries with status filtering';

-- Reverse lookup: player_id to find teams
-- Covers: Player context lookup, team switching, permission validation
-- Example queries:
--   .eq('player_id', playerId).single()
CREATE INDEX IF NOT EXISTS idx_golf_team_members_player
ON golf_team_members(player_id, team_id);
COMMENT ON INDEX idx_golf_team_members_player IS
  'Optimizes player team membership lookup - very frequently used';

-- Active members only (partial index)
CREATE INDEX IF NOT EXISTS idx_golf_team_members_active
ON golf_team_members(team_id, player_id)
WHERE status = 'active';
COMMENT ON INDEX idx_golf_team_members_active IS
  'Optimizes active roster queries (excludes inactive/removed)';

-- ============================================================================
-- GOLF_QUALIFIER_ENTRIES COMPOSITE INDEXES
-- ============================================================================

-- Leaderboard index: qualifier_id sorted by score for rankings
-- Covers: Qualifier leaderboard displays, entry lookups
-- Example queries:
--   .eq('qualifier_id', id).order('score', { ascending: true })
CREATE INDEX IF NOT EXISTS idx_golf_qualifier_entries_leaderboard
ON golf_qualifier_entries(qualifier_id, score NULLS LAST);
COMMENT ON INDEX idx_golf_qualifier_entries_leaderboard IS
  'Optimizes qualifier leaderboard queries sorted by score';

-- Player entry lookup
-- Covers: Checking if player is entered in qualifier
CREATE INDEX IF NOT EXISTS idx_golf_qualifier_entries_player
ON golf_qualifier_entries(player_id, qualifier_id);
COMMENT ON INDEX idx_golf_qualifier_entries_player IS
  'Optimizes player qualifier entry lookups and history';

-- ============================================================================
-- GOLF_QUALIFIERS COMPOSITE INDEXES
-- ============================================================================

-- Team qualifiers by date
-- Covers: Team qualifier listings, upcoming qualifiers
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_team_date
ON golf_qualifiers(team_id, start_date DESC);
COMMENT ON INDEX idx_golf_qualifiers_team_date IS
  'Optimizes team qualifier listings sorted by date';

-- Active qualifiers (for quick filtering)
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_team_active
ON golf_qualifiers(team_id, status, start_date)
WHERE status IN ('scheduled', 'in_progress', 'upcoming');
COMMENT ON INDEX idx_golf_qualifiers_team_active IS
  'Optimizes active/upcoming qualifier lookups';

-- ============================================================================
-- GOLF_PLAYERS COMPOSITE INDEXES
-- ============================================================================

-- User lookup with status (most common auth pattern)
CREATE INDEX IF NOT EXISTS idx_golf_players_user_status
ON golf_players(user_id, status);
COMMENT ON INDEX idx_golf_players_user_status IS
  'Optimizes player lookup by user_id with status check';

-- ============================================================================
-- GOLF_EVENT_RSVPS COMPOSITE INDEXES
-- ============================================================================

-- Event RSVP aggregation
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_event_status
ON golf_event_rsvps(event_id, response);
COMMENT ON INDEX idx_golf_event_rsvps_event_status IS
  'Optimizes RSVP status counts per event';

-- Player RSVP history
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_player_event
ON golf_event_rsvps(player_id, event_id);
COMMENT ON INDEX idx_golf_event_rsvps_player_event IS
  'Optimizes player RSVP lookup for specific events';

-- ============================================================================
-- GOLF_ANNOUNCEMENTS COMPOSITE INDEXES
-- ============================================================================

-- Team announcements by date (for chronological listing)
CREATE INDEX IF NOT EXISTS idx_golf_announcements_team_created
ON golf_announcements(team_id, created_at DESC);
COMMENT ON INDEX idx_golf_announcements_team_created IS
  'Optimizes team announcement listings sorted by date';

-- ============================================================================
-- GOLF_PLAYER_CLASSES COMPOSITE INDEXES
-- ============================================================================

-- Player class schedule lookup
CREATE INDEX IF NOT EXISTS idx_golf_classes_player_day
ON golf_player_classes(player_id, day_of_week);
COMMENT ON INDEX idx_golf_classes_player_day IS
  'Optimizes player class schedule lookups by day';

-- ============================================================================
-- DOCUMENTATION & EXPECTED IMPROVEMENTS
-- ============================================================================

/*
EXPECTED QUERY IMPROVEMENTS:

1. idx_golf_rounds_player_status_date
   Query: SELECT * FROM golf_rounds WHERE player_id = $1 AND status = 'completed' ORDER BY round_date DESC
   Before: Seq Scan on golf_rounds + Sort
   After: Index Scan using idx_golf_rounds_player_status_date
   Expected improvement: 10-50x for active players with many rounds

2. idx_golf_shots_round_hole_shot
   Query: SELECT * FROM golf_shots WHERE round_id = ANY($1) ORDER BY hole_number, shot_number
   Before: Bitmap Index Scan + Sort
   After: Index Only Scan (if all needed columns in index)
   Expected improvement: 5-20x for stats calculations

3. idx_golf_events_team_start_time
   Query: SELECT * FROM golf_events WHERE team_id = $1 ORDER BY start_time
   Before: Seq Scan with Filter + Sort
   After: Index Scan using idx_golf_events_team_start_time
   Expected improvement: 10-30x for calendar views

4. idx_golf_team_members_player
   Query: SELECT team_id FROM golf_team_members WHERE player_id = $1
   Before: Seq Scan
   After: Index Scan
   Expected improvement: 20-100x (this is called on nearly every request)

5. idx_golf_qualifier_entries_leaderboard
   Query: SELECT * FROM golf_qualifier_entries WHERE qualifier_id = $1 ORDER BY score
   Before: Seq Scan + Sort
   After: Index Scan
   Expected improvement: 5-15x for leaderboard views

MONITORING:
Run EXPLAIN ANALYZE on queries after deployment to verify index usage.
Monitor pg_stat_user_indexes for index utilization.
*/
