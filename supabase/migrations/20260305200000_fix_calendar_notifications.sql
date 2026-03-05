-- ============================================================================
-- Fix golf_calendar_notifications schema
-- Addresses: schema mismatch, missing columns, UNIQUE constraint
-- ============================================================================

-- 1. Make event_id nullable (non-event notifications like messages don't have one)
ALTER TABLE golf_calendar_notifications ALTER COLUMN event_id DROP NOT NULL;

-- 2. Drop the old CHECK constraint on notification_type
--    Old values: 'reminder', 'update', 'cancellation', 'rsvp_request'
--    Code uses: 'event_invitation', 'event_updated', 'event_cancelled',
--              'rsvp_response', 'rsvp_reminder', 'message', etc.
ALTER TABLE golf_calendar_notifications
  DROP CONSTRAINT IF EXISTS golf_calendar_notifications_notification_type_check;

ALTER TABLE golf_calendar_notifications
  ADD CONSTRAINT golf_calendar_notifications_notification_type_check
  CHECK (notification_type IN (
    -- Calendar / RSVP
    'event_invitation', 'event_updated', 'event_cancelled',
    'rsvp_response', 'rsvp_reminder', 'event_reminder',
    -- Messaging
    'message',
    -- Team
    'announcement', 'task_assigned', 'qualifier_created',
    -- Legacy (keep for existing rows)
    'reminder', 'update', 'cancellation', 'rsvp_request'
  ));

-- 3. Add missing columns that the code already inserts
ALTER TABLE golf_calendar_notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE golf_calendar_notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- 4. Remove the UNIQUE(event_id, user_id, notification_type) constraint
--    This causes RSVP notifications from different players to overwrite each other
--    because upsert matches on this constraint
ALTER TABLE golf_calendar_notifications
  DROP CONSTRAINT IF EXISTS golf_calendar_notifications_event_id_user_id_notification_ty_key;

-- 5. Add index for efficient unread count queries (replaces the unique constraint)
CREATE INDEX IF NOT EXISTS idx_golf_calendar_notifications_user_unread_type
  ON golf_calendar_notifications(user_id, notification_type)
  WHERE read_at IS NULL;

-- ============================================================================
-- Fix golf_event_attendance status to accept both attendance + RSVP values
-- attendance.ts uses: attending, not_attending, maybe, pending, excused, unexcused
-- rsvp.ts uses: accepted, declined, tentative, pending
-- The column is currently golf_attendance_status ENUM — convert to TEXT first
-- ============================================================================

-- Convert ENUM column to TEXT so we can add new values
ALTER TABLE golf_event_attendance
  ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Reset the default (was ENUM-typed, now needs TEXT default)
ALTER TABLE golf_event_attendance
  ALTER COLUMN status SET DEFAULT 'pending';

-- Drop old CHECK if it exists and recreate with all valid values
ALTER TABLE golf_event_attendance
  DROP CONSTRAINT IF EXISTS golf_event_attendance_status_check;

ALTER TABLE golf_event_attendance
  ADD CONSTRAINT golf_event_attendance_status_check
  CHECK (status IN (
    -- RSVP values (primary)
    'pending', 'accepted', 'declined', 'tentative',
    -- Attendance values (check-in/no-show)
    'attending', 'not_attending', 'maybe', 'excused', 'unexcused'
  ));
