-- Closed means closed, and only members vote (20261025020100_golf_poll_vote_guard.sql, held, OQ-68). A vote on an open
-- poll lives; a vote, a change or a take-back on a closed or ended poll is refused; a choice the poll does not offer is
-- refused; a vote on a message that is not a poll passes the trigger; a former member cannot take back their vote on a
-- closed or an open poll, even with a DELETE that reads no column (S-10); a member's take-back lives; the function is
-- definer with a pinned path and no EXECUTE for app roles; a hard delete under service role cascades. WRITTEN, NOT RUN
-- where it was authored (no Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(17);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000926101', 'guard-coach@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000926102', 'guard-player@example.test', 'authenticated'),
  ('00000000-0000-0000-0000-000000926103', 'guard-leaver@example.test', 'authenticated');
INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
  ('00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101', true, 'Guard group');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
  ('00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101'),
  ('00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926102'),
  ('00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926103');
-- 301 open single, 302 closed, 303 past its end, 304 open multi, 305 a text message.
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000926301', '00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101',
    'Poll: Van time?', 'poll',
    '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}'),
  ('00000000-0000-0000-0000-000000926302', '00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101',
    'Poll: Dinner?', 'poll',
    '{"v":1,"question":"Dinner?","options":[{"id":"o1","label":"Tacos"},{"id":"o2","label":"Pizza"}],"multi":false,"closes_at":null,"closed_at":"2026-10-20T12:00:00Z"}'),
  ('00000000-0000-0000-0000-000000926303', '00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101',
    'Poll: Range?', 'poll',
    '{"v":1,"question":"Range?","options":[{"id":"o1","label":"Yes"},{"id":"o2","label":"No"}],"multi":false,"closes_at":"2020-01-01T00:00:00Z","closed_at":null}'),
  ('00000000-0000-0000-0000-000000926304', '00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101',
    'Poll: Which days?', 'poll',
    '{"v":1,"question":"Which days?","options":[{"id":"o1","label":"Mon"},{"id":"o2","label":"Tue"},{"id":"o3","label":"Wed"}],"multi":true,"closes_at":null,"closed_at":null}'),
  ('00000000-0000-0000-0000-000000926305', '00000000-0000-0000-0000-000000926201', '00000000-0000-0000-0000-000000926101',
    'See you at 7', 'text', NULL);
-- Votes already in before the poll closed (written without a JWT role, which the guard lets through).
INSERT INTO public.golf_message_responses (message_id, user_id, choice) VALUES
  ('00000000-0000-0000-0000-000000926302', '00000000-0000-0000-0000-000000926102', 'o1'),
  ('00000000-0000-0000-0000-000000926302', '00000000-0000-0000-0000-000000926103', 'o2');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000926102","role":"authenticated"}';
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000926301', '00000000-0000-0000-0000-000000926102', 'o1')$$,
  'a member votes on an open poll');
SELECT throws_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000926303', '00000000-0000-0000-0000-000000926102', 'o1')$$,
  'P0001', 'This poll is closed', 'a vote on a poll past its end is refused');
SELECT throws_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000926302', '00000000-0000-0000-0000-000000926101', 'o1')$$,
  'P0001', 'This poll is closed', 'a new vote on a closed poll is refused');
SELECT throws_ok($$UPDATE public.golf_message_responses SET choice = 'o2'
  WHERE message_id = '00000000-0000-0000-0000-000000926302' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'P0001', 'This poll is closed', 'changing a vote on a closed poll is refused');
SELECT throws_ok($$DELETE FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000926302' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'P0001', 'This poll is closed', 'taking back a vote on a closed poll is refused');
SELECT throws_ok($$UPDATE public.golf_message_responses SET choice = 'o9'
  WHERE message_id = '00000000-0000-0000-0000-000000926301' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'P0001', 'That choice is not on this poll', 'an option the poll does not offer is refused');
SELECT throws_ok($$UPDATE public.golf_message_responses SET choice = 'o1,o2'
  WHERE message_id = '00000000-0000-0000-0000-000000926301' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'P0001', 'That choice is not on this poll', 'two choices on a single-answer poll are refused');
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000926304', '00000000-0000-0000-0000-000000926102', 'o1,o3')$$,
  'two choices on a multi-answer poll live');
SELECT throws_ok($$UPDATE public.golf_message_responses SET choice = 'o1,o1'
  WHERE message_id = '00000000-0000-0000-0000-000000926304' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'P0001', 'That choice is not on this poll', 'a repeated choice is refused');
SELECT lives_ok($$INSERT INTO public.golf_message_responses (message_id, user_id, choice)
  VALUES ('00000000-0000-0000-0000-000000926305', '00000000-0000-0000-0000-000000926102', 'thumbs')$$,
  'a response on a message that is not a poll passes the trigger');
RESET role;
RESET request.jwt.claims;

-- The leaver leaves; their vote on the closed poll is still there.
DELETE FROM public.golf_conversation_participants
  WHERE conversation_id = '00000000-0000-0000-0000-000000926201'
    AND user_id = '00000000-0000-0000-0000-000000926103';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000926103","role":"authenticated"}';
-- No WHERE: the DELETE policy (own row) admits it and the SELECT policy is not applied, so only the guard stops it.
SELECT throws_ok($$DELETE FROM public.golf_message_responses$$,
  '42501', 'Only people in this conversation can vote on its polls', 'a former member cannot take back their vote on a closed poll');
RESET role;
RESET request.jwt.claims;
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE user_id = '00000000-0000-0000-0000-000000926103'), 1, 'the former member''s vote on the closed poll stays');

-- Their old vote is now on the open poll instead.
DELETE FROM public.golf_message_responses WHERE user_id = '00000000-0000-0000-0000-000000926103';
INSERT INTO public.golf_message_responses (message_id, user_id, choice) VALUES
  ('00000000-0000-0000-0000-000000926301', '00000000-0000-0000-0000-000000926103', 'o2');
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000926103","role":"authenticated"}';
SELECT throws_ok($$DELETE FROM public.golf_message_responses$$,
  '42501', 'Only people in this conversation can vote on its polls', 'a former member cannot take back their vote on an open poll');
RESET role;
RESET request.jwt.claims;
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE user_id = '00000000-0000-0000-0000-000000926103'), 1, 'the former member''s vote on the open poll stays');

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000926102","role":"authenticated"}';
SELECT lives_ok($$DELETE FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000926301' AND user_id = '00000000-0000-0000-0000-000000926102'$$,
  'a member takes back their vote on an open poll');
RESET role;
RESET request.jwt.claims;

SELECT ok(EXISTS (SELECT 1 FROM pg_proc
  WHERE proname = 'golf_message_responses_poll_guard' AND pronamespace = 'public'::regnamespace
    AND prosecdef AND proconfig @> ARRAY['search_path=""'])
  AND NOT has_function_privilege('authenticated', 'public.golf_message_responses_poll_guard()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_message_responses_poll_guard()', 'EXECUTE'),
  'the guard is definer with an empty search_path, and app roles cannot execute it');

SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
DELETE FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-000000926302';
RESET request.jwt.claims;
SELECT is((SELECT count(*)::int FROM public.golf_message_responses
  WHERE message_id = '00000000-0000-0000-0000-000000926302'), 0, 'a hard delete of a closed poll under service role cascades its votes');

SELECT * FROM finish();
ROLLBACK;
