-- pgTAP contract for 20261107090100_golf_conversations_messages_column_grants.sql (Messages v2 package M, priority security fix).
--
-- The exploits, all as user B (a plain member of conversation X; A created X):
--   * rewrite golf_conversations.created_by / team_id / is_team_chat / is_team_channel / created_at (take over a chat, or
--     point it at another team and add that team's minors);
--   * move their own message into a conversation they are not in, back-date it, change its kind or sender;
--   * create a conversation "owned" by someone else.
-- Each must now fail with 42501. The writes the app really makes (updated_at, title; edit, soft delete, poll close,
-- has_attachments both directly and through the INVOKER trigger, read) must still work, and a hard delete of a message that
-- has a reply must still work (ON DELETE SET NULL runs as the table owner and passes the guard).
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying.
--
-- Ids use the 0000...0f2xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(36);

CREATE FUNCTION public.f2_rows_affected(p_sql text) RETURNS integer
LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f21a1', 'f2-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f21b1', 'f2-b@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f21c1', 'f2-c@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f21a1', 'f2-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f21b1', 'f2-b@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f21c1', 'f2-c@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  -- X: created by A, members A and B. Y: created by C, C alone.
  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21a1', false, 'X'),
    ('00000000-0000-0000-0000-0000000f22b1', '00000000-0000-0000-0000-0000000f21c1', false, 'Y'),
    ('00000000-0000-0000-0000-0000000f22d1', '00000000-0000-0000-0000-0000000f21a1', false, 'W: A and B, a second chat')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21a1'),
    ('00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1'),
    ('00000000-0000-0000-0000-0000000f22b1', '00000000-0000-0000-0000-0000000f21c1'),
    ('00000000-0000-0000-0000-0000000f22d1', '00000000-0000-0000-0000-0000000f21a1'),
    ('00000000-0000-0000-0000-0000000f22d1', '00000000-0000-0000-0000-0000000f21b1')
  ON CONFLICT DO NOTHING;
  -- b1..b5: B's messages in X. a1: A's message in X. a2: A's reply to b5 (for the ON DELETE SET NULL case).
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at) VALUES
    ('00000000-0000-0000-0000-0000000f23b1', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'B one',   '2026-11-01 10:00:00+00'),
    ('00000000-0000-0000-0000-0000000f23b2', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'B two',   '2026-11-01 10:01:00+00'),
    ('00000000-0000-0000-0000-0000000f23b3', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'B three', '2026-11-01 10:02:00+00'),
    ('00000000-0000-0000-0000-0000000f23b4', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'B four',  '2026-11-01 10:03:00+00'),
    ('00000000-0000-0000-0000-0000000f23b5', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'B five',  '2026-11-01 10:04:00+00'),
    ('00000000-0000-0000-0000-0000000f23a1', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21a1', 'A one',   '2026-11-01 10:05:00+00'),
    ('00000000-0000-0000-0000-0000000f23c1', '00000000-0000-0000-0000-0000000f22b1', '00000000-0000-0000-0000-0000000f21c1', 'C private', '2026-11-01 10:06:00+00')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at, reply_to_id) VALUES
    ('00000000-0000-0000-0000-0000000f23a2', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21a1', 'A replies', '2026-11-01 10:07:00+00', '00000000-0000-0000-0000-0000000f23b5')
  ON CONFLICT DO NOTHING;
  -- A poll by B (open), for the closeGolfPoll write.
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload, created_at) VALUES
    ('00000000-0000-0000-0000-0000000f23d1', '00000000-0000-0000-0000-0000000f22a1', '00000000-0000-0000-0000-0000000f21b1', 'Poll: Van?', 'poll',
     '{"v":1,"question":"Van?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}', '2026-11-01 10:08:00+00')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_conversations', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_conversations', 'updated_at', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'title', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'created_by', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'team_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_chat', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_channel', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversations', 'created_at', 'UPDATE'),
  'conversations: authenticated may update updated_at only (review 2026-11-07: no Golf code writes title)'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_messages', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_messages', 'content', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_messages', 'edited_at', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_messages', 'is_deleted', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_messages', 'payload', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'read', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_messages', 'has_attachments', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'conversation_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'sender_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'created_at', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'kind', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_messages', 'reply_to_id', 'UPDATE'),
  'messages: authenticated may update the six content columns only'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_conversations', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.golf_conversations', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.golf_messages', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.golf_messages', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.golf_messages', 'TRUNCATE'),
  'anon holds no privilege on conversations or messages'
);

-- ---------------------------------------------------------------------------
-- Conversation exploits, as B
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f21b1", "role": "authenticated"}';

SELECT throws_ok(
  $$UPDATE public.golf_conversations SET created_by = '00000000-0000-0000-0000-0000000f21b1'
    WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot make themselves the creator of X');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET team_id = gen_random_uuid() WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot re-point X at another team');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET is_team_chat = true WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot turn a conversation into a team chat');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET is_team_channel = true WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot turn a conversation into the team channel');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET created_at = '2020-01-01' WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot back-date a conversation');

SELECT lives_ok(
  $$UPDATE public.golf_conversations SET updated_at = '2026-11-02 12:00:00+00' WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  'B can still bump updated_at (every send does)');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET title = 'Renamed' WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', NULL, 'B cannot rename a conversation (no Golf code writes title)');

