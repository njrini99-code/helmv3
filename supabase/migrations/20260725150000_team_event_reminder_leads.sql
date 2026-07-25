-- ============================================================================
-- golf_team_settings — per-team event reminder lead times
-- ----------------------------------------------------------------------------
-- The event-reminder cron (`/api/cron/event-reminders`) sends two reminders per
-- event: an "early" one and a "late" one. Until now both lead times were global
-- constants in the route file (REMINDER_24H_MS / REMINDER_1H_MS) — every team on
-- the platform got 24 hours and 1 hour, with no way to change either and no way
-- to turn reminders off short of every player individually opting out.
--
--   event_reminders_enabled     — master switch for the team's automated
--                                 reminders. Default true = today's behaviour.
--   event_reminder_early_hours  — lead time (hours) for the early reminder.
--                                 Default 24 = the prior REMINDER_24H_MS.
--   event_reminder_late_minutes — lead time (minutes) for the late reminder.
--                                 Default 60 = the prior REMINDER_1H_MS.
--
-- Same contract as migrations 20260725090000 / 20260725140000: EVERY DEFAULT IS
-- THE CURRENT HARD-CODED VALUE, so applying this changes nothing until a coach
-- moves a control.
--
-- NOTE ON THE SLOTS. `golf_calendar_notifications.notification_type` keeps its
-- existing 'event_reminder_24h' / 'event_reminder_1h' values. Those strings are
-- now SLOT IDENTIFIERS ("the early one" / "the late one"), not literal
-- durations — reusing them preserves the UNIQUE (event_id, user_id,
-- notification_type) idempotency key and every already-sent row. The user-facing
-- copy is generated from the actual lead time, so nothing a coach reads says
-- "24h" when the team is set to 72.
--
-- Additive only. Safe on a live table: PG 11+ stores a non-volatile DEFAULT in
-- pg_attribute rather than rewriting, so ADD COLUMN ... NOT NULL DEFAULT is a
-- metadata-only change.
-- ============================================================================

ALTER TABLE public.golf_team_settings
  ADD COLUMN IF NOT EXISTS event_reminders_enabled     boolean  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS event_reminder_early_hours  smallint NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS event_reminder_late_minutes smallint NOT NULL DEFAULT 60;

-- Range guards. The cron runs HOURLY, and an event is only reminded while it
-- sits inside (now, now + lead + 15min]. That window has to be wider than the
-- 60-minute gap between ticks or an event can pass clean through it and never
-- be reminded — which is why the late floor is 60 minutes, not something
-- smaller. The early ceiling is 168h (7 days); beyond that the cron's single
-- look-ahead query would have to scan an ever-larger slice of the calendar for
-- every team on the platform.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_team_settings_event_reminder_early_range'
  ) THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_event_reminder_early_range
      CHECK (event_reminder_early_hours >= 2 AND event_reminder_early_hours <= 168);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_team_settings_event_reminder_late_range'
  ) THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_event_reminder_late_range
      CHECK (event_reminder_late_minutes >= 60 AND event_reminder_late_minutes <= 720);
  END IF;

  -- The two reminders must stay ordered, or a team could configure a 2-hour
  -- "early" and a 12-hour "late" and receive them backwards — with copy that
  -- calls the second one "starting soon" twelve hours out.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_team_settings_event_reminder_ordering'
  ) THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_event_reminder_ordering
      CHECK (event_reminder_early_hours * 60 > event_reminder_late_minutes);
  END IF;
END $$;

COMMENT ON COLUMN public.golf_team_settings.event_reminders_enabled IS
  'Master switch for this team''s automated event reminders. False suppresses both the early and late reminder for every event on the team.';
COMMENT ON COLUMN public.golf_team_settings.event_reminder_early_hours IS
  'Lead time in HOURS for the early event reminder (notification_type = event_reminder_24h, a slot identifier not a literal duration). Default 24 = the prior hard-coded REMINDER_24H_MS.';
COMMENT ON COLUMN public.golf_team_settings.event_reminder_late_minutes IS
  'Lead time in MINUTES for the late event reminder (notification_type = event_reminder_1h, a slot identifier not a literal duration). Default 60 = the prior hard-coded REMINDER_1H_MS.';
