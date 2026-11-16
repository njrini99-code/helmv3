-- Rollback for 20261115210100_golf_demo_write_guard.sql (DD-13 demo write guard).
--
-- Every object the migration creates is new: there is no prior definition to
-- restore. Run as postgres, in one transaction (db query --linked does that).
--
-- What rolling back costs: signed-in accounts on the demo team (the owner's
-- own logins on it, QA accounts) can write there again. The shared demo login
-- stays read-only in the app (withAdminObserved demoSafe).

SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_rounds;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_events;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_announcements;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tasks;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_qualifiers;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_practice_plans;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_team_members;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_documents;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_travel_itineraries;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tournaments;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tournament_entries;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_holes;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_shots;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_event_attendance;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_messages;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_message_attachments;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_task_assignments;
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_qualifier_entries;
DROP FUNCTION IF EXISTS helm_private.golf_demo_write_guard();

-- VERIFY: no guard trigger is left.
--   select count(*) = 0 from pg_catalog.pg_trigger where tgname = 'golf_demo_write_guard';
