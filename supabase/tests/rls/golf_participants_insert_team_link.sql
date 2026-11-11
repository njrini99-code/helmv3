-- pgTAP contract for 20261110090600_golf_participants_insert_team_link.sql.
--
-- 20261110090400 removes a person who leaves a team from its channel and its group chats. This file is the other
-- half: someone who CREATED one of those conversations is still its creator after leaving, and
-- golf_participants_insert_v2 lets a creator add their own row (branch 1) or a team member (branch 3). So a former
-- coach could put themself back into a group of players with one insert. The fixture is that state: C1 created the
-- team's channel and a group and is no longer on the staff; PX created a players' group and is no longer active.
--
-- Before the migration 7 of the 12 fail (run that way on the local stack, 2026-11-10): the two structure checks, the
-- four inserts that should be refused (they succeed), and the count that shows nobody got back in. Everything a
-- person still on the team does passes before and after.
--
-- Ids use the 0000...0a8xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

CREATE FUNCTION public.a8_in(p_conversation uuid, p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = p_conversation AND user_id = p_user;
$f$;

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a8c01', 'a8-coach1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a8c02', 'a8-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a8b01', 'a8-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a8b02', 'a8-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a8b03', 'a8-p3@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a8b09', 'a8-px@helm.test',     'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a8c01', 'a8-coach1@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a8c02', 'a8-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a8b01', 'a8-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a8b02', 'a8-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a8b03', 'a8-p3@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a8b09', 'a8-px@helm.test',     'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a8101', 'A8 Org', 'college');
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a8201', 'A8 Team', 'A8TEAM01', '00000000-0000-0000-0000-0000000a8101');

  -- C1 has a coach profile and NO staff row any more. C2 coaches the team.
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a8301', '00000000-0000-0000-0000-0000000a8c01', '00000000-0000-0000-0000-0000000a8101'),
    ('00000000-0000-0000-0000-0000000a8302', '00000000-0000-0000-0000-0000000a8c02', '00000000-0000-0000-0000-0000000a8101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, is_primary) VALUES
    ('00000000-0000-0000-0000-0000000a8201', '00000000-0000-0000-0000-0000000a8302', true);
  -- P1, P2, P3 are active. PX is inactive.
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a8401', '00000000-0000-0000-0000-0000000a8b01', 'Pone',   'Active'),
    ('00000000-0000-0000-0000-0000000a8402', '00000000-0000-0000-0000-0000000a8b02', 'Ptwo',   'Active'),
    ('00000000-0000-0000-0000-0000000a8403', '00000000-0000-0000-0000-0000000a8b03', 'Pthree', 'Active'),
    ('00000000-0000-0000-0000-0000000a8409', '00000000-0000-0000-0000-0000000a8b09', 'Pex',    'Inactive')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
    ('00000000-0000-0000-0000-0000000a8401', '00000000-0000-0000-0000-0000000a8201', 'active'),
    ('00000000-0000-0000-0000-0000000a8402', '00000000-0000-0000-0000-0000000a8201', 'active'),
    ('00000000-0000-0000-0000-0000000a8403', '00000000-0000-0000-0000-0000000a8201', 'active'),
    ('00000000-0000-0000-0000-0000000a8409', '00000000-0000-0000-0000-0000000a8201', 'inactive');

  -- 8500 the channel and 8501 a group, both created by C1, who has already been removed from them.
  -- 8502 a players' group created by PX, who has been removed from it. 8503 C2's group. 8504 no team, created by C1.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8c01', '00000000-0000-0000-0000-0000000a8201', true,  true,  'A8 Team — Team Channel'),
    ('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8c01', '00000000-0000-0000-0000-0000000a8201', true,  false, 'Travel squad'),
    ('00000000-0000-0000-0000-0000000a8502', '00000000-0000-0000-0000-0000000a8b09', '00000000-0000-0000-0000-0000000a8201', true,  false, 'Players'),
    ('00000000-0000-0000-0000-0000000a8503', '00000000-0000-0000-0000-0000000a8c02', '00000000-0000-0000-0000-0000000a8201', true,  false, 'Short game'),
    ('00000000-0000-0000-0000-0000000a8504', '00000000-0000-0000-0000-0000000a8c01', NULL,                                   false, false, NULL);
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8c02'),
    ('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8b01'),
    ('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8b02'),
    ('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8b01'),
    ('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8b02'),
    ('00000000-0000-0000-0000-0000000a8502', '00000000-0000-0000-0000-0000000a8b01'),
    ('00000000-0000-0000-0000-0000000a8503', '00000000-0000-0000-0000-0000000a8c02'),
    ('00000000-0000-0000-0000-0000000a8503', '00000000-0000-0000-0000-0000000a8b01');
END $$;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversation_participants'
      AND policyname = 'golf_participants_insert_team_link'
      AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT'
      AND position('golf_conversation_team_link_ok' IN with_check) > 0),
  'a restrictive INSERT policy ties a team conversation''s new member rows to a caller who is on the team');