SELECT throws_ok(
  $$INSERT INTO public.golf_conversations (created_by, title) VALUES ('00000000-0000-0000-0000-0000000f21a1', 'forged owner')$$,
  '42501', NULL, 'B cannot create a conversation owned by someone else');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, created_by, title) VALUES ('00000000-0000-0000-0000-0000000f22c1', '00000000-0000-0000-0000-0000000f21b1', 'B own')$$,
  'B can still create a conversation as themselves');

-- ---------------------------------------------------------------------------
-- Message exploits, as B on B''s own message b1
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$UPDATE public.golf_messages SET conversation_id = '00000000-0000-0000-0000-0000000f22b1'
    WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot move their message into Y');
-- Moving into a conversation B IS in (W) is what the SELECT policy alone does not stop; Y is also refused because B cannot see it.
SELECT throws_ok(
  $$UPDATE public.golf_messages SET conversation_id = '00000000-0000-0000-0000-0000000f22d1'
    WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot move their message into W, another chat B is in (no row-level rule stops this without the grant)');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET created_at = '2020-01-01' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot back-date their message');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET sender_id = '00000000-0000-0000-0000-0000000f21a1' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot re-attribute their message to A');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET kind = 'event' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot change the kind of their message');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET reply_to_id = '00000000-0000-0000-0000-0000000f23a1' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot change which message theirs replies to');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET pinned_at = now() WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot pin their message');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET notify_anyway = true WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', NULL, 'B cannot set notify_anyway after sending');
SELECT is(
  public.f2_rows_affected($$UPDATE public.golf_messages SET content = 'hijack' WHERE id = '00000000-0000-0000-0000-0000000f23a1'$$),
  0, 'B updates 0 rows of A''s message (sender-only policy)');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000f22b1'),
  0, 'B reads nothing in Y');

-- ---------------------------------------------------------------------------
-- The writes the app makes still work, as B
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$UPDATE public.golf_messages SET content = 'B one (edited)', edited_at = '2026-11-02 12:00:00+00'
    WHERE id = '00000000-0000-0000-0000-0000000f23b1' AND sender_id = '00000000-0000-0000-0000-0000000f21b1'$$,
  'updateMessage: content + edited_at');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET is_deleted = true, content = ''
    WHERE id = '00000000-0000-0000-0000-0000000f23b2' AND sender_id = '00000000-0000-0000-0000-0000000f21b1'$$,
  'deleteMessage: is_deleted + content');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET payload = payload || '{"closed_at":"2026-11-02T12:00:00Z"}'::jsonb
    WHERE id = '00000000-0000-0000-0000-0000000f23d1' AND sender_id = '00000000-0000-0000-0000-0000000f21b1'$$,
  'closeGolfPoll: payload');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET has_attachments = false WHERE id = '00000000-0000-0000-0000-0000000f23b3'$$,
  'the attachment compensation write: has_attachments');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET read = true WHERE id = '00000000-0000-0000-0000-0000000f23b3'$$,
  '42501', NULL, 'read is not client-writable (only the definer RPC writes it)');
-- The INVOKER trigger update_message_has_attachments() updates has_attachments as the sender.
SELECT lives_ok(
  $$INSERT INTO public.golf_message_attachments (message_id, file_name, file_type, mime_type, file_size, storage_path)
    VALUES ('00000000-0000-0000-0000-0000000f23b4', 'range.jpg', 'image', 'image/jpeg', 1000, 'f2/x/range.jpg')$$,
  'attaching a file as the sender: the invoker trigger flips has_attachments with column grants only');
SELECT is(
  (SELECT has_attachments FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000f23b4'),
  true, 'and the flag flipped');
-- Hard delete of a message that has a reply: ON DELETE SET NULL updates reply_to_id as the owner.
SELECT lives_ok(
  $$DELETE FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000f23b5'$$,
  'B can hard-delete a message that has a reply (the guard does not trip on ON DELETE SET NULL)');
RESET ROLE;

SELECT is(
  (SELECT reply_to_id FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000f23a2'),
  NULL::uuid, 'and the reply''s reply_to_id was set to NULL');
SELECT is(
  (SELECT created_by FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000f22a1'),
  '00000000-0000-0000-0000-0000000f21a1'::uuid, 'X is still created by A');

-- ---------------------------------------------------------------------------
-- The guards on their own: widen the grants inside this transaction (rolled back); the triggers still refuse
-- ---------------------------------------------------------------------------
GRANT UPDATE ON public.golf_conversations, public.golf_messages TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f21b1", "role": "authenticated"}';
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET created_by = '00000000-0000-0000-0000-0000000f21b1' WHERE id = '00000000-0000-0000-0000-0000000f22a1'$$,
  '42501', 'A conversation''s owner, team and kind cannot be changed',
  'with the grant widened, the conversation guard still refuses a created_by rewrite');
SELECT throws_ok(
  $$UPDATE public.golf_messages SET conversation_id = '00000000-0000-0000-0000-0000000f22b1' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  '42501', 'A message cannot be moved, re-attributed, back-dated or re-typed',
  'with the grant widened, the message guard still refuses a move');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET content = 'still editable' WHERE id = '00000000-0000-0000-0000-0000000f23b1'$$,
  'and the guard lets a normal edit through');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT 1 FROM public.golf_messages$$, '42501', NULL, 'anon cannot read messages');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
