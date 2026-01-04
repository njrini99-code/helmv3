-- =====================================================================================
-- Migration: Attendance Tracking System
-- Description: Check-in system, actual attendance vs RSVP, no-show tracking
-- =====================================================================================

-- Extend golf_event_attendance table with check-in fields
ALTER TABLE golf_event_attendance
  ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES golf_coaches(id),
  ADD COLUMN IF NOT EXISTS check_in_method TEXT CHECK (check_in_method IN ('manual', 'qr_code', 'self')),
  ADD COLUMN IF NOT EXISTS no_show BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_marked_by UUID REFERENCES golf_coaches(id),
  ADD COLUMN IF NOT EXISTS attendance_notes TEXT;

COMMENT ON COLUMN golf_event_attendance.checked_in IS 'Whether player checked in to the event';
COMMENT ON COLUMN golf_event_attendance.checked_in_at IS 'When player checked in';
COMMENT ON COLUMN golf_event_attendance.checked_in_by IS 'Coach who checked player in';
COMMENT ON COLUMN golf_event_attendance.check_in_method IS 'How check-in was performed: manual, qr_code, self';
COMMENT ON COLUMN golf_event_attendance.no_show IS 'Marked as no-show (RSVP yes but didnt attend)';
COMMENT ON COLUMN golf_event_attendance.no_show_marked_at IS 'When marked as no-show';
COMMENT ON COLUMN golf_event_attendance.no_show_marked_by IS 'Coach who marked as no-show';
COMMENT ON COLUMN golf_event_attendance.attendance_notes IS 'Additional notes about attendance';

-- Create indexes for attendance queries
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_checked_in ON golf_event_attendance(checked_in);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_no_show ON golf_event_attendance(no_show);
CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_event_checked_in ON golf_event_attendance(event_id, checked_in);

-- Add check-in settings to golf_events table
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS enable_check_in BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS check_in_opens_minutes_before INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS check_in_closes_minutes_after INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS require_coach_check_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_code_token UUID DEFAULT gen_random_uuid();

COMMENT ON COLUMN golf_events.enable_check_in IS 'Whether check-in is enabled for this event';
COMMENT ON COLUMN golf_events.check_in_opens_minutes_before IS 'Minutes before event that check-in opens';
COMMENT ON COLUMN golf_events.check_in_closes_minutes_after IS 'Minutes after event start that check-in closes';
COMMENT ON COLUMN golf_events.require_coach_check_in IS 'Whether coach approval required for check-in';
COMMENT ON COLUMN golf_events.qr_code_token IS 'Unique token for QR code check-in';

CREATE INDEX IF NOT EXISTS idx_golf_events_qr_code ON golf_events(qr_code_token);

-- =====================================================================================
-- Attendance Reports View (for coaches)
-- =====================================================================================

CREATE OR REPLACE VIEW golf_attendance_summary AS
SELECT
  e.id AS event_id,
  e.title AS event_title,
  e.start_date,
  e.team_id,
  COUNT(DISTINCT a.player_id) AS total_rsvps,
  COUNT(DISTINCT CASE WHEN a.status = 'accepted' THEN a.player_id END) AS rsvp_yes,
  COUNT(DISTINCT CASE WHEN a.checked_in = true THEN a.player_id END) AS checked_in_count,
  COUNT(DISTINCT CASE WHEN a.no_show = true THEN a.player_id END) AS no_show_count,
  ROUND(
    (COUNT(DISTINCT CASE WHEN a.checked_in = true THEN a.player_id END)::NUMERIC /
     NULLIF(COUNT(DISTINCT CASE WHEN a.status = 'accepted' THEN a.player_id END), 0) * 100),
    1
  ) AS attendance_percentage
FROM golf_events e
LEFT JOIN golf_event_attendance a ON e.id = a.event_id
GROUP BY e.id, e.title, e.start_date, e.team_id;

COMMENT ON VIEW golf_attendance_summary IS 'Summary of attendance metrics per event';

-- Grant access to authenticated users
GRANT SELECT ON golf_attendance_summary TO authenticated;

-- RLS for attendance summary view
ALTER VIEW golf_attendance_summary SET (security_invoker = on);

-- =====================================================================================
-- Player Attendance History View
-- =====================================================================================

CREATE OR REPLACE VIEW golf_player_attendance_stats AS
SELECT
  p.id AS player_id,
  p.first_name,
  p.last_name,
  p.team_id,
  COUNT(DISTINCT a.event_id) AS total_events,
  COUNT(DISTINCT CASE WHEN a.status = 'accepted' THEN a.event_id END) AS rsvp_yes_count,
  COUNT(DISTINCT CASE WHEN a.checked_in = true THEN a.event_id END) AS attended_count,
  COUNT(DISTINCT CASE WHEN a.no_show = true THEN a.event_id END) AS no_show_count,
  ROUND(
    (COUNT(DISTINCT CASE WHEN a.checked_in = true THEN a.event_id END)::NUMERIC /
     NULLIF(COUNT(DISTINCT CASE WHEN a.status = 'accepted' THEN a.event_id END), 0) * 100),
    1
  ) AS attendance_rate
FROM golf_players p
LEFT JOIN golf_event_attendance a ON p.id = a.player_id
LEFT JOIN golf_events e ON a.event_id = e.id
WHERE e.start_date < CURRENT_DATE -- Only past events
GROUP BY p.id, p.first_name, p.last_name, p.team_id;

COMMENT ON VIEW golf_player_attendance_stats IS 'Player attendance statistics';

-- Grant access to authenticated users
GRANT SELECT ON golf_player_attendance_stats TO authenticated;

-- RLS for player stats view
ALTER VIEW golf_player_attendance_stats SET (security_invoker = on);

-- =====================================================================================
-- Function: Auto-mark no-shows after event ends
-- =====================================================================================

CREATE OR REPLACE FUNCTION mark_no_shows_for_past_events()
RETURNS void AS $$
BEGIN
  UPDATE golf_event_attendance a
  SET
    no_show = true,
    no_show_marked_at = NOW()
  FROM golf_events e
  WHERE
    a.event_id = e.id
    AND a.status = 'accepted' -- RSVP'd yes
    AND a.checked_in = false -- But didn't check in
    AND a.no_show = false -- Not already marked
    AND e.start_date < CURRENT_DATE - INTERVAL '1 day'; -- Event ended yesterday or earlier
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_no_shows_for_past_events() IS 'Auto-marks no-shows for past events (run daily via cron)';

-- Note: This function should be called daily via a cron job or scheduled task
