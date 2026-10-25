-- A vote's updated_at is the database clock, not the voter's device
-- (20261025020050_golf_message_responses_updated_at.sql, held, recommended). The trigger exists on INSERT and UPDATE,
-- runs public.touch_updated_at(), and replaces a client-sent time on both. WRITTEN, NOT RUN where it was authored (no
-- Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(4);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000928101', 'touch-player@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
  ('00000000-0000-0000-0000-000000928201', '00000000-0000-0000-0000-000000928101', true, 'Touch group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
  ('00000000-0000-0000-0000-000000928201', '00000000-0000-0000-0000-000000928101');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000928301', '00000000-0000-0000-0000-000000928201', '00000000-0000-0000-0000-000000928101',
   'Poll: Van time?', 'poll',
   '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgname = 'golf_message_responses_touch'
    AND tgrelid = 'public.golf_message_responses'::regclass
    AND tgfoid = 'public.touch_updated_at()'::regprocedure
    AND NOT tgisinternal), 'the touch trigger runs touch_updated_at() on votes');
-- tgtype bits: 1 row, 2 before, 4 insert, 16 update.
SELECT is((SELECT tgtype & (1 | 2 | 4 | 8 | 16) FROM pg_trigger
  WHERE tgname = 'golf_message_responses_touch' AND tgrelid = 'public.golf_message_responses'::regclass)::int,
  1 | 2 | 4 | 16, 'it fires before each inserted and updated row, not on delete');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000928101","role":"authenticated"}';
INSERT INTO public.golf_message_responses (message_id, user_id, choice, updated_at)
  VALUES ('00000000-0000-0000-0000-000000928301', '00000000-0000-0000-0000-000000928101', 'o1', '2020-01-01T00:00:00Z');
SELECT is((SELECT updated_at FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000928301'), now(), 'an insert keeps the database time, not the client''s');
UPDATE public.golf_message_responses SET choice = 'o2', updated_at = '2020-01-01T00:00:00Z'
  WHERE message_id = '00000000-0000-0000-0000-000000928301';
SELECT is((SELECT updated_at FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000928301'), now(), 'an update keeps the database time, not the client''s');
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
