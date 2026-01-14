-- ============================================================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS - Migration 053
-- From COMPREHENSIVE_DATABASE_AUDIT.md
-- Date: 2026-01-02
--
-- Adds foreign key constraints to ensure referential integrity
-- First cleans up orphaned data to allow constraints to be added
-- ============================================================================

-- STEP 1: Clean up orphaned data
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

-- STEP 2: Add foreign key constraints
-- ============================================================================

-- golf_shots → golf_rounds (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_shots_round_id_fkey'
  ) THEN
    ALTER TABLE golf_shots
    ADD CONSTRAINT golf_shots_round_id_fkey
    FOREIGN KEY (round_id) REFERENCES golf_rounds(id) ON DELETE CASCADE;
  END IF;
END $$;

-- golf_player_stats → golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_player_stats_player_id_fkey'
  ) THEN
    ALTER TABLE golf_player_stats
    ADD CONSTRAINT golf_player_stats_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- golf_announcement_acknowledgements → golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_announcement_acknowledgements_player_id_fkey'
  ) THEN
    ALTER TABLE golf_announcement_acknowledgements
    ADD CONSTRAINT golf_announcement_acknowledgements_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- golf_event_attendance → golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_event_attendance_player_id_fkey'
  ) THEN
    ALTER TABLE golf_event_attendance
    ADD CONSTRAINT golf_event_attendance_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- golf_player_classes → golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_player_classes_player_id_fkey'
  ) THEN
    ALTER TABLE golf_player_classes
    ADD CONSTRAINT golf_player_classes_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- golf_coach_notes → golf_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'golf_coach_notes_player_id_fkey'
  ) THEN
    ALTER TABLE golf_coach_notes
    ADD CONSTRAINT golf_coach_notes_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Summary: Added 6 foreign key constraints for data integrity
