-- pgTAP contract for 20261110090000_golf_team_chat_self_join.sql (security review 2026-11-10, item A2).
--
-- The exploit, as P1, an active player on the coach's team who is NOT in the coach's group:
--   * read the group's id (golf_conversations_select_v2 shows every team-chat row to the whole team);
--   * INSERT their own participant row into it (branch 1 of golf_participants_insert_v2 admitted any member of the team
--     into any team chat of that team) and read its history;
--   * do it again after the coach removes them;
--   * INSERT a conversation flagged is_team_channel = true.
-- Each must now fail with 42501. The team channel is not an exception: nobody adds themself to a conversation someone
-- else created. A member gets into the channel through its creator, the service role, or the roster trigger of
-- 20261110090200 (its own file: golf_team_channel_auto_join.sql).
--
-- What the app really does must still work, in the app's own statement order: a coach creates a group and adds its
-- players in one statement (createGolfTeamBroadcast), adds a teammate later and removes one (addGolfGroupMember /
-- removeGolfGroupMember), a coach and a player each start a direct conversation (createConversation: self first, the
-- other person as a second statement), members send and read, a creator who left adds themself back, a coach may create
-- a team channel, and the service role (scripts/seed-demo-team-ops.ts) still creates and fills one.
--
-- Before the migration 13 of the 33 fail (run that way on the local stack, 2026-11-10): both structure checks, P1's
-- self-join into the group, the rejoin, the join into the channel, what P1 then reads (twice), the two channels a player
-- forges, a staffed coach's own join into the channel (and so the creator's add after it, a duplicate), and the two
-- counts of what was left behind.
-- "A member cannot turn their group into a channel" is held by 20261107090100 (column grants), not by this migration.
--
-- The roster is seeded before the channel exists, so this file reads the same with or without 20261110090200.
-- Ids use the 0000...0a2xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(33);

-- Written with triggers off: after 20261110090300 a staff row on a team with no channel creates one, and this fixture
-- makes the team's channel by hand, with the id the assertions name.
SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a2c01', 'a2-coach@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000a2c02', 'a2-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a2c03', 'a2-coach3@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a2b01', 'a2-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a2b02', 'a2-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a2b03', 'a2-x@helm.test',      'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a2c01', 'a2-coach@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000a2c02', 'a2-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a2c03', 'a2-coach3@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a2b01', 'a2-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a2b02', 'a2-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a2b03', 'a2-x@helm.test',      'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a2101', 'A2 Org',   'college'),
    ('00000000-0000-0000-0000-0000000a2102', 'A2 Other', 'college'),
    ('00000000-0000-0000-0000-0000000a2103', 'A2 Third', 'college'),
    ('00000000-0000-0000-0000-0000000a2104', 'A2 Fourth', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a2201', 'A2 Team',  'A2TEAM01', '00000000-0000-0000-0000-0000000a2101'),
    ('00000000-0000-0000-0000-0000000a2202', 'A2 Other', 'A2TEAM02', '00000000-0000-0000-0000-0000000a2102'),
    -- Two more teams C coaches, with no channel: a team has one channel at most (20261110090300), so the two
    -- "may create a channel" assertions below each need a team that has none.
    ('00000000-0000-0000-0000-0000000a2203', 'A2 Third',  'A2TEAM03', '00000000-0000-0000-0000-0000000a2103'),
    ('00000000-0000-0000-0000-0000000a2204', 'A2 Fourth', 'A2TEAM04', '00000000-0000-0000-0000-0000000a2104')
  ON CONFLICT DO NOTHING;

  -- C and C3 coach the team (C creates its conversations); C2 coaches the other team.
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a2301', '00000000-0000-0000-0000-0000000a2c01', '00000000-0000-0000-0000-0000000a2101'),
    ('00000000-0000-0000-0000-0000000a2302', '00000000-0000-0000-0000-0000000a2c02', '00000000-0000-0000-0000-0000000a2102'),
    ('00000000-0000-0000-0000-0000000a2303', '00000000-0000-0000-0000-0000000a2c03', '00000000-0000-0000-0000-0000000a2101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2301'),
    ('00000000-0000-0000-0000-0000000a2202', '00000000-0000-0000-0000-0000000a2302'),
    ('00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2303'),
    ('00000000-0000-0000-0000-0000000a2203', '00000000-0000-0000-0000-0000000a2301'),
    ('00000000-0000-0000-0000-0000000a2204', '00000000-0000-0000-0000-0000000a2301')
  ON CONFLICT DO NOTHING;

  -- P1 and P2 are active on the team; X is active on the other team.
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a2401', '00000000-0000-0000-0000-0000000a2b01', 'Pone', 'Player'),
    ('00000000-0000-0000-0000-0000000a2402', '00000000-0000-0000-0000-0000000a2b02', 'Ptwo', 'Player'),
    ('00000000-0000-0000-0000-0000000a2403', '00000000-0000-0000-0000-0000000a2b03', 'Ex',   'Other')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2401', 'active'),
    ('00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2402', 'active'),
    ('00000000-0000-0000-0000-0000000a2202', '00000000-0000-0000-0000-0000000a2403', 'active')
  ON CONFLICT DO NOTHING;

  -- The team channel as the seed script leaves it: created for the coach, with the coach and P2 in it. P1 is not.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c01', '00000000-0000-0000-0000-0000000a2201', true, true, 'Team Channel')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c01'),
    ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2b02')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content) VALUES
    ('00000000-0000-0000-0000-0000000a2600', '00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c01', 'channel history')
  ON CONFLICT DO NOTHING;
