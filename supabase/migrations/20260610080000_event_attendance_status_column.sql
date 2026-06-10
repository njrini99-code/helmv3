-- Calendar audit 2026-06-10 finding #21 follow-up: golf_event_attendance.status
-- is the RSVP axis (clobbering it was the original bug), and no column could
-- hold a first-class attendance mark — "late" could not persist (the panel
-- degraded it to present), and explicit no-show was only distinguishable by
-- the checked_in=false + checked_in_at IS NOT NULL convention. Give attendance
-- its own axis, mirroring the RSVP/attendance dual-axis the AttendancePanel
-- already models.
--
-- APPLY: via MCP apply_migration (apply-time version stamp, NOT this filename).
-- ROLLBACK: ALTER TABLE public.golf_event_attendance DROP COLUMN attendance_status;

ALTER TABLE public.golf_event_attendance
  ADD COLUMN attendance_status text
  CHECK (attendance_status IN ('present', 'late', 'no_show'));

COMMENT ON COLUMN public.golf_event_attendance.attendance_status IS
  'Coach-recorded attendance mark (dual-axis with status, which is the player''s RSVP). NULL = not yet marked. checked_in/checked_in_at remain the timestamped check-in record.';

-- Backfill the only pre-existing convention: rows explicitly marked not-checked-in
-- (checked_in=false with a checked_in_at stamp) were no-shows.
UPDATE public.golf_event_attendance
SET attendance_status = CASE WHEN checked_in THEN 'present' ELSE 'no_show' END
WHERE checked_in_at IS NOT NULL AND attendance_status IS NULL;
