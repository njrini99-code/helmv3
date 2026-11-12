-- pgTAP contract for 20261107090500_golf_search_messages.sql (Messages v2 package M, M7, optional).
--
-- Proves: the search is scoped by RLS to the caller's own conversations (never another conversation's messages, even when
-- its id is passed); deleted messages never match; a conversation the caller hid stays out until a newer message arrives;
-- %, _ and \ match literally; short or null queries return nothing; newest first; the limit is clamped; anon is refused.
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying.
--
-- Ids use the 0000...0f7xxx range. X: A and B. Y: C alone. W: A and B (B hid it).

BEGIN;
\ir _helpers.sql

SELECT plan(15);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f71a1', 'f7-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f71b1', 'f7-b@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f71c1', 'f7-c@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f71a1', 'f7-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f71b1', 'f7-b@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f71c1', 'f7-c@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71a1', false, 'X'),
    ('00000000-0000-0000-0000-0000000f72b1', '00000000-0000-0000-0000-0000000f71c1', false, 'Y'),
    ('00000000-0000-0000-0000-0000000f72d1', '00000000-0000-0000-0000-0000000f71a1', false, 'W')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id, hidden_at) VALUES
    ('00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71a1', NULL),
    ('00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71b1', NULL),
    ('00000000-0000-0000-0000-0000000f72b1', '00000000-0000-0000-0000-0000000f71c1', NULL),
    ('00000000-0000-0000-0000-0000000f72d1', '00000000-0000-0000-0000-0000000f71a1', NULL),
    ('00000000-0000-0000-0000-0000000f72d1', '00000000-0000-0000-0000-0000000f71b1', '2026-11-01 12:00:00+00')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at, is_deleted) VALUES
    ('00000000-0000-0000-0000-0000000f73a1', '00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71a1', 'Bus leaves at 6:15',   '2026-11-01 09:00:00+00', false),
    ('00000000-0000-0000-0000-0000000f73a2', '00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71a1', 'running late today',   '2026-11-01 09:10:00+00', true),
    ('00000000-0000-0000-0000-0000000f73a3', '00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71a1', 'Tee time 100%',        '2026-11-01 10:00:00+00', false),
    ('00000000-0000-0000-0000-0000000f73a4', '00000000-0000-0000-0000-0000000f72a1', '00000000-0000-0000-0000-0000000f71b1', 'tee time moved',       '2026-11-01 11:00:00+00', false),
    ('00000000-0000-0000-0000-0000000f73b1', '00000000-0000-0000-0000-0000000f72b1', '00000000-0000-0000-0000-0000000f71c1', 'Bus secret in Y',     '2026-11-01 09:30:00+00', false),
    ('00000000-0000-0000-0000-0000000f73d1', '00000000-0000-0000-0000-0000000f72d1', '00000000-0000-0000-0000-0000000f71a1', 'bus in W before hide', '2026-11-01 08:00:00+00', false)
  ON CONFLICT DO NOTHING;
END $$;

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_search_messages(text, uuid, integer)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_search_messages(text, uuid, integer)', 'execute')
  AND NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.golf_search_messages(text, uuid, integer)'::regprocedure),
  'the search is SECURITY INVOKER (RLS is the scope), callable by authenticated and not by anon');

-- As B (in X and W; W hidden) -------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f71b1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('bus', '00000000-0000-0000-0000-0000000f72a1')),
  1, 'B finds "bus" in X');
SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('late')),
  0, 'a deleted message never matches');
SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('bus') WHERE conversation_id = '00000000-0000-0000-0000-0000000f72b1'),
  0, 'B never gets a hit from Y, where B is not a member');
SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('bus', '00000000-0000-0000-0000-0000000f72b1')),
  0, 'passing Y''s id explicitly still returns nothing');
SELECT is((SELECT count(*)::int FROM public.golf_search_messages('b')), 0, 'one character returns nothing');
SELECT is((SELECT count(*)::int FROM public.golf_search_messages(NULL)), 0, 'a null query returns nothing');
SELECT is((SELECT count(*)::int FROM public.golf_search_messages('0%')), 1, 'a % in the query is matched literally');
SELECT is((SELECT count(*)::int FROM public.golf_search_messages('_e')), 0, 'a _ in the query is matched literally, not as any character');
SELECT is(
  (SELECT content FROM public.golf_search_messages('tee time') LIMIT 1),
  'tee time moved', 'newest first');
SELECT is((SELECT count(*)::int FROM public.golf_search_messages('tee time', NULL, 1)), 1, 'the limit is honoured');
SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('bus in W')),
  0, 'a conversation B hid stays out while nothing newer arrived');
RESET ROLE;

INSERT INTO public.golf_messages (conversation_id, sender_id, content, created_at)
  VALUES ('00000000-0000-0000-0000-0000000f72d1', '00000000-0000-0000-0000-0000000f71a1', 'anyone there?', '2026-11-02 08:00:00+00');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f71b1", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_search_messages('bus in W')),
  1, 'and it is searchable again once a newer message arrived');
RESET ROLE;

-- As C, who is only in Y -----------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f71c1", "role": "authenticated"}';
SELECT is(
  (SELECT array_agg(content) FROM public.golf_search_messages('bus')),
  ARRAY['Bus secret in Y'], 'C searching "bus" finds only Y''s message');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.golf_search_messages('bus')$$, '42501', NULL, 'anon cannot search');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
