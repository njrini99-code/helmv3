-- pgTAP contract for 20261110090500_golf_team_channel_backfill.sql (owner decision 2026-11-10: the existing teams get
-- their channel, everyone on the team is put in it, and people who already left are taken out).
--
-- The migration runs helm_private.golf_team_channel_backfill() once; this file runs the same function on a fixture
-- shaped like production: a team with a staff and no channel, a team whose channel is missing people and still holds
-- people who left, a coach's group that still holds someone who left, a team with no coach. It must add and remove
-- exactly the expected rows, leave one-to-one conversations alone, write no message, and do nothing the second time.
--
-- The function is run once before the fixture is written, so whatever the stack already holds is settled and the
-- counts below are the fixture's alone.
--
-- Before the migration the file stops at that first call: the function does not exist (run that way on the local
-- stack, 2026-11-10). After it all 17 pass.
--
-- Ids use the 0000...0a7xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(17);

CREATE FUNCTION public.a7_channel(p_team uuid) RETURNS uuid
LANGUAGE sql AS $f$
  SELECT id FROM public.golf_conversations
  WHERE team_id = p_team AND is_team_channel ORDER BY created_at, id LIMIT 1;
$f$;
CREATE FUNCTION public.a7_size(p_conversation uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants WHERE conversation_id = p_conversation;
$f$;

-- Settle whatever the stack already holds.
DO $$
BEGIN
  PERFORM * FROM helm_private.golf_team_channel_backfill();
END $$;

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  -- Coaches C1 (team One), C2 and C3 (team Two). Z coached team Two once and has no row on it now.
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a7c01', 'a7-coach1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a7c02', 'a7-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a7c03', 'a7-coach3@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a7c09', 'a7-z@helm.test',      'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b01', 'a7-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b02', 'a7-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b03', 'a7-p3@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b05', 'a7-p5@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b06', 'a7-p6@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b07', 'a7-p7@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b08', 'a7-p8@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a7b09', 'a7-p9@helm.test',     'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a7c01', 'a7-coach1@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a7c02', 'a7-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a7c03', 'a7-coach3@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a7c09', 'a7-z@helm.test',      'coach'),
    ('00000000-0000-0000-0000-0000000a7b01', 'a7-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b02', 'a7-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b03', 'a7-p3@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b05', 'a7-p5@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b06', 'a7-p6@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b07', 'a7-p7@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b08', 'a7-p8@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a7b09', 'a7-p9@helm.test',     'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a7101', 'A7 Org One',   'college'),
    ('00000000-0000-0000-0000-0000000a7102', 'A7 Org Two',   'college'),
    ('00000000-0000-0000-0000-0000000a7103', 'A7 Org Three', 'college');
  -- One: a staff and a roster, no channel. Two: a channel that is out of date. Three: no coach.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a7201', 'A7 One',   'A7TEAM01', '00000000-0000-0000-0000-0000000a7101'),
    ('00000000-0000-0000-0000-0000000a7202', 'A7 Two',   'A7TEAM02', '00000000-0000-0000-0000-0000000a7102'),
    ('00000000-0000-0000-0000-0000000a7203', 'A7 Three', 'A7TEAM03', '00000000-0000-0000-0000-0000000a7103');

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a7301', '00000000-0000-0000-0000-0000000a7c01', '00000000-0000-0000-0000-0000000a7101'),
    ('00000000-0000-0000-0000-0000000a7302', '00000000-0000-0000-0000-0000000a7c02', '00000000-0000-0000-0000-0000000a7102'),
    ('00000000-0000-0000-0000-0000000a7303', '00000000-0000-0000-0000-0000000a7c03', '00000000-0000-0000-0000-0000000a7102'),
    ('00000000-0000-0000-0000-0000000a7309', '00000000-0000-0000-0000-0000000a7c09', '00000000-0000-0000-0000-0000000a7102')
  ON CONFLICT DO NOTHING;
  -- P4 has no account.
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a7401', '00000000-0000-0000-0000-0000000a7b01', 'Pone',   'Active'),
    ('00000000-0000-0000-0000-0000000a7402', '00000000-0000-0000-0000-0000000a7b02', 'Ptwo',   'Active'),
    ('00000000-0000-0000-0000-0000000a7403', '00000000-0000-0000-0000-0000000a7b03', 'Pthree', 'Inactive'),
    ('00000000-0000-0000-0000-0000000a7404', NULL,                                   'Pfour',  'Noaccount'),
    ('00000000-0000-0000-0000-0000000a7405', '00000000-0000-0000-0000-0000000a7b05', 'Pfive',  'Inchannel'),
    ('00000000-0000-0000-0000-0000000a7406', '00000000-0000-0000-0000-0000000a7b06', 'Psix',   'Missing'),
    ('00000000-0000-0000-0000-0000000a7407', '00000000-0000-0000-0000-0000000a7b07', 'Pseven', 'Left'),
    ('00000000-0000-0000-0000-0000000a7408', '00000000-0000-0000-0000-0000000a7b08', 'Peight', 'Nocoach'),
    ('00000000-0000-0000-0000-0000000a7409', '00000000-0000-0000-0000-0000000a7b09', 'Pnine',  'Left')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, is_primary) VALUES
    ('00000000-0000-0000-0000-0000000a7201', '00000000-0000-0000-0000-0000000a7301', true),
    ('00000000-0000-0000-0000-0000000a7202', '00000000-0000-0000-0000-0000000a7302', true),
    ('00000000-0000-0000-0000-0000000a7202', '00000000-0000-0000-0000-0000000a7303', false);
  INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
    ('00000000-0000-0000-0000-0000000a7401', '00000000-0000-0000-0000-0000000a7201', 'active'),
    ('00000000-0000-0000-0000-0000000a7402', '00000000-0000-0000-0000-0000000a7201', 'active'),
    ('00000000-0000-0000-0000-0000000a7403', '00000000-0000-0000-0000-0000000a7201', 'inactive'),
    ('00000000-0000-0000-0000-0000000a7404', '00000000-0000-0000-0000-0000000a7201', 'active'),
    ('00000000-0000-0000-0000-0000000a7405', '00000000-0000-0000-0000-0000000a7202', 'active'),
    ('00000000-0000-0000-0000-0000000a7406', '00000000-0000-0000-0000-0000000a7202', 'active'),
    ('00000000-0000-0000-0000-0000000a7407', '00000000-0000-0000-0000-0000000a7202', 'inactive'),
    ('00000000-0000-0000-0000-0000000a7408', '00000000-0000-0000-0000-0000000a7203', 'active'),
    ('00000000-0000-0000-0000-0000000a7409', '00000000-0000-0000-0000-0000000a7203', 'removed');

  -- 7500 Two's channel: C2 and P5 belong; P6 and C3 are missing; P7 (inactive) and Z (no row) left the team.
  -- 7501 C2's group on Two: C2, P5, and P7 who left. 7502 one-to-one, C2 and P7 (team set, neither flag).
  -- 7503 a group on Three, which has no coach: P8, and P9 who was removed. 7504 a group with no team.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7c02', '00000000-0000-0000-0000-0000000a7202', true,  true,  'Two, made by hand'),
    ('00000000-0000-0000-0000-0000000a7501', '00000000-0000-0000-0000-0000000a7c02', '00000000-0000-0000-0000-0000000a7202', true,  false, 'Travel squad'),
    ('00000000-0000-0000-0000-0000000a7502', '00000000-0000-0000-0000-0000000a7c02', '00000000-0000-0000-0000-0000000a7202', false, false, NULL),
    ('00000000-0000-0000-0000-0000000a7503', '00000000-0000-0000-0000-0000000a7b08', '00000000-0000-0000-0000-0000000a7203', true,  false, 'Players'),
    ('00000000-0000-0000-0000-0000000a7504', '00000000-0000-0000-0000-0000000a7c02', NULL,                                   true,  false, 'No team');
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7c02'),
    ('00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7b05'),
    ('00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7b07'),
    ('00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7c09'),
    ('00000000-0000-0000-0000-0000000a7501', '00000000-0000-0000-0000-0000000a7c02'),
    ('00000000-0000-0000-0000-0000000a7501', '00000000-0000-0000-0000-0000000a7b05'),
    ('00000000-0000-0000-0000-0000000a7501', '00000000-0000-0000-0000-0000000a7b07'),
    ('00000000-0000-0000-0000-0000000a7502', '00000000-0000-0000-0000-0000000a7c02'),
    ('00000000-0000-0000-0000-0000000a7502', '00000000-0000-0000-0000-0000000a7b07'),
    ('00000000-0000-0000-0000-0000000a7503', '00000000-0000-0000-0000-0000000a7b08'),
    ('00000000-0000-0000-0000-0000000a7503', '00000000-0000-0000-0000-0000000a7b09'),
    ('00000000-0000-0000-0000-0000000a7504', '00000000-0000-0000-0000-0000000a7c02'),
    ('00000000-0000-0000-0000-0000000a7504', '00000000-0000-0000-0000-0000000a7b07');
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content) VALUES
    ('00000000-0000-0000-0000-0000000a7600', '00000000-0000-0000-0000-0000000a7500', '00000000-0000-0000-0000-0000000a7b07', 'posted before leaving')
  ON CONFLICT DO NOTHING;