END $$;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversation_participants'
      AND policyname = 'golf_participants_insert_v2'
      AND position('golf_conversation_on_my_team' IN with_check) = 0
      AND position('golf_conversation_created_by_me' IN with_check) > 0
      AND position('golf_conversation_has_other_participant' IN with_check) > 0
      AND position('golf_user_in_conversation_team_audience' IN with_check) > 0
      AND position('golf_user_on_conversation_team' IN with_check) > 0
  ),
  'golf_participants_insert_v2 no longer admits a team member by membership alone, and keeps its creator branches'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversations'
      AND policyname = 'golf_conversations_insert_team_channel_coach'
      AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT'
      AND position('is_team_channel' IN with_check) > 0
      AND position('is_golf_team_coach' IN with_check) > 0
  ),
  'a restrictive INSERT policy ties is_team_channel to a coach of the team'
);

-- ---------------------------------------------------------------------------
-- The coach's flows, as C
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2c01", "role": "authenticated"}';

-- createGolfTeamBroadcast: the conversation, then everyone in one statement, then the first message.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2201', 'P2 only', true, '00000000-0000-0000-0000-0000000a2c01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2c01'),
      ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2b02');
    INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000a2601', '00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2c01', 'private note for P2', false)$$,
  'a coach creates a group for one player (conversation, both participants in one statement) and sends in it'
);
-- createConversation: self first, the other person as a second statement.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a2502', '00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2c01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a2502', '00000000-0000-0000-0000-0000000a2c01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a2502', '00000000-0000-0000-0000-0000000a2b01')$$,
  'a coach starts a direct conversation with a player (self, then the player)'
);
-- A second group, to add a member to and remove one from after it exists.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2201', 'Travel squad', true, '00000000-0000-0000-0000-0000000a2c01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2c01'),
      ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2b02');
    INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000a2603', '00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2c01', 'van leaves at 7', false)$$,
  'a coach creates a second group'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2b01')$$,
  'addGolfGroupMember: the creator adds a teammate to the settled group'
);
SELECT lives_ok(
  $$DELETE FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a2503' AND user_id = '00000000-0000-0000-0000-0000000a2b01'$$,
  'removeGolfGroupMember: the creator removes that teammate again'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, is_team_channel, created_by)
    VALUES ('00000000-0000-0000-0000-0000000a2504', '00000000-0000-0000-0000-0000000a2203', 'Coach channel', true, true, '00000000-0000-0000-0000-0000000a2c01')$$,
  'a coach of a team that has no channel may create a conversation flagged as its team channel'
);
-- Leave group, then come back: branch 1 still lets a creator add themself.
SELECT lives_ok(
  $$DELETE FROM public.golf_conversation_participants
      WHERE conversation_id = '00000000-0000-0000-0000-0000000a2503' AND user_id = '00000000-0000-0000-0000-0000000a2c01';
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2c01')$$,
  'a creator who left their own group can still add themself back'
);

-- ---------------------------------------------------------------------------
-- The attack, as P1: on the team, not in the group
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2b01", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_conversations
    WHERE id IN ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2503')),
  2, 'P1 can read the ids of the team''s groups (the select policy is unchanged, which is why the insert must refuse)');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2b01')$$,
  '42501', NULL, 'P1 cannot add themself to the coach''s group');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000a2501'),
  0, 'and P1 reads none of its messages');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2503', '00000000-0000-0000-0000-0000000a2b01')$$,
  '42501', NULL, 'P1 cannot rejoin the group the coach removed them from');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2b01')$$,
  '42501', NULL, 'P1 cannot add themself to the team channel either (the roster trigger or its creator does that)');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages
    WHERE conversation_id IN ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2503')),
  0, 'and P1 reads nothing in the channel or either group');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2c03')$$,
  '42501', NULL, 'nor can P1 add someone else to a group they did not create');

