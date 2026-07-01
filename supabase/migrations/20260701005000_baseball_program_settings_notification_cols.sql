-- =============================================================================
-- baseball_program_settings — notification preference columns (#454, #466)
-- =============================================================================
-- The settings_os migration (20260624000090_baseball_settings_os.sql) defines
-- baseball_program_settings with a `notification_defaults` jsonb column +
-- `quiet_hours_start`/`quiet_hours_end` text columns, but that migration's
-- CREATE TABLE IF NOT EXISTS was a no-op on the live database — an older
-- baseball_program_settings table (ai_enabled, announcement_tone,
-- default_task_priority, max_roster_size, recruiting_active, etc.) already
-- existed there, so none of the settings_os columns were ever added.
--
-- This migration adds ONLY the three notification-preference columns the
-- #454/#466 fix depends on:
--   - src/app/actions/messages.ts reads notification_defaults.message.in_app
--     to decide whether to create a bell notification for a baseball message.
--   - src/components/baseball/settings/ProgramSettingsClient.tsx reads/writes
--     notification_defaults + quiet_hours_start/quiet_hours_end via
--     updateProgramSettings (src/app/baseball/actions/program-settings.ts).
--
-- ADDITIVE ONLY: ADD COLUMN IF NOT EXISTS, re-runnable, no data loss, no
-- destructive writes. No GRANTs — this table has RLS enabled and anon/
-- authenticated already hold whatever grants earlier migrations set; this
-- migration does not touch privileges at all.
-- =============================================================================

ALTER TABLE public.baseball_program_settings
  ADD COLUMN IF NOT EXISTS notification_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quiet_hours_start      text,
  ADD COLUMN IF NOT EXISTS quiet_hours_end        text;

COMMENT ON COLUMN public.baseball_program_settings.notification_defaults IS
  'Per-notification-type defaults, e.g. {"message": {"in_app": true, "email": false}}. Read by messages.ts (isBaseballMessageNotificationEnabled) and written by updateProgramSettings via ProgramSettingsClient (#454, #466).';
COMMENT ON COLUMN public.baseball_program_settings.quiet_hours_start IS
  'Program-level quiet-hours start, e.g. "22:00". No notifications are sent during the quiet-hours window.';
COMMENT ON COLUMN public.baseball_program_settings.quiet_hours_end IS
  'Program-level quiet-hours end, e.g. "07:00".';