END $$;
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE a7_before AS SELECT count(*)::int AS messages FROM public.golf_messages;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private' AND p.proname = 'golf_team_channel_backfill'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'golf_team_channel_backfill is SECURITY DEFINER with an empty search_path, and neither anon nor authenticated may execute it');

-- ---------------------------------------------------------------------------
-- The first run
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT channels_created || ' created, ' || rows_added || ' added, ' || rows_removed || ' removed'
     FROM helm_private.golf_team_channel_backfill()),
  '1 created, 5 added, 4 removed',
  'the first run creates team One''s channel, adds five people and removes four rows');

SELECT is(
  (SELECT count(*)::int || ' | ' || min(title) FROM public.golf_conversations
    WHERE team_id = '00000000-0000-0000-0000-0000000a7201' AND is_team_channel),
  '1 | A7 One — Team Channel', 'team One has one channel, titled with its name');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = public.a7_channel('00000000-0000-0000-0000-0000000a7201')$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a7c01'::uuid), ('00000000-0000-0000-0000-0000000a7b01'::uuid),
           ('00000000-0000-0000-0000-0000000a7b02'::uuid)$$,
  'holding its coach and its two active players: not P3 (inactive), nobody for P4 (no account)');
SELECT is(public.a7_channel('00000000-0000-0000-0000-0000000a7202'), '00000000-0000-0000-0000-0000000a7500'::uuid,
  'team Two keeps the channel it had');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = '00000000-0000-0000-0000-0000000a7500'$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a7c02'::uuid), ('00000000-0000-0000-0000-0000000a7b05'::uuid),
           ('00000000-0000-0000-0000-0000000a7b06'::uuid), ('00000000-0000-0000-0000-0000000a7c03'::uuid)$$,
  'now holding everyone on the team (P6 and C3 added) and nobody who left (P7 and Z removed)');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = '00000000-0000-0000-0000-0000000a7501'$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a7c02'::uuid), ('00000000-0000-0000-0000-0000000a7b05'::uuid)$$,
  'the coach''s group loses P7 and gains nobody: the backfill fills channels, not groups');
