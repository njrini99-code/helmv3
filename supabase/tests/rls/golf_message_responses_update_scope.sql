-- Vote changes stay inside the voter's own conversations
-- (20261025020000_golf_message_responses_update_scope.sql). A member changes
-- their vote with the poll upsert; nobody can move their vote row onto a
-- message in a conversation they are not in; someone who has left the group
-- can no longer change their old vote. WRITTEN, NOT RUN where it was authored
-- (no Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(6);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000925101', 'scope-one@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000925102', 'scope-two@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000925103', 'scope-other@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
  ('00000000-0000-0000-0000-000000925201', '00000000-0000-0000-0000-000000925101', true, 'Scope group'),
  ('00000000-0000-0000-0000-000000925202', '00000000-0000-0000-0000-000000925103', true, 'Other group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
  ('00000000-0000-0000-0000-000000925201', '00000000-0000-0000-0000-000000925101'),
  ('00000000-0000-0000-0000-000000925201', '00000000-0000-0000-0000-000000925102'),
  ('00000000-0000-0000-0000-000000925202', '00000000-0000-0000-0000-000000925103');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000925301', '00000000-0000-0000-0000-000000925201',
    '00000000-0000-0000-0000-000000925101', 'Poll: Van time?', 'poll',
    '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}]}'),
  ('00000000-0000-0000-0000-000000925302', '00000000-0000-0000-0000-000000925202',
    '00000000-0000-0000-0000-000000925103', 'Poll: Dinner?', 'poll',
    '{"v":1,"question":"Dinner?","options":[{"id":"o1","label":"Tacos"},{"id":"o2","label":"Pizza"}]}');
INSERT INTO public.golf_message_responses (message_id, user_id, choice) VALUES
  ('00000000-0000-0000-0000-000000925301', '00000000-0000-0000-0000-000000925101', 'o1'),
  ('00000000-0000-0000-0000-000000925301', '00000000-0000-0000-0000-000000925102', 'o1');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000925101","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000925301', '00000000-0000-0000-0000-000000925101', 'o2')
  ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice$$,
  'a member can change their vote with the poll upsert');
SELECT throws_ok($$UPDATE public.golf_message_responses
  SET message_id = '00000000-0000-0000-0000-000000925302'
  WHERE message_id = '00000000-0000-0000-0000-000000925301'
    AND user_id = '00000000-0000-0000-0000-000000925101'$$,
  '42501', NULL, 'a member cannot move their vote onto a poll in a conversation they are not in');
RESET role;

DELETE FROM public.golf_conversation_participants
  WHERE conversation_id = '00000000-0000-0000-0000-000000925201'
    AND user_id = '00000000-0000-0000-0000-000000925102';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000925102","role":"authenticated"}';
UPDATE public.golf_message_responses SET choice = 'o2'
  WHERE message_id = '00000000-0000-0000-0000-000000925301'
    AND user_id = '00000000-0000-0000-0000-000000925102';
RESET role;
SELECT is((SELECT choice FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000925301'
    AND user_id = '00000000-0000-0000-0000-000000925102'), 'o1',
  'someone who left the group cannot change their old vote');

SELECT is((SELECT count(*)::int FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_message_responses'), 4,
  'still exactly four policies on votes');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_update'
    AND qual LIKE '%golf_conversation_has_me%'), 'the update policy checks membership on the old row');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_message_responses'
    AND policyname = 'golf_message_responses_update'
    AND with_check LIKE '%golf_conversation_has_me%'), 'the update policy checks membership on the new row');
SELECT * FROM finish();
ROLLBACK;
