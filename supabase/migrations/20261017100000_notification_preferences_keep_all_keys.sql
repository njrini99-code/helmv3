-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-17; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: LOW. One trigger function body changes (CREATE OR REPLACE keeps its
-- owner, ACL and the trigger itself). No table, policy, grant or data change.
--
-- WHY (Clubhouse P008 Settings, owner-flagged): six notification switches save
-- "successfully" and then read back as their default. The BEFORE INSERT OR
-- UPDATE trigger validate_notification_preferences_trigger on public.users
-- rebuilds notification_preferences with jsonb_build_object over a fixed list
-- of nine keys (read live 2026-10-17 with pg_get_functiondef):
--   email_messages, email_pipeline_updates, email_event_reminders,
--   email_profile_views, email_announcements, push_enabled, push_messages,
--   push_events, digest_frequency
-- Every other key is silently dropped on write. The app writes six more, all
-- booleans, through the one writer of this column,
-- updateNotificationPreferences
-- (src/app/actions/notification-preferences.ts, zod schema), from Clubhouse
-- Settings (src/clubhouse/screens/settings/writes.ts setDelivery) and Fairway
-- Settings (FairwaySettingsGeneral.tsx); delivery reads them in
-- src/lib/notifications/{email,push}.ts and gatedDelivery():
--   email_task_reminders, email_coachhelm, push_announcements,
--   push_task_reminders, push_coachhelm, quiet_mode
-- Grep of src/, scripts/ and supabase/functions on 2026-10-17 found no other
-- key written to users.notification_preferences (golf or baseball), and no
-- other database function references the column.
--
-- WHAT CHANGES:
--   * The nine existing keys keep exactly today's validation and defaults
--     (same COALESCE, same ::boolean cast, digest_frequency as text).
--   * The six keys above are now kept, present-only: a key survives when it is
--     present and a JSON boolean, and is omitted otherwise (absent, JSON null,
--     or any non-boolean). No default is invented for an absent key, so the app
--     and delivery defaults keep deciding (push_announcements and the task and
--     CoachHelm channels default on, quiet_mode off). A missing key never
--     becomes false.
--   * Any key not in the fifteen is still dropped: the trigger stays a
--     whitelist.
--   * SECURITY INVOKER, plpgsql and SET search_path = '' are kept as live.
--
-- NOT CHANGED: the column default (still the nine keys), the trigger, and the
-- rows already stored. The dropped values were never saved, so there is nothing
-- to backfill: each user's next switch flip saves correctly.
--
-- ROLLBACK: re-create the live body (nine keys only):
--   CREATE OR REPLACE FUNCTION public.validate_notification_preferences()
--    RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$
--   BEGIN
--     IF NEW.notification_preferences IS NOT NULL THEN
--       NEW.notification_preferences = jsonb_build_object(
--         'email_messages',
--         COALESCE((NEW.notification_preferences->>'email_messages')::boolean,
--         true),
--         'email_pipeline_updates',
--  COALESCE((NEW.notification_preferences->>'email_pipeline_updates')::boolean,
--         true),
--         'email_event_reminders',
--   COALESCE((NEW.notification_preferences->>'email_event_reminders')::boolean,
--         true),
--         'email_profile_views',
--     COALESCE((NEW.notification_preferences->>'email_profile_views')::boolean,
--         false),
--         'email_announcements',
--     COALESCE((NEW.notification_preferences->>'email_announcements')::boolean,
--         true),
--         'push_enabled',
--         COALESCE((NEW.notification_preferences->>'push_enabled')::boolean,
--         true),
--         'push_messages',
--         COALESCE((NEW.notification_preferences->>'push_messages')::boolean,
--         true),
--         'push_events',
--         COALESCE((NEW.notification_preferences->>'push_events')::boolean,
--         true),
--         'digest_frequency',
--         COALESCE(NEW.notification_preferences->>'digest_frequency',
--         'daily'));
--     END IF;
--     RETURN NEW;
--   END; $f$;
-- The six keys then drop again on the next write of each row (the app's
-- defaults apply, as today).
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'validate_notification_preferences' and not p.prosecdef and
-- VERIFY: p.proconfig = array['search_path=""'] and p.prosrc like
-- VERIFY: '%quiet_mode%' and p.prosrc like '%push_announcements%') = 1;
-- VERIFY: select 1 where (select count(*) from pg_trigger t where t.tgrelid =
-- VERIFY: 'public.users'::regclass and t.tgname =
-- VERIFY: 'validate_notification_preferences_trigger' and t.tgenabled = 'O') =
-- VERIFY: 1;
-- pgTAP: supabase/tests/rls/notification_preferences_keep_all_keys.sql

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.validate_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_in    jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_key   text;
BEGIN
  -- Ensure notification_preferences is always a valid JSONB object
  IF NEW.notification_preferences IS NOT NULL THEN
    v_in := NEW.notification_preferences;

    -- Keys added after the original nine (20261017100000). Kept only when
    -- present and a JSON boolean; never defaulted, so an absent key stays
    -- absent and the app's own default applies.
    FOREACH v_key IN ARRAY ARRAY[
      'email_task_reminders',
      'email_coachhelm',
      'push_announcements',
      'push_task_reminders',
      'push_coachhelm',
      'quiet_mode'
    ]
    LOOP
      IF jsonb_typeof(v_in -> v_key) = 'boolean' THEN
        v_extra := v_extra || jsonb_build_object(v_key, v_in -> v_key);
      END IF;
    END LOOP;

    -- Validate required keys exist with defaults (unchanged from the live body)
    NEW.notification_preferences = jsonb_build_object(
      'email_messages', COALESCE((v_in->>'email_messages')::boolean, true),
      'email_pipeline_updates', COALESCE((v_in->>'email_pipeline_updates')::boolean, true),
      'email_event_reminders', COALESCE((v_in->>'email_event_reminders')::boolean, true),
      'email_profile_views', COALESCE((v_in->>'email_profile_views')::boolean, false),
      'email_announcements', COALESCE((v_in->>'email_announcements')::boolean, true),
      'push_enabled', COALESCE((v_in->>'push_enabled')::boolean, true),
      'push_messages', COALESCE((v_in->>'push_messages')::boolean, true),
      'push_events', COALESCE((v_in->>'push_events')::boolean, true),
      'digest_frequency', COALESCE(v_in->>'digest_frequency', 'daily')
    ) || v_extra;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_notification_preferences() IS
'BEFORE INSERT/UPDATE on public.users: normalises notification_preferences. '
'The nine original keys are cast and defaulted; email_task_reminders, '
'email_coachhelm, push_announcements, push_task_reminders, push_coachhelm and '
'quiet_mode are kept when present as JSON booleans (never defaulted); every '
'other key is dropped. 20261017100000.';