SELECT is(public.a7_size('00000000-0000-0000-0000-0000000a7502'), 2,
  'the one-to-one conversation between the coach and P7 is untouched');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversations
    WHERE team_id = '00000000-0000-0000-0000-0000000a7203' AND is_team_channel),
  0, 'team Three, with no coach, gets no channel');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = '00000000-0000-0000-0000-0000000a7503'$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a7b08'::uuid)$$,
  'but its group still loses P9, who was removed from the team');
SELECT is(public.a7_size('00000000-0000-0000-0000-0000000a7504'), 2,
  'a group with no team is untouched');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages) - (SELECT messages FROM a7_before),
  0, 'no message was written, so there is nothing to notify anyone about');
SELECT is(
  (SELECT content FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000a7600'),
  'posted before leaving', 'and a removed person''s message stays');

-- ---------------------------------------------------------------------------
-- The end state the migration's VERIFY lines check
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.golf_teams t
    WHERE EXISTS (SELECT 1 FROM public.golf_team_coach_staff s JOIN public.golf_coaches gc ON gc.id = s.coach_id
                   WHERE s.team_id = t.id AND gc.user_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.golf_conversations c WHERE c.team_id = t.id AND c.is_team_channel))
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT m.team_id, gp.user_id FROM public.golf_team_members m JOIN public.golf_players gp ON gp.id = m.player_id
           WHERE m.status = 'active' AND gp.user_id IS NOT NULL
          UNION
          SELECT s.team_id, gc.user_id FROM public.golf_team_coach_staff s JOIN public.golf_coaches gc ON gc.id = s.coach_id
           WHERE gc.user_id IS NOT NULL) l
    JOIN public.golf_conversations c ON c.team_id = l.team_id AND c.is_team_channel
    WHERE NOT EXISTS (SELECT 1 FROM public.golf_conversation_participants cp
                       WHERE cp.conversation_id = c.id AND cp.user_id = l.user_id)),
  'every team with a coach has a channel, and nobody on a team is missing from its channel');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.golf_conversation_participants cp
    JOIN public.golf_conversations c ON c.id = cp.conversation_id
    WHERE c.team_id IS NOT NULL AND (c.is_team_channel OR c.is_team_chat)
      AND NOT public.golf_user_on_conversation_team(c.id, cp.user_id)),
  'and nobody in a team''s channel or team chats lacks a live link to the team');

-- ---------------------------------------------------------------------------
-- The second run does nothing
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT channels_created || ' created, ' || rows_added || ' added, ' || rows_removed || ' removed'
     FROM helm_private.golf_team_channel_backfill()),
  '0 created, 0 added, 0 removed', 'a second run creates, adds and removes nothing');

-- ---------------------------------------------------------------------------
-- Nobody can call it directly
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM helm_private.golf_team_channel_backfill()$$,
  '42501', NULL, 'an authenticated session cannot call golf_team_channel_backfill');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