SELECT ok(
  (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'golf_conversation_team_link_ok'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')),
  'golf_conversation_team_link_ok is SECURITY DEFINER with an empty search_path; authenticated may execute it, anon may not');

-- ---------------------------------------------------------------------------
-- A creator who is no longer on the team
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a8c01", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8c01')$$,
  '42501', NULL, 'a former coach cannot put themself back in a group they created');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8c01')$$,
  '42501', NULL, 'nor back in the team channel they created');
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8b03')$$,
  '42501', NULL, 'nor add a current player of the team to that group');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a8b09", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8502', '00000000-0000-0000-0000-0000000a8b09')$$,
  '42501', NULL, 'a former player cannot put themself back in a group they created');
RESET ROLE;
SELECT is(
  public.a8_in('00000000-0000-0000-0000-0000000a8500', '00000000-0000-0000-0000-0000000a8c01')
  + public.a8_in('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8c01')
  + public.a8_in('00000000-0000-0000-0000-0000000a8501', '00000000-0000-0000-0000-0000000a8b03')
  + public.a8_in('00000000-0000-0000-0000-0000000a8502', '00000000-0000-0000-0000-0000000a8b09'),
  0, 'none of those four rows exists');

-- ---------------------------------------------------------------------------
-- Everything a person still on the team does is unchanged
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a8c02", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8503', '00000000-0000-0000-0000-0000000a8b02')$$,
  'addGolfGroupMember: a coach on the staff adds a player to a group they created');
SELECT lives_ok(
  $$DELETE FROM public.golf_conversation_participants
      WHERE conversation_id = '00000000-0000-0000-0000-0000000a8503' AND user_id = '00000000-0000-0000-0000-0000000a8c02';
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a8503', '00000000-0000-0000-0000-0000000a8c02')$$,
  'that coach leaves their own group and comes back');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a8505', '00000000-0000-0000-0000-0000000a8201', 'Broadcast', true, '00000000-0000-0000-0000-0000000a8c02');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-0000000a8505', '00000000-0000-0000-0000-0000000a8c02'),
      ('00000000-0000-0000-0000-0000000a8505', '00000000-0000-0000-0000-0000000a8b01'),
      ('00000000-0000-0000-0000-0000000a8505', '00000000-0000-0000-0000-0000000a8b02')$$,
  'createGolfTeamBroadcast: a new team chat and everyone in it, one statement');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a8b01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, created_by)
      VALUES ('00000000-0000-0000-0000-0000000a8506', '00000000-0000-0000-0000-0000000a8201', '00000000-0000-0000-0000-0000000a8b01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a8506', '00000000-0000-0000-0000-0000000a8b01');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000a8506', '00000000-0000-0000-0000-0000000a8c02')$$,
  'createConversation: a player starts a one-to-one with the coach (self, then the other)');
-- Not a team chat: this file does not reach it.
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a8c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000a8504', '00000000-0000-0000-0000-0000000a8c01')$$,
  'a conversation with no team is not a team chat: its creator still adds their own row');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
