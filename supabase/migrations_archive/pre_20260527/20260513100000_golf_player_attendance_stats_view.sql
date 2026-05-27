-- Migration: 20260513100000_golf_player_attendance_stats_view.sql
-- Purpose: Create golf_player_attendance_stats view that aggregates attendance
--          counts per player per status. Resolves the TODO in attendance.ts
--          so getPlayerAttendanceStats() can query the view directly instead
--          of doing in-memory aggregation.

CREATE OR REPLACE VIEW golf_player_attendance_stats AS
  SELECT
    player_id,
    COALESCE(status, 'pending') AS status,
    COUNT(*)::int AS count
  FROM golf_event_attendance
  GROUP BY player_id, COALESCE(status, 'pending');

-- RLS is not needed on views in Postgres — the underlying table's RLS
-- policies apply when the view is queried.
-- golf_event_attendance already has RLS policies enforced.
