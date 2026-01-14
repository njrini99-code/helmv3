-- ============================================================================
-- CLEANUP ORPHANED DATA - Migration 052a
-- Must run before adding foreign key constraints
-- Date: 2026-01-02
-- ============================================================================

-- Clean up orphaned golf_shots (shots without valid rounds)
DELETE FROM golf_shots
WHERE NOT EXISTS (
  SELECT 1 FROM golf_rounds WHERE golf_rounds.id = golf_shots.round_id
);

-- Clean up orphaned golf_player_stats (stats without valid players)
DELETE FROM golf_player_stats
WHERE NOT EXISTS (
  SELECT 1 FROM golf_players WHERE golf_players.id = golf_player_stats.player_id
);

-- Clean up orphaned golf_announcement_acknowledgements
DELETE FROM golf_announcement_acknowledgements
WHERE NOT EXISTS (
  SELECT 1 FROM golf_players WHERE golf_players.id = golf_announcement_acknowledgements.player_id
);

-- Clean up orphaned golf_event_attendance
DELETE FROM golf_event_attendance
WHERE NOT EXISTS (
  SELECT 1 FROM golf_players WHERE golf_players.id = golf_event_attendance.player_id
);

-- Clean up orphaned golf_player_classes
DELETE FROM golf_player_classes
WHERE NOT EXISTS (
  SELECT 1 FROM golf_players WHERE golf_players.id = golf_player_classes.player_id
);

-- Clean up orphaned golf_coach_notes
DELETE FROM golf_coach_notes
WHERE NOT EXISTS (
  SELECT 1 FROM golf_players WHERE golf_players.id = golf_coach_notes.player_id
);

-- Summary: Cleaned up orphaned records before adding foreign keys
