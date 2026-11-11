-- pgTAP contract for 20261110090200_golf_team_channel_auto_join.sql (owner requirement 2026-11-10: a player who joins a
-- team is in its team channel).
--
-- The roster is written the way the app writes it: a player joins by code through the RPC golf_join_team_with_code
-- (teams.ts:430), a coach approves a request by inserting the row as themself (teams.ts:1356), a coach sets a player
-- active again (team-management.ts:336). Each must leave that player's user in the team's channel, and only there:
-- not for an inactive row, not for another team's channel, not for a team with no channel, not for a player with no
-- account. A coach put on the staff lands in the channel too. And the roster write must succeed even when the channel
-- insert cannot.
--
-- Before the migration 11 of the 29 fail (run that way on the local stack, 2026-11-10): the two structure checks and
-- every "is in the channel" line. The writes themselves, and every "is not in" line, pass before and after.
--
-- Ids use the 0000...0a4xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(29);

CREATE FUNCTION public.a4_in(p_conversation uuid, p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = p_conversation AND user_id = p_user;
$f$;

-- Written with triggers off, so the fixture is what it says: after 20261110090300 a staff row on a team with no channel
-- creates one, and the channels below are made by hand with ids the assertions name.
SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a4c01', 'a4-coach@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000a4c02', 'a4-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b01', 'a4-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b02', 'a4-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b03', 'a4-p3@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b05', 'a4-p5@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b06', 'a4-p6@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a4b07', 'a4-p7@helm.test',     'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a4c01', 'a4-coach@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000a4c02', 'a4-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a4b01', 'a4-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a4b02', 'a4-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a4b03', 'a4-p3@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a4b05', 'a4-p5@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a4b06', 'a4-p6@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a4b07', 'a4-p7@helm.test',     'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a4101', 'A4 Org',            'college'),
    ('00000000-0000-0000-0000-0000000a4102', 'A4 Other Org',      'college'),
    ('00000000-0000-0000-0000-0000000a4103', 'A4 No Channel Org', 'college');
  -- T has a channel, T2 has a channel, T3 has none.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a4201', 'A4 Team',       'A4TEAM01', '00000000-0000-0000-0000-0000000a4101'),
    ('00000000-0000-0000-0000-0000000a4202', 'A4 Other',      'A4TEAM02', '00000000-0000-0000-0000-0000000a4102'),
    ('00000000-0000-0000-0000-0000000a4203', 'A4 No Channel', 'A4TEAM03', '00000000-0000-0000-0000-0000000a4103');

  -- C coaches all three teams and created the channels. C2 is a coach with no staff row yet.
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a4301', '00000000-0000-0000-0000-0000000a4c01', '00000000-0000-0000-0000-0000000a4101'),
    ('00000000-0000-0000-0000-0000000a4302', '00000000-0000-0000-0000-0000000a4c02', '00000000-0000-0000-0000-0000000a4101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-0000000a4201', '00000000-0000-0000-0000-0000000a4301'),
    ('00000000-0000-0000-0000-0000000a4202', '00000000-0000-0000-0000-0000000a4301'),
    ('00000000-0000-0000-0000-0000000a4203', '00000000-0000-0000-0000-0000000a4301')
  ON CONFLICT DO NOTHING;

  -- Player profiles; none is on a team yet. P4 has no account.
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a4401', '00000000-0000-0000-0000-0000000a4b01', 'Pone',   'Approved'),
    ('00000000-0000-0000-0000-0000000a4402', '00000000-0000-0000-0000-0000000a4b02', 'Ptwo',   'Inactive'),
    ('00000000-0000-0000-0000-0000000a4403', '00000000-0000-0000-0000-0000000a4b03', 'Pthree', 'Other'),
    ('00000000-0000-0000-0000-0000000a4404', NULL,                                   'Pfour',  'Noaccount'),
    ('00000000-0000-0000-0000-0000000a4405', '00000000-0000-0000-0000-0000000a4b05', 'Pfive',  'Nochannel'),
    ('00000000-0000-0000-0000-0000000a4406', '00000000-0000-0000-0000-0000000a4b06', 'Psix',   'Unlucky'),
    ('00000000-0000-0000-0000-0000000a4407', '00000000-0000-0000-0000-0000000a4b07', 'Pseven', 'Bycode')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4c01', '00000000-0000-0000-0000-0000000a4201', true, true,  'Team Channel'),
    ('00000000-0000-0000-0000-0000000a4501', '00000000-0000-0000-0000-0000000a4c01', '00000000-0000-0000-0000-0000000a4202', true, true,  'Other Channel'),
    ('00000000-0000-0000-0000-0000000a4502', '00000000-0000-0000-0000-0000000a4c01', '00000000-0000-0000-0000-0000000a4201', true, false, 'Coach group, not a channel')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4c01'),
    ('00000000-0000-0000-0000-0000000a4501', '00000000-0000-0000-0000-0000000a4c01'),
    ('00000000-0000-0000-0000-0000000a4502', '00000000-0000-0000-0000-0000000a4c01')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content) VALUES
    ('00000000-0000-0000-0000-0000000a4600', '00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4c01', 'welcome to the team')
  ON CONFLICT DO NOTHING;
