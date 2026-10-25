-- A poll stays what it was when it was sent (20261025020200_golf_poll_payload_freeze.sql, held, OQ-68). Inserts must
-- match payload v1; after sending, only closed_at may be set, once; the app's real soft delete (deleteMessage: is_deleted
-- true, content '', and for a poll payload NULL) lives with and without the payload clear; a delete that also rewrites a
-- label and an undelete are refused; a deleted poll stays frozen; a text message edit is untouched. WRITTEN, NOT RUN
-- where it was authored (no Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(15);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000927101', 'freeze-coach@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000927102', 'freeze-player@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101', true, 'Freeze group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101'),
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927102');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind) VALUES
  ('00000000-0000-0000-0000-000000927305', '00000000-0000-0000-0000-000000927201',
    '00000000-0000-0000-0000-000000927101', 'See you at 7', 'text');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000927101","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000927301', '00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101',
   'Poll: Van time?', 'poll',
   '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}')$$,
  'a poll in payload v1 shape is sent');
SELECT throws_ok($$INSERT INTO public.golf_messages (conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101', 'Poll: One?', 'poll',
   '{"v":1,"question":"One?","options":[{"id":"o1","label":"Only"}],"multi":false,"closes_at":null,"closed_at":null}')$$,
  'P0001', 'Not a poll this app can draw', 'a poll with one choice is refused');
SELECT throws_ok($$INSERT INTO public.golf_messages (conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101', 'Poll: Order?', 'poll',
   '{"v":1,"question":"Order?","options":[{"id":"o2","label":"B"},{"id":"o1","label":"A"}],"multi":false,"closes_at":null,"closed_at":null}')$$,
  'P0001', 'Not a poll this app can draw', 'choice ids out of order are refused');
SELECT throws_ok($$INSERT INTO public.golf_messages (conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101', 'Poll: Done?', 'poll',
   '{"v":1,"question":"Done?","options":[{"id":"o1","label":"A"},{"id":"o2","label":"B"}],"multi":false,"closes_at":null,"closed_at":"2026-10-20T12:00:00Z"}')$$,
  'P0001', 'Not a poll this app can draw', 'a poll sent already closed is refused');

-- Two more polls for the delete paths.
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000927302', '00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101',
   'Poll: Dinner?', 'poll',
   '{"v":1,"question":"Dinner?","options":[{"id":"o1","label":"Tacos"},{"id":"o2","label":"Pizza"}],"multi":false,"closes_at":null,"closed_at":null}'),
  ('00000000-0000-0000-0000-000000927303', '00000000-0000-0000-0000-000000927201', '00000000-0000-0000-0000-000000927101',
   'Poll: Range?', 'poll',
   '{"v":1,"question":"Range?","options":[{"id":"o1","label":"Yes"},{"id":"o2","label":"No"}],"multi":false,"closes_at":null,"closed_at":null}');

SELECT lives_ok($$UPDATE public.golf_messages
  SET payload = payload || '{"closed_at":"2026-10-25T12:00:00Z"}'::jsonb
  WHERE id = '00000000-0000-0000-0000-000000927301'$$,
  'the sender closes the poll (closeGolfPoll)');
SELECT throws_ok($$UPDATE public.golf_messages
  SET payload = payload || '{"closed_at":"2026-10-26T12:00:00Z"}'::jsonb
  WHERE id = '00000000-0000-0000-0000-000000927301'$$,
  'P0001', 'A poll cannot be changed after it is sent', 'a second close to another time is refused');
SELECT throws_ok($$UPDATE public.golf_messages
  SET payload = payload || '{"closed_at":null}'::jsonb
  WHERE id = '00000000-0000-0000-0000-000000927301'$$,
  'P0001', 'A poll cannot be changed after it is sent', 'clearing closed_at (reopening) is refused');
SELECT throws_ok($$UPDATE public.golf_messages
  SET payload = jsonb_set(payload, '{options,0,label}', '"6:45"')
  WHERE id = '00000000-0000-0000-0000-000000927302'$$,
  'P0001', 'A poll cannot be changed after it is sent', 'changing a choice''s label is refused');
SELECT throws_ok($$UPDATE public.golf_messages SET content = 'Poll: Lunch?'
  WHERE id = '00000000-0000-0000-0000-000000927302'$$,
  'P0001', 'A poll cannot be changed after it is sent', 'changing the content is refused');

-- deleteMessage's own write: is_deleted true and content '' (and, for a golf poll, payload NULL).
SELECT lives_ok($$UPDATE public.golf_messages SET is_deleted = true, content = ''
  WHERE id = '00000000-0000-0000-0000-000000927301' AND sender_id = '00000000-0000-0000-0000-000000927101'$$,
  'the app''s soft delete lives (content cleared, payload kept)');
SELECT lives_ok($$UPDATE public.golf_messages SET is_deleted = true, content = '', payload = NULL
  WHERE id = '00000000-0000-0000-0000-000000927302' AND sender_id = '00000000-0000-0000-0000-000000927101'$$,
  'the app''s soft delete lives with the payload cleared');
SELECT throws_ok($$UPDATE public.golf_messages
  SET is_deleted = true, content = '', payload = jsonb_set(payload, '{options,0,label}', '"Maybe"')
  WHERE id = '00000000-0000-0000-0000-000000927303'$$,
  'P0001', 'A poll cannot be changed after it is sent', 'a delete that also rewrites a label is refused');
SELECT throws_ok($$UPDATE public.golf_messages SET is_deleted = false
  WHERE id = '00000000-0000-0000-0000-000000927301'$$,
  'P0001', 'A deleted poll cannot be changed', 'an undelete is refused');
SELECT throws_ok($$UPDATE public.golf_messages SET content = 'Poll: Back?'
  WHERE id = '00000000-0000-0000-0000-000000927302'$$,
  'P0001', 'A deleted poll cannot be changed', 'a deleted poll stays as it was deleted');
SELECT lives_ok($$UPDATE public.golf_messages SET content = 'See you at 7:15', edited_at = now()
  WHERE id = '00000000-0000-0000-0000-000000927305'$$,
  'a text message edit is untouched');
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