SELECT throws_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, is_team_channel, created_by)
    VALUES ('00000000-0000-0000-0000-0000000a2506', '00000000-0000-0000-0000-0000000a2201', 'Team Channel', true, true, '00000000-0000-0000-0000-0000000a2b01')$$,
  '42501', NULL, 'a player cannot create a conversation flagged as the team channel');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversations (id, title, is_team_channel, created_by)
    VALUES ('00000000-0000-0000-0000-0000000a2508', 'Team Channel', true, '00000000-0000-0000-0000-0000000a2b01')$$,
  '42501', NULL, 'nor one with no team');

-- What a player really does still works: a direct conversation with the coach, and sending in it.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a2505', '00000000-0000-0000-0000-0000000a2201', '00000000-0000-0000-0000-0000000a2b01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a2505', '00000000-0000-0000-0000-0000000a2b01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a2505', '00000000-0000-0000-0000-0000000a2c01')$$,
  'a player starts a direct conversation with their coach (self, then the coach)'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read)
    VALUES ('00000000-0000-0000-0000-0000000a2505', '00000000-0000-0000-0000-0000000a2b01', 'Coach, can I ride with you?', false)$$,
  'and sends a message in it'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content, read)
    VALUES ('00000000-0000-0000-0000-0000000a2502', '00000000-0000-0000-0000-0000000a2b01', 'Got it', false)$$,
  'and in the direct conversation the coach started'
);

-- ---------------------------------------------------------------------------
-- Other teams stay out (as before); a staffed coach who did not create the channel is added by its creator
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2b03", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2b03')$$,
  '42501', NULL, 'a player on another team cannot add themself to this team''s channel');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2b03')$$,
  '42501', NULL, 'nor to its groups');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2c02", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c02')$$,
  '42501', NULL, 'a coach of another team cannot add themself to this team''s channel');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, is_team_channel, created_by)
    VALUES ('00000000-0000-0000-0000-0000000a2506', '00000000-0000-0000-0000-0000000a2201', 'Team Channel', true, true, '00000000-0000-0000-0000-0000000a2c02')$$,
  '42501', NULL, 'nor create a channel for it');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2c03", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c03')$$,
  '42501', NULL, 'a coach staffed on the team does not add themself to a channel another coach created');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2c03')$$,
  'the channel''s creator adds that coach (branch 3)');

-- ---------------------------------------------------------------------------
-- A member of a group reads it, and cannot turn it into a channel
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a2b02", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000a2501'),
  1, 'P2, whom the coach added, reads the group''s message');
SELECT throws_ok(
  $$UPDATE public.golf_conversations SET is_team_channel = true WHERE id = '00000000-0000-0000-0000-0000000a2501'$$,
  '42501', NULL, 'P2 cannot flag the group as a channel (20261107090100: is_team_channel is not client-writable)');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000a2500'),
  1, 'P2, who was put in the team channel, reads it');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.golf_conversations
    WHERE id IN ('00000000-0000-0000-0000-0000000a2506', '00000000-0000-0000-0000-0000000a2508')),
  0, 'no forged channel row exists');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE user_id = '00000000-0000-0000-0000-0000000a2b01'
      AND conversation_id IN ('00000000-0000-0000-0000-0000000a2500', '00000000-0000-0000-0000-0000000a2501', '00000000-0000-0000-0000-0000000a2503')),
  0, 'and P1 is in none of the three conversations they tried to join');

-- ---------------------------------------------------------------------------
-- The service role (scripts/seed-demo-team-ops.ts) is not held to either policy
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, is_team_channel, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a2507', '00000000-0000-0000-0000-0000000a2204', 'Seeded channel', true, true, '00000000-0000-0000-0000-0000000a2c01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-0000000a2507', '00000000-0000-0000-0000-0000000a2c01'),
      ('00000000-0000-0000-0000-0000000a2507', '00000000-0000-0000-0000-0000000a2b01'),
      ('00000000-0000-0000-0000-0000000a2507', '00000000-0000-0000-0000-0000000a2b02')$$,
  'the service role still creates a team channel and fills it'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
