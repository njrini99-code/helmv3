-- pgTAP contract for 20261110090100_golf_messages_insert_guard.sql (security review 2026-11-10, item A3).
--
-- The exploits, all as B, a plain member of conversation X, on INSERT (20261107090100 guards UPDATE only):
--   * send a message dated years ahead, so the conversation comes back for everyone who hid it and sorts as its newest
--     message for good; send one dated in the past, or with no date at all (NULL sorts first under ORDER BY ... DESC);
--   * send kind = 'system', a notice that reads as the app speaking;
--   * send a reply that quotes a message from another conversation, one B is in or one B is not.
-- After the migration the date is the server's (the row is stored, with now()), and the other two are refused with 42501.
-- What the app sends must still work exactly as before: a plain send with or without a client id, a send with
-- attachments, a poll, a reply to a message in the same conversation (deleted or not), an edit. The service role and the
-- table owner are not held to any of it (the demo seed back-dates its messages).
--
-- Before the migration 11 of the 25 fail (run that way on the local stack, 2026-11-10): the structure check, the three
-- stored dates, the nothing-ahead check, the system message and its count, the three replies and the reply count.
--
-- Ids use the 0000...0a3xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(25);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a31a1', 'a3-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a31b1', 'a3-b@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a31c1', 'a3-c@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a31a1', 'a3-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000a31b1', 'a3-b@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000a31c1', 'a3-c@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  -- X: A and B. W: A and B, a second chat. Y: C alone.
  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', false, 'X'),
    ('00000000-0000-0000-0000-0000000a32d1', '00000000-0000-0000-0000-0000000a31a1', false, 'W'),
    ('00000000-0000-0000-0000-0000000a32b1', '00000000-0000-0000-0000-0000000a31c1', false, 'Y')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1'),
    ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1'),
    ('00000000-0000-0000-0000-0000000a32d1', '00000000-0000-0000-0000-0000000a31a1'),
    ('00000000-0000-0000-0000-0000000a32d1', '00000000-0000-0000-0000-0000000a31b1'),
    ('00000000-0000-0000-0000-0000000a32b1', '00000000-0000-0000-0000-0000000a31c1')
  ON CONFLICT DO NOTHING;
  -- a1: A in X. a2: A in X, soft-deleted. w1: A in W. c1: C in Y.
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, is_deleted, created_at) VALUES
    ('00000000-0000-0000-0000-0000000a33a1', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', 'A one',     false, '2026-11-01 10:00:00+00'),
    ('00000000-0000-0000-0000-0000000a33a2', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', '',          true,  '2026-11-01 10:01:00+00'),
    ('00000000-0000-0000-0000-0000000a33d1', '00000000-0000-0000-0000-0000000a32d1', '00000000-0000-0000-0000-0000000a31a1', 'A in W',    false, '2026-11-01 10:02:00+00'),
    ('00000000-0000-0000-0000-0000000a33c1', '00000000-0000-0000-0000-0000000a32b1', '00000000-0000-0000-0000-0000000a31c1', 'C private', false, '2026-11-01 10:03:00+00')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.golf_messages'::regclass AND t.tgname = 'golf_messages_insert_guard'
      AND NOT t.tgisinternal
      AND (t.tgtype & 2) = 2   -- BEFORE
      AND (t.tgtype & 4) = 4   -- INSERT
      AND (t.tgtype & 16) = 0  -- not UPDATE
      AND (t.tgtype & 1) = 1   -- FOR EACH ROW
  ),
  'golf_messages_insert_guard is a BEFORE INSERT row trigger on golf_messages'
);

-- ---------------------------------------------------------------------------
-- What the app sends, as B
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a31b1", "role": "authenticated"}';

-- sendMessage: no id, no created_at, no kind.
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'plain send', false)$$,
  'a plain send');
SELECT is(
  (SELECT created_at FROM public.golf_messages
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a32a1' AND content = 'plain send'),
  now(), 'and it is dated now(), as the column default dates it');
-- sendMessage with a client id, and sendGolfMessageWithAttachments with a reply.
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000a33b1', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'client id send', false);
    INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, has_attachments, reply_to_id)
      VALUES ('00000000-0000-0000-0000-0000000a33b2', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', '', false, true, '00000000-0000-0000-0000-0000000a33a1')$$,
  'a send with a client id, and a send with attachments that replies to a message in the same conversation');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, reply_to_id)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'reply to a deleted one', false, '00000000-0000-0000-0000-0000000a33a2')$$,
  'a reply to a deleted message in the same conversation (the app allows it)');
