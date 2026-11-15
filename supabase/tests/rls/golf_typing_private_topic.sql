-- pgTAP contract for 20261107090300_golf_typing_private_topic.sql (Messages v2 package M, priority privacy fix).
--
-- Typing moves from the public topic golf-conversation:<id> to the private topic golf-typing:<id>. Realtime evaluates the
-- policies on realtime.messages with realtime.topic() set to the channel; the topic check is public.golf_typing_topic_allowed.
-- This suite proves the check (member yes, non-member no, malformed no) and the policy wiring. It does not INSERT into
-- realtime.messages (a partitioned Realtime table). The two-client Realtime check in the migration header is still required.
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying.
--
-- Ids use the 0000...0f4xxx range. X: A and B. Y: C alone.

BEGIN;
\ir _helpers.sql

SELECT plan(13);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f41a1', 'f4-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f41b1', 'f4-b@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f41c1', 'f4-c@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f41a1', 'f4-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f41b1', 'f4-b@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f41c1', 'f4-c@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f42a1', '00000000-0000-0000-0000-0000000f41a1', false, 'X'),
    ('00000000-0000-0000-0000-0000000f42b1', '00000000-0000-0000-0000-0000000f41c1', false, 'Y')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000f42a1', '00000000-0000-0000-0000-0000000f41a1'),
    ('00000000-0000-0000-0000-0000000f42a1', '00000000-0000-0000-0000-0000000f41b1'),
    ('00000000-0000-0000-0000-0000000f42b1', '00000000-0000-0000-0000-0000000f41c1')
  ON CONFLICT DO NOTHING;
END $$;

-- Structure ------------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.golf_typing_topic_allowed(text)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_typing_topic_allowed(text)', 'execute'),
  'the topic check is callable by authenticated and not by anon (definer + revoke)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND roles = '{authenticated}'
      AND ((policyname = 'golf_typing_receive' AND cmd = 'SELECT')
        OR (policyname = 'golf_typing_send' AND cmd = 'INSERT'))),
  2, 'one receive (SELECT) and one send (INSERT) policy, both for authenticated only');
SELECT ok(
  (SELECT bool_and(coalesce(qual, with_check) LIKE '%golf_typing_topic_allowed%'
                   AND coalesce(qual, with_check) LIKE '%broadcast%')
     FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname IN ('golf_typing_receive', 'golf_typing_send')),
  'both policies gate on the topic check and on the broadcast extension'
);

-- A member of X --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f41b1", "role": "authenticated"}';
SELECT is(public.golf_typing_topic_allowed('golf-typing:00000000-0000-0000-0000-0000000f42a1'), true,
  'a member may use the typing topic of their conversation');
SELECT is(public.golf_typing_topic_allowed(upper('golf-typing:00000000-0000-0000-0000-0000000f42a1')), false,
  'the prefix is case-sensitive (golf-typing: only)');
SELECT is(public.golf_typing_topic_allowed('golf-typing:' || upper('00000000-0000-0000-0000-0000000f42a1')), true,
  'an upper-case uuid is the same conversation');
SELECT is(public.golf_typing_topic_allowed('golf-typing:00000000-0000-0000-0000-0000000f42b1'), false,
  'a member of X may not use the typing topic of Y');
SELECT is(public.golf_typing_topic_allowed('golf-conversation:00000000-0000-0000-0000-0000000f42a1'), false,
  'the old public topic family is not authorised by this check');
SELECT is(public.golf_typing_topic_allowed('golf-typing:not-a-uuid'), false, 'a malformed id is refused');
SELECT is(public.golf_typing_topic_allowed('golf-typing:00000000-0000-0000-0000-0000000f42a1:extra'), false,
  'trailing text after the id is refused');
SELECT is(public.golf_typing_topic_allowed(NULL), false, 'no topic is refused');
RESET ROLE;

-- A non-member -----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f41c1", "role": "authenticated"}';
SELECT is(public.golf_typing_topic_allowed('golf-typing:00000000-0000-0000-0000-0000000f42a1'), false,
  'a non-member is refused the typing topic of X');
RESET ROLE;

-- anon ----------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.golf_typing_topic_allowed('golf-typing:00000000-0000-0000-0000-0000000f42a1')$$,
  '42501', NULL, 'anon cannot even ask');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
