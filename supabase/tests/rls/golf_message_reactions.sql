-- Exercise the reconciled reaction contract as real authenticated roles.
BEGIN;
\ir _helpers.sql
SELECT plan(10);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000908101', 'reaction-one@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000908102', 'reaction-two@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000908103', 'reaction-three@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000908104', 'reaction-outsider@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title)
  VALUES ('00000000-0000-0000-0000-000000908201', '00000000-0000-0000-0000-000000908101', true, 'Reaction test group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
  SELECT '00000000-0000-0000-0000-000000908201'::uuid, id
  FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000908101',
    '00000000-0000-0000-0000-000000908102', '00000000-0000-0000-0000-000000908103');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content)
  VALUES ('00000000-0000-0000-0000-000000908301', '00000000-0000-0000-0000-000000908201',
    '00000000-0000-0000-0000-000000908101', 'Reaction fixture');
INSERT INTO public.golf_message_reactions (message_id, user_id, emoji)
  VALUES ('00000000-0000-0000-0000-000000908301', '00000000-0000-0000-0000-000000908102', '👍');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000908101","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_message_reactions
  WHERE message_id = '00000000-0000-0000-0000-000000908301'), 1,
  'a group member can read another member reaction');
SELECT lives_ok($$INSERT INTO public.golf_message_reactions (message_id,user_id,emoji)
  VALUES ('00000000-0000-0000-0000-000000908301','00000000-0000-0000-0000-000000908101','👍')$$,
  'a group member can add their own reaction');
SELECT throws_ok($$INSERT INTO public.golf_message_reactions (message_id,user_id,emoji)
  VALUES ('00000000-0000-0000-0000-000000908301','00000000-0000-0000-0000-000000908101','👍')$$,
  '23505', NULL, 'the same member cannot inflate a reaction count with duplicates');
SELECT throws_ok($$INSERT INTO public.golf_message_reactions (message_id,user_id,emoji)
  VALUES ('00000000-0000-0000-0000-000000908301','00000000-0000-0000-0000-000000908103','👍')$$,
  '42501', NULL, 'a member cannot impersonate another member');
DELETE FROM public.golf_message_reactions WHERE message_id = '00000000-0000-0000-0000-000000908301'
  AND user_id = '00000000-0000-0000-0000-000000908102';
RESET role;
SELECT is((SELECT count(*)::int FROM public.golf_message_reactions
  WHERE message_id = '00000000-0000-0000-0000-000000908301'
    AND user_id = '00000000-0000-0000-0000-000000908102'), 1,
  'deleting a reaction preserves another member row');
SET LOCAL role TO authenticated;
DELETE FROM public.golf_message_reactions WHERE message_id = '00000000-0000-0000-0000-000000908301'
  AND user_id = '00000000-0000-0000-0000-000000908101';
RESET role;
SELECT is((SELECT count(*)::int FROM public.golf_message_reactions
  WHERE message_id = '00000000-0000-0000-0000-000000908301'
    AND user_id = '00000000-0000-0000-0000-000000908101'), 0,
  'a member can remove their own reaction');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000908104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_message_reactions
  WHERE message_id = '00000000-0000-0000-0000-000000908301'), 0,
  'an outsider cannot read the group reactions');
SELECT throws_ok($$INSERT INTO public.golf_message_reactions (message_id,user_id,emoji)
  VALUES ('00000000-0000-0000-0000-000000908301','00000000-0000-0000-0000-000000908104','👍')$$,
  '42501', NULL, 'an outsider cannot react to a group message');
RESET role;
SELECT ok(NOT has_table_privilege('anon', 'public.golf_message_reactions', 'SELECT')
  AND NOT has_function_privilege('anon', 'public.golf_conversation_has_me(uuid)', 'EXECUTE'),
  'anonymous callers cannot read reactions or invoke the membership helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename = 'golf_message_reactions'),
  'reactions are published for realtime updates');
SELECT * FROM finish();
ROLLBACK;