-- sendGolfPoll.
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, kind, payload)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'Poll: Van?', false, 'poll',
      '{"v":1,"question":"Van?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}')$$,
  'a poll');

-- ---------------------------------------------------------------------------
-- The date is the server's
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, created_at) VALUES
      ('00000000-0000-0000-0000-0000000a33f1', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'from the future', false, '2099-01-01 00:00:00+00'),
      ('00000000-0000-0000-0000-0000000a33f2', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'from the past',   false, '2020-01-01 00:00:00+00'),
      ('00000000-0000-0000-0000-0000000a33f3', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'no date',         false, NULL)$$,
  'a send that names its own created_at is not refused (a wrong device clock must never cost a message)');
SELECT is(
  (SELECT created_at FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a33f1'),
  now(), 'a message dated 2099 is stored as now()');
SELECT is(
  (SELECT created_at FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a33f2'),
  now(), 'a message dated 2020 is stored as now()');
SELECT is(
  (SELECT created_at FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a33f3'),
  now(), 'a message with a NULL date is stored as now()');
SELECT ok(
  (SELECT count(*) = 0 FROM public.golf_messages
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a32a1' AND (created_at IS NULL OR created_at > now())),
  'nothing in X is dated ahead of the server or undated, so nothing sorts as its newest message for good');

-- ---------------------------------------------------------------------------
-- A system notice is not a client's to send
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, kind, payload)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'Coach removed A from the team', false, 'system', '{"v":1}')$$,
  '42501', 'A system message cannot be sent from a client session',
  'B cannot send kind = system');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a32a1' AND kind = 'system'),
  0, 'and X holds no system message');

-- ---------------------------------------------------------------------------
-- A reply quotes its own conversation
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, reply_to_id)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'quoting W in X', false, '00000000-0000-0000-0000-0000000a33d1')$$,
  '42501', 'A reply must quote a message in the same conversation',
  'B cannot reply in X to a message from W, another conversation B is in');
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, reply_to_id)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'quoting Y in X', false, '00000000-0000-0000-0000-0000000a33c1')$$,
  '42501', 'A reply must quote a message in the same conversation',
  'B cannot reply in X to a message from Y, a conversation B is not in');
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read, reply_to_id)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31b1', 'quoting nothing', false, '00000000-0000-0000-0000-0000000a33ff')$$,
  '42501', 'A reply must quote a message in the same conversation',
  'nor to a message that does not exist');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a32a1' AND reply_to_id IS NOT NULL),
  2, 'X holds the two same-conversation replies and no other');

-- ---------------------------------------------------------------------------
-- Unchanged around it
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read)
    VALUES ('00000000-0000-0000-0000-0000000a32b1', '00000000-0000-0000-0000-0000000a31b1', 'into Y', false)$$,
  '42501', NULL, 'B still cannot send into Y, a conversation B is not in');
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read)
    VALUES ('00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', 'as A', false)$$,
  '42501', NULL, 'B still cannot send as A');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET content = 'client id send (edited)', edited_at = now()
    WHERE id = '00000000-0000-0000-0000-0000000a33b1' AND sender_id = '00000000-0000-0000-0000-0000000a31b1'$$,
  'an edit is untouched: the guard is on INSERT only');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The service role and the owner are not held to it
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
-- scripts/seed-demo-team-ops.ts back-dates its messages.
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, created_at)
    VALUES ('00000000-0000-0000-0000-0000000a33e1', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', 'seeded, back-dated', true, '2026-10-01 08:00:00+00')$$,
  'the service role inserts a back-dated message');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload)
    VALUES ('00000000-0000-0000-0000-0000000a33e2', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', 'A joined', 'system', '{"v":1}')$$,
  'and a system message');
RESET ROLE;

SELECT is(
  (SELECT created_at FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a33e1'),
  '2026-10-01 08:00:00+00'::timestamptz, 'the service role''s date is kept');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at)
    VALUES ('00000000-0000-0000-0000-0000000a33e3', '00000000-0000-0000-0000-0000000a32a1', '00000000-0000-0000-0000-0000000a31a1', 'owner backfill', '2026-09-01 08:00:00+00')$$,
  'the table owner inserts a back-dated message');
SELECT is(
  (SELECT created_at FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a33e3'),
  '2026-09-01 08:00:00+00'::timestamptz, 'and its date is kept');

SELECT * FROM finish();
ROLLBACK;
