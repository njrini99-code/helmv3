-- =============================================================================
-- Drop the never-shipped golf_event_rsvps table + its trigger machinery.
--
-- 030_golf_calendar.sql defined `golf_event_rsvps` plus a counts-update
-- trigger, but the table was never created in production (live schema check
-- 2026-04-28 returned 'no'). All RSVP code uses `golf_event_attendance`.
-- This migration ensures the cruft cannot resurface and confuse future work.
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_event_rsvp_counts() CASCADE;
DROP TABLE IF EXISTS public.golf_event_rsvps CASCADE;