END $$;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 2 FROM pg_trigger
    WHERE NOT tgisinternal AND (tgtype & 2) = 0 AND (tgtype & 4) = 4
      AND ((tgrelid = 'public.golf_team_members'::regclass AND tgname = 'golf_team_members_join_team_channel' AND (tgtype & 16) = 16)
        OR (tgrelid = 'public.golf_team_coach_staff'::regclass AND tgname = 'golf_team_coach_staff_join_team_channel'))),
  'both AFTER triggers exist: roster (INSERT or UPDATE) and staff (INSERT)'
);
SELECT ok(
  (SELECT count(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private'
      AND p.proname IN ('golf_team_channel_join_member', 'golf_team_channel_join_staff')
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'both trigger functions are SECURITY DEFINER with an empty search_path, and neither anon nor authenticated may execute them'
);

-- ---------------------------------------------------------------------------
-- A coach approves a join request: the roster row is inserted as the coach (teams.ts:1356)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a4401', '00000000-0000-0000-0000-0000000a4201', 'active')$$,
  'a coach adds P1 to the roster as active, without holding EXECUTE on the trigger function');
RESET ROLE;
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b01'), 1,
  'P1 is in the team channel');
SELECT is(
  public.a4_in('00000000-0000-0000-0000-0000000a4501', '00000000-0000-0000-0000-0000000a4b01')
  + public.a4_in('00000000-0000-0000-0000-0000000a4502', '00000000-0000-0000-0000-0000000a4b01'),
  0, 'and in nothing else: not the other team''s channel, not the coach''s group on the same team');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000a4500'),
  1, 'P1 reads the channel');

-- ---------------------------------------------------------------------------
-- A player joins by code, through the RPC the app calls (teams.ts:430)
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4b07", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT * FROM public.golf_join_team_with_code('A4TEAM01')$$,
  'P7 joins the team with its code');
RESET ROLE;
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b07'), 1,
  'P7 is in the team channel');

-- ---------------------------------------------------------------------------
-- Inactive, then set active again (team-management.ts:336), as the coach
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a4402', '00000000-0000-0000-0000-0000000a4201', 'inactive')$$,
  'a roster row that is not active is written');
RESET ROLE;
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b02'), 0,
  'and P2, inactive, is not in the channel');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'active', updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000a4402' AND team_id = '00000000-0000-0000-0000-0000000a4201'$$,
  'the coach sets P2 active');
RESET ROLE;
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b02'), 1,
  'now P2 is in the channel');

-- Removed from the channel by its creator, then an unrelated roster edit that leaves the status active.
DELETE FROM public.golf_conversation_participants
  WHERE conversation_id = '00000000-0000-0000-0000-0000000a4500' AND user_id = '00000000-0000-0000-0000-0000000a4b02';
UPDATE public.golf_team_members SET status = 'active', updated_at = now()
  WHERE player_id = '00000000-0000-0000-0000-0000000a4402' AND team_id = '00000000-0000-0000-0000-0000000a4201';
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b02'), 0,
  'an update that leaves the status active does not put a removed member back');

