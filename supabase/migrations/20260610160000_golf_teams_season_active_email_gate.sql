-- Offseason email gate (2026-06-10 audit): scheduled digest/recap crons were
-- emailing coaches of dormant teams (e.g. daily digests driven purely by
-- seeded demo data on Guilford's team). Adds a per-team switch that the
-- coach-morning-digest and weekly-coach-email crons check before sending.
-- Event-driven emails (reminders, create/cancel fan-outs) are NOT gated —
-- if someone schedules an event in the offseason, attendees should hear
-- about it.
-- APPLY: via MCP apply_migration (apply-time stamp, NOT this filename).
--        Applied to prod 2026-06-10 as golf_teams_season_active_email_gate.
-- ROLLBACK: ALTER TABLE public.golf_teams DROP COLUMN season_active;
ALTER TABLE public.golf_teams
  ADD COLUMN season_active boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.golf_teams.season_active IS
  'When false, scheduled email crons (coach morning digest, weekly coach recap) skip this team. Event-driven emails are unaffected.';
