-- pgTAP contract for public.validate_notification_preferences
-- (20261017100000_notification_preferences_keep_all_keys.sql).
--
-- The BEFORE INSERT/UPDATE trigger on public.users used to rebuild
-- notification_preferences from nine fixed keys, so the six later switches
-- (email_task_reminders, email_coachhelm, push_announcements,
-- push_task_reminders, push_coachhelm, quiet_mode) saved and then vanished.
-- This suite proves the six now survive as booleans, an absent one stays
-- absent (never defaulted), a non-boolean one is dropped, an unknown key is
-- still dropped, and the original nine keep their validation and defaults.
--
-- Plan arithmetic: 1 structural + 6 survive + 2 false survive + 1 absent +
-- 2 non-boolean + 1 unknown + 2 original defaults + 1 insert path = 16.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000171001', 'prefs@keepkeys.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000171001', 'prefs@keepkeys.test', 'player')
  ON CONFLICT DO NOTHING;
END $$;

-- GROUP 1 — the function keeps the live security settings.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'validate_notification_preferences'
      AND NOT p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'validate_notification_preferences stays SECURITY INVOKER with search_path = ""'
);

-- GROUP 2 — every key the app writes survives an UPDATE.
UPDATE public.users
   SET notification_preferences = '{
     "email_messages": false, "email_pipeline_updates": true, "email_event_reminders": true,
     "email_profile_views": true, "email_announcements": true, "push_enabled": true,
     "push_messages": true, "push_events": false, "digest_frequency": "weekly",
     "email_task_reminders": true, "email_coachhelm": true, "push_announcements": true,
     "push_task_reminders": true, "push_coachhelm": true, "quiet_mode": true
   }'::jsonb
 WHERE id = '00000000-0000-0000-0000-000000171001';

SELECT is((SELECT notification_preferences -> 'email_task_reminders' FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'email_task_reminders survives');
SELECT is((SELECT notification_preferences -> 'email_coachhelm'      FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'email_coachhelm survives');
SELECT is((SELECT notification_preferences -> 'push_announcements'   FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'push_announcements survives');
SELECT is((SELECT notification_preferences -> 'push_task_reminders'  FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'push_task_reminders survives');
SELECT is((SELECT notification_preferences -> 'push_coachhelm'       FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'push_coachhelm survives');
SELECT is((SELECT notification_preferences -> 'quiet_mode'           FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'true'::jsonb, 'quiet_mode survives');

-- A switch turned OFF is the case the bug actually broke (it read back as the
-- default, on).
UPDATE public.users
   SET notification_preferences = notification_preferences || '{"push_announcements": false, "quiet_mode": false}'::jsonb
 WHERE id = '00000000-0000-0000-0000-000000171001';
SELECT is((SELECT notification_preferences -> 'push_announcements' FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'false'::jsonb, 'push_announcements = false survives');
SELECT is((SELECT notification_preferences -> 'quiet_mode'         FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'), 'false'::jsonb, 'quiet_mode = false survives');

-- GROUP 3 — absent, non-boolean and unknown keys.
UPDATE public.users
   SET notification_preferences = '{
     "email_messages": true, "quiet_mode": "yes", "push_coachhelm": 1,
     "not_a_real_key": true
   }'::jsonb
 WHERE id = '00000000-0000-0000-0000-000000171001';

SELECT ok(
  NOT ((SELECT notification_preferences FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001') ? 'email_task_reminders'),
  'an absent new key stays absent (never defaulted)'
);
SELECT ok(
  NOT ((SELECT notification_preferences FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001') ? 'quiet_mode'),
  'a string quiet_mode is dropped'
);
SELECT ok(
  NOT ((SELECT notification_preferences FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001') ? 'push_coachhelm'),
  'a numeric push_coachhelm is dropped'
);
SELECT ok(
  NOT ((SELECT notification_preferences FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001') ? 'not_a_real_key'),
  'an unknown key is still dropped'
);

-- GROUP 4 — the original nine keep their defaults.
SELECT is(
  (SELECT notification_preferences -> 'email_profile_views' FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'),
  'false'::jsonb,
  'email_profile_views still defaults to false'
);
SELECT is(
  (SELECT notification_preferences ->> 'digest_frequency' FROM public.users WHERE id = '00000000-0000-0000-0000-000000171001'),
  'daily',
  'digest_frequency still defaults to daily'
);

-- GROUP 5 — the INSERT path runs the same rules.
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000171002', 'insert@keepkeys.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role, notification_preferences) VALUES
    ('00000000-0000-0000-0000-000000171002', 'insert@keepkeys.test', 'player', '{"quiet_mode": true}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET notification_preferences = EXCLUDED.notification_preferences;
END $$;
SELECT is(
  (SELECT notification_preferences -> 'quiet_mode' FROM public.users WHERE id = '00000000-0000-0000-0000-000000171002'),
  'true'::jsonb,
  'quiet_mode survives an INSERT (or the upsert of an auto-created users row)'
);

SELECT * FROM finish();
ROLLBACK;