-- Already in the channel: going inactive and coming back does not fail or duplicate, and going inactive does not remove.
UPDATE public.golf_team_members SET status = 'inactive'
  WHERE player_id = '00000000-0000-0000-0000-0000000a4401' AND team_id = '00000000-0000-0000-0000-0000000a4201';
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b01'), 1,
  'going inactive leaves the participant row (unchanged behaviour; leaving is the owner''s open decision)');
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'active'
    WHERE player_id = '00000000-0000-0000-0000-0000000a4401' AND team_id = '00000000-0000-0000-0000-0000000a4201'$$,
  'a member already in the channel is set active again without error');
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b01'), 1,
  'and still has exactly one row');

-- ---------------------------------------------------------------------------
-- Other team, no account, no channel
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
      ('00000000-0000-0000-0000-0000000a4403', '00000000-0000-0000-0000-0000000a4202', 'active'),
      ('00000000-0000-0000-0000-0000000a4404', '00000000-0000-0000-0000-0000000a4201', 'active'),
      ('00000000-0000-0000-0000-0000000a4405', '00000000-0000-0000-0000-0000000a4203', 'active')$$,
  'three more active rows: another team, a player with no account, a team with no channel');
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4501', '00000000-0000-0000-0000-0000000a4b03'), 1,
  'P3 is in their own team''s channel');
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b03'), 0,
  'and not in this team''s');
-- Changed on purpose by 20261110090300 (owner decision 2026-11-10: every team has a channel). Before it, P5 was in no
-- conversation here.
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants cp
    JOIN public.golf_conversations c ON c.id = cp.conversation_id
    WHERE cp.user_id = '00000000-0000-0000-0000-0000000a4b05'
      AND c.team_id = '00000000-0000-0000-0000-0000000a4203' AND c.is_team_channel)
  + (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE user_id = '00000000-0000-0000-0000-0000000a4b05'),
  2, 'P5, on a team with no channel, gets one (20261110090300): it is the only conversation P5 is in');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000a4500'),
  3, 'the channel holds the coach, P1 and P7: the player with no account added nobody');

-- ---------------------------------------------------------------------------
-- The channel insert fails: the roster write still succeeds
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.a4_refuse_p6() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.user_id = '00000000-0000-0000-0000-0000000a4b06' THEN
    RAISE EXCEPTION 'simulated failure adding P6 to a conversation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER a4_refuse_p6 BEFORE INSERT ON public.golf_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.a4_refuse_p6();

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a4c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a4406', '00000000-0000-0000-0000-0000000a4201', 'active')$$,
  'with the channel insert failing, the coach still adds P6 to the roster');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_team_members
    WHERE player_id = '00000000-0000-0000-0000-0000000a4406' AND team_id = '00000000-0000-0000-0000-0000000a4201' AND status = 'active'),
  1, 'P6''s roster row is there');
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4b06'), 0,
  'and P6 is not in the channel (the failure was a warning)');
DROP TRIGGER a4_refuse_p6 ON public.golf_conversation_participants;

-- ---------------------------------------------------------------------------
-- A coach put on the staff
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-0000000a4201', '00000000-0000-0000-0000-0000000a4302')$$,
  'C2 is put on the team''s staff');
SELECT is(public.a4_in('00000000-0000-0000-0000-0000000a4500', '00000000-0000-0000-0000-0000000a4c02'), 1,
  'C2 is in the team channel');
SELECT is(
  public.a4_in('00000000-0000-0000-0000-0000000a4501', '00000000-0000-0000-0000-0000000a4c02')
  + public.a4_in('00000000-0000-0000-0000-0000000a4502', '00000000-0000-0000-0000-0000000a4c02'),
  0, 'and in nothing else');
SELECT lives_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-0000000a4203', '00000000-0000-0000-0000-0000000a4302')$$,
  'a staff row on a team with no channel is written');

-- ---------------------------------------------------------------------------
-- Nobody can call the functions directly
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT helm_private.golf_team_channel_join_member()$$,
  '42501', NULL, 'an authenticated session cannot call the trigger function');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
