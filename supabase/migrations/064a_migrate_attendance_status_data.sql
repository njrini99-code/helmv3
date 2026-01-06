-- ============================================================================
-- Migrate Attendance Status Data
-- ============================================================================
-- Purpose: Migrate existing attendance data to new RSVP status values
-- Must be separate migration due to PostgreSQL enum transaction limitations
-- ============================================================================

-- Migrate existing data to new values
-- 'attending' -> 'accepted'
-- 'not_attending' -> 'declined'
-- 'maybe' -> 'tentative'
-- 'pending' stays as 'pending'
UPDATE golf_event_attendance
  SET status = CASE
    WHEN status = 'attending' THEN 'accepted'::golf_attendance_status
    WHEN status = 'not_attending' THEN 'declined'::golf_attendance_status
    WHEN status = 'maybe' THEN 'tentative'::golf_attendance_status
    ELSE status
  END;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
