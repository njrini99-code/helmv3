-- Poll and rsvp answers (20261024090000_golf_message_responses_access.sql):
-- exercise the reconciled contract as real authenticated roles. One row per
-- person per message (the poll upsert's conflict target); members read the
-- thread's answers and write only their own; outsiders and anon see nothing;
-- answers go with their message; published for realtime. WRITTEN, NOT RUN
-- where it was authored (no Supabase stack); the same checks passed by hand on
-- a stub database there, before and after applying the migration twice.
BEGIN;
\ir _helpers.sql
SELECT plan(11);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000924101', 'poll-one@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000924102', 'poll-two@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000924104', 'poll-outsider@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title)
  VALUES ('00000000-0000-0000-0000-000000924201', '00000000-0000-0000-0000-000000924101', true, 'Poll test group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
  SELECT '00000000-0000-0000-0000-000000924201'::uuid, id
  FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000924101',
    '00000000-0000-0000-0000-000000924102');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924201',
    '00000000-0000-0000-0000-000000924101', 'Poll: Van time?', 'poll',
    '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}]}');
INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924102', 'o1');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000924101","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000924301'), 1,
  'a member can read another member''s vote');
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924101', 'o1')
  ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice$$,
  'a member can vote with the poll upsert');
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924101', 'o2')
  ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice$$,
  'a member can change their vote with the same upsert');
SELECT is((SELECT choice FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000924301'
    AND user_id = '00000000-0000-0000-0000-000000924101'), 'o2',
  'a changed vote replaces the first, one row per person');
SELECT throws_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924102', 'o2')
  ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice$$,
  '42501', NULL, 'a member cannot vote as another member');
DELETE FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000924301'
    AND user_id = '00000000-0000-0000-0000-000000924102';
RESET role;
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE user_id = '00000000-0000-0000-0000-000000924102'), 1,
  'a member cannot take back another member''s vote');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000924104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000924301'), 0,
  'an outsider cannot read the thread''s votes');
SELECT throws_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000924301', '00000000-0000-0000-0000-000000924104', 'o1')$$,
  '42501', NULL, 'an outsider cannot vote on a group poll');
RESET role;

SELECT ok(NOT has_table_privilege('anon', 'public.golf_message_responses', 'SELECT'),
  'anonymous callers cannot read votes');
SELECT ok(EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename = 'golf_message_responses'),
  'votes are published for realtime updates');
DELETE FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-000000924301';
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000924301'), 0,
  'votes go with their message');
SELECT * FROM finish();
ROLLBACK;
