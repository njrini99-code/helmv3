-- pgTAP for the held 20261025010000_golf_conversation_read_marks.sql (Clubhouse Seen by, P-1 plan 11, changelog P-01).
-- Fixtures: a team with one staff coach, a second coach who is a member but not on staff, and three players; a team
-- chat with all of them; a direct thread coach and player one; an outsider. Seeding follows
-- golf_holes_shots_policy_consolidation.sql.

BEGIN;

SELECT plan(18);

DO $$
DECLARE
  v_org    uuid := '00000000-0000-0000-0000-00000000e101';
  u_coach  uuid := '00000000-0000-0000-0000-00000000e111';
  u_coach2 uuid := '00000000-0000-0000-0000-00000000e112';
  u_p1     uuid := '00000000-0000-0000-0000-00000000e113';
  u_p2     uuid := '00000000-0000-0000-0000-00000000e114';
  u_p3     uuid := '00000000-0000-0000-0000-00000000e115';
  u_out    uuid := '00000000-0000-0000-0000-00000000e116';
  c_coach  uuid := '00000000-0000-0000-0000-00000000e121';
  c_coach2 uuid := '00000000-0000-0000-0000-00000000e122';
  p_1      uuid := '00000000-0000-0000-0000-00000000e131';
  p_2      uuid := '00000000-0000-0000-0000-00000000e132';
  p_3      uuid := '00000000-0000-0000-0000-00000000e133';
  t_x      uuid := '00000000-0000-0000-0000-00000000e141';
  conv_t   uuid := '00000000-0000-0000-0000-00000000e151';
  conv_d   uuid := '00000000-0000-0000-0000-00000000e152';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_coach, 'pgtap-rm-coach@helm.test', 'authenticated'), (u_coach2, 'pgtap-rm-coach2@helm.test', 'authenticated'),
    (u_p1, 'pgtap-rm-p1@helm.test', 'authenticated'), (u_p2, 'pgtap-rm-p2@helm.test', 'authenticated'),
    (u_p3, 'pgtap-rm-p3@helm.test', 'authenticated'), (u_out, 'pgtap-rm-out@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (u_coach, 'pgtap-rm-coach@helm.test', 'coach'), (u_coach2, 'pgtap-rm-coach2@helm.test', 'coach'),
    (u_p1, 'pgtap-rm-p1@helm.test', 'player'), (u_p2, 'pgtap-rm-p2@helm.test', 'player'),
    (u_p3, 'pgtap-rm-p3@helm.test', 'player'), (u_out, 'pgtap-rm-out@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES (v_org, 'pgtap-rm-org', 'college') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES (c_coach, u_coach, v_org), (c_coach2, u_coach2, v_org) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (p_1, u_p1), (p_2, u_p2), (p_3, u_p3) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES (t_x, 'pgtap-rm-team', 'PGRMX1', v_org, 'mens') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES (t_x, c_coach, 'head_coach', true) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversations (id, team_id, is_team_chat) VALUES (conv_t, t_x, true), (conv_d, t_x, false) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id, last_read_at) VALUES
    (conv_t, u_coach, now() - interval '2 days'), (conv_t, u_coach2, now() - interval '2 days'),
    (conv_t, u_p1, now() - interval '2 days'), (conv_t, u_p2, now() - interval '2 days'), (conv_t, u_p3, now() - interval '2 days'),
    (conv_d, u_coach, now() - interval '2 days'), (conv_d, u_p1, now() - interval '2 days')
  ON CONFLICT DO NOTHING;
  -- Messages at fixed times: the coach's in the team chat an hour ago, one 40 days old, one in the direct thread.
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at) VALUES
    ('00000000-0000-0000-0000-00000000e161', conv_t, u_coach, 'Bus at 6:15', now() - interval '1 hour'),
    ('00000000-0000-0000-0000-00000000e162', conv_t, u_coach, 'Old news', now() - interval '40 days'),
    ('00000000-0000-0000-0000-00000000e163', conv_d, u_coach, 'Running late?', now() - interval '1 hour')
  ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION pg_temp.as_user(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;
CREATE FUNCTION pg_temp.marks(p_conv text, p_user text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.golf_conversation_read_marks WHERE conversation_id = p_conv::uuid AND user_id = p_user::uuid AND NOT is_baseline;
$$;

-- 1. Reading past a new message from someone else writes one mark.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
UPDATE public.golf_conversation_participants SET last_read_at = now() - interval '30 minutes'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e113';
RESET ROLE;
SELECT is(pg_temp.marks('00000000-0000-0000-0000-00000000e151', '00000000-0000-0000-0000-00000000e113'), 1, 'reading past a new message writes one mark');

-- 2. An advance with no new message from someone else writes none.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
UPDATE public.golf_conversation_participants SET last_read_at = now() - interval '20 minutes'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e113';
RESET ROLE;
SELECT is(pg_temp.marks('00000000-0000-0000-0000-00000000e151', '00000000-0000-0000-0000-00000000e113'), 1, 'an advance that saw nothing new writes no mark');

-- 3. A mute-only update writes none.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
UPDATE public.golf_conversation_participants SET notification_level = 'muted'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e113';
RESET ROLE;
SELECT is(pg_temp.marks('00000000-0000-0000-0000-00000000e151', '00000000-0000-0000-0000-00000000e113'), 1, 'a mute-only update writes no mark');

-- 4. last_read_at moved backwards writes none.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
UPDATE public.golf_conversation_participants SET last_read_at = now() - interval '3 days'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e113';
RESET ROLE;
SELECT is(pg_temp.marks('00000000-0000-0000-0000-00000000e151', '00000000-0000-0000-0000-00000000e113'), 1, 'a backwards move writes no mark');

-- Player 2 reads the team chat and player 1 reads the direct thread, for the visibility cases.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e114');
UPDATE public.golf_conversation_participants SET last_read_at = now() - interval '10 minutes'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e114';
RESET ROLE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
UPDATE public.golf_conversation_participants SET last_read_at = now() - interval '5 minutes'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e152' AND user_id = '00000000-0000-0000-0000-00000000e113';
RESET ROLE;

-- 5 and 6. A player reads their own marks, and no teammate's in the team chat.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e113');
SELECT ok((SELECT count(*) FROM public.golf_conversation_read_marks WHERE user_id = '00000000-0000-0000-0000-00000000e113') >= 2, 'a player reads their own marks');
SELECT is((SELECT count(*)::int FROM public.golf_conversation_read_marks WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e114'), 0, 'a player reads no teammate''s marks in the team chat');
RESET ROLE;

-- 7. In a direct thread the other person's marks are readable (the coach reads player one's).
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e111');
SELECT is((SELECT count(*)::int FROM public.golf_conversation_read_marks WHERE conversation_id = '00000000-0000-0000-0000-00000000e152' AND user_id = '00000000-0000-0000-0000-00000000e113' AND NOT is_baseline), 1, 'the other person''s marks in a direct thread are readable');
-- 8. The staff coach reads every member's marks in the team chat.
SELECT is((SELECT count(DISTINCT user_id)::int FROM public.golf_conversation_read_marks WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND NOT is_baseline), 2, 'the staff coach reads every member''s marks in the team chat');
RESET ROLE;

-- 9. A coach who is a member but not on staff reads only their own.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e112');
SELECT is((SELECT count(*)::int FROM public.golf_conversation_read_marks WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id <> '00000000-0000-0000-0000-00000000e112'), 0, 'a member coach not on staff reads only their own');
RESET ROLE;

-- 10. The outsider reads nothing.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e116');
SELECT is((SELECT count(*)::int FROM public.golf_conversation_read_marks), 0, 'the outsider reads nothing');
-- 12. authenticated cannot insert a mark.
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_read_marks (conversation_id, user_id, read_at) VALUES ('00000000-0000-0000-0000-00000000e151', '00000000-0000-0000-0000-00000000e116', now())$$,
  '42501', NULL, 'authenticated cannot write a mark directly');
RESET ROLE;

-- 11. anon has no SELECT.
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT 1 FROM public.golf_conversation_read_marks$$, '42501', NULL, 'anon cannot read marks');
RESET ROLE;

-- 13. The reader: the first mark at or after created_at, the sender excluded.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e111');
SELECT is(
  (SELECT count(*)::int FROM public.golf_message_seen_times('00000000-0000-0000-0000-00000000e161') WHERE exact),
  2, 'seen times: the first mark after created_at for each member who saw it, never the sender');
-- 14. Nothing for a message older than 30 days.
SELECT is((SELECT count(*)::int FROM public.golf_message_seen_times('00000000-0000-0000-0000-00000000e162')), 0, 'no seen times for a message older than 30 days');
RESET ROLE;

-- 15. Leaving deletes the leaver's marks in that conversation only.
DELETE FROM public.golf_conversation_participants WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e114';
SELECT is((SELECT count(*)::int FROM public.golf_conversation_read_marks WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e114'), 0, 'leaving deletes your marks there');
SELECT ok((SELECT count(*) FROM public.golf_conversation_read_marks WHERE user_id = '00000000-0000-0000-0000-00000000e113') >= 1, 'and nobody else''s');

-- 16. The baseline insert run twice leaves one baseline per participant.
INSERT INTO public.golf_conversation_read_marks (conversation_id, user_id, read_at, is_baseline)
SELECT p.conversation_id, p.user_id, LEAST(p.last_read_at, now()), true FROM public.golf_conversation_participants p
WHERE p.last_read_at IS NOT NULL AND p.last_read_at >= now() - interval '30 days'
ON CONFLICT (conversation_id, user_id) WHERE is_baseline DO NOTHING;
INSERT INTO public.golf_conversation_read_marks (conversation_id, user_id, read_at, is_baseline)
SELECT p.conversation_id, p.user_id, LEAST(p.last_read_at, now()), true FROM public.golf_conversation_participants p
WHERE p.last_read_at IS NOT NULL AND p.last_read_at >= now() - interval '30 days'
ON CONFLICT (conversation_id, user_id) WHERE is_baseline DO NOTHING;
SELECT is((SELECT count(*)::int FROM (SELECT conversation_id, user_id FROM public.golf_conversation_read_marks WHERE is_baseline GROUP BY 1, 2 HAVING count(*) > 1) d), 0, 'one baseline per participant, however often the insert runs');

-- 17. A forged future last_read_at writes a mark at the database now(), never in the future.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000e115');
UPDATE public.golf_conversation_participants SET last_read_at = now() + interval '1 year'
  WHERE conversation_id = '00000000-0000-0000-0000-00000000e151' AND user_id = '00000000-0000-0000-0000-00000000e115';
RESET ROLE;
SELECT ok((SELECT max(read_at) FROM public.golf_conversation_read_marks WHERE user_id = '00000000-0000-0000-0000-00000000e115' AND NOT is_baseline) <= now(), 'a forged future read time is clamped to now()');

SELECT * FROM finish();
ROLLBACK;
