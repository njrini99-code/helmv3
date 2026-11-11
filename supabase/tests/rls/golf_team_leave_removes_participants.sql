-- pgTAP contract for 20261110090400_golf_team_leave_removes_participants.sql (owner decision 2026-11-10: leaving a
-- team removes you from its team channel and its group chats).
--
-- The fixture is written with triggers off, so the conversations and their members are exactly the rows named here.
-- Then the roster and the staff are changed the way the app changes them (a coach sets a player inactive or removed,
-- a player leaves, a coach comes off the staff), and each change must take that person out of the team's channel and
-- its team chats, and out of nothing else: not a one-to-one conversation, not another team's channel, and not while
-- the same login is still on the team in its other role.
--
-- Before the migration 15 of the 34 fail (run that way on the local stack, 2026-11-10): the two structure checks and
-- every line that expects somebody to be gone. After it all 34 pass. The roster and staff writes themselves, and
-- every "is still in" line, pass before and after.
--
-- Ids use the 0000...0a6xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(34);

CREATE FUNCTION public.a6_in(p_conversation uuid, p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = p_conversation AND user_id = p_user;
$f$;
CREATE FUNCTION public.a6_size(p_conversation uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants WHERE conversation_id = p_conversation;
$f$;

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  -- Coaches C1 (creates the channel and the group), C2, C3. X and Y are each a coach AND a player on the team.
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a6c01', 'a6-coach1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a6c02', 'a6-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a6c03', 'a6-coach3@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a6d01', 'a6-x@helm.test',      'authenticated'),
    ('00000000-0000-0000-0000-0000000a6d02', 'a6-y@helm.test',      'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b01', 'a6-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b02', 'a6-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b03', 'a6-p3@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b04', 'a6-p4@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b05', 'a6-p5@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a6b06', 'a6-p6@helm.test',     'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a6c01', 'a6-coach1@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a6c02', 'a6-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a6c03', 'a6-coach3@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a6d01', 'a6-x@helm.test',      'coach'),
    ('00000000-0000-0000-0000-0000000a6d02', 'a6-y@helm.test',      'coach'),
    ('00000000-0000-0000-0000-0000000a6b01', 'a6-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a6b02', 'a6-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a6b03', 'a6-p3@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a6b04', 'a6-p4@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a6b05', 'a6-p5@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a6b06', 'a6-p6@helm.test',     'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a6101', 'A6 Org',       'college'),
    ('00000000-0000-0000-0000-0000000a6102', 'A6 Other Org', 'college'),
    ('00000000-0000-0000-0000-0000000a6103', 'A6 Gone Org',  'college');
  -- T is the team people leave. T2 is another team P1 and C2 are also on. T3 is deleted whole.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a6201', 'A6 Team',  'A6TEAM01', '00000000-0000-0000-0000-0000000a6101'),
    ('00000000-0000-0000-0000-0000000a6202', 'A6 Other', 'A6TEAM02', '00000000-0000-0000-0000-0000000a6102'),
    ('00000000-0000-0000-0000-0000000a6203', 'A6 Gone',  'A6TEAM03', '00000000-0000-0000-0000-0000000a6103');

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a6301', '00000000-0000-0000-0000-0000000a6c01', '00000000-0000-0000-0000-0000000a6101'),
    ('00000000-0000-0000-0000-0000000a6302', '00000000-0000-0000-0000-0000000a6c02', '00000000-0000-0000-0000-0000000a6101'),
    ('00000000-0000-0000-0000-0000000a6303', '00000000-0000-0000-0000-0000000a6c03', '00000000-0000-0000-0000-0000000a6101'),
    ('00000000-0000-0000-0000-0000000a6311', '00000000-0000-0000-0000-0000000a6d01', '00000000-0000-0000-0000-0000000a6101'),
    ('00000000-0000-0000-0000-0000000a6312', '00000000-0000-0000-0000-0000000a6d02', '00000000-0000-0000-0000-0000000a6101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a6401', '00000000-0000-0000-0000-0000000a6b01', 'Pone',   'Inactive'),
    ('00000000-0000-0000-0000-0000000a6402', '00000000-0000-0000-0000-0000000a6b02', 'Ptwo',   'Removed'),
    ('00000000-0000-0000-0000-0000000a6403', '00000000-0000-0000-0000-0000000a6b03', 'Pthree', 'Leaves'),
    ('00000000-0000-0000-0000-0000000a6404', '00000000-0000-0000-0000-0000000a6b04', 'Pfour',  'Unlucky'),
    ('00000000-0000-0000-0000-0000000a6405', '00000000-0000-0000-0000-0000000a6b05', 'Pfive',  'Teamgone'),
    ('00000000-0000-0000-0000-0000000a6406', '00000000-0000-0000-0000-0000000a6b06', 'Psix',   'Profilegone'),
    ('00000000-0000-0000-0000-0000000a6411', '00000000-0000-0000-0000-0000000a6d01', 'Xavier', 'Both'),
    ('00000000-0000-0000-0000-0000000a6412', '00000000-0000-0000-0000-0000000a6d02', 'Yara',   'Both')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, is_primary, created_at) VALUES
    ('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6301', true,  now() - interval '9 days'),
    ('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6302', false, now() - interval '8 days'),
    ('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6303', false, now() - interval '7 days'),
    ('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6311', false, now() - interval '6 days'),
    ('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6312', false, now() - interval '5 days'),
    ('00000000-0000-0000-0000-0000000a6202', '00000000-0000-0000-0000-0000000a6302', true,  now() - interval '9 days'),
    ('00000000-0000-0000-0000-0000000a6203', '00000000-0000-0000-0000-0000000a6303', true,  now() - interval '9 days');
  INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
    ('00000000-0000-0000-0000-0000000a6401', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6401', '00000000-0000-0000-0000-0000000a6202', 'active'),
    ('00000000-0000-0000-0000-0000000a6402', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6403', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6404', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6406', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6411', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6412', '00000000-0000-0000-0000-0000000a6201', 'active'),
    ('00000000-0000-0000-0000-0000000a6405', '00000000-0000-0000-0000-0000000a6203', 'active');

  -- 6500 T's channel. 6501 C1's group on T. 6502 one-to-one, C1 and P1 (team set, neither flag).
  -- 6503 T2's channel. 6504 T3's channel.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c01', '00000000-0000-0000-0000-0000000a6201', true,  true,  'A6 Team — Team Channel'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c01', '00000000-0000-0000-0000-0000000a6201', true,  false, 'Travel squad'),
    ('00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6c01', '00000000-0000-0000-0000-0000000a6201', false, false, NULL),
    ('00000000-0000-0000-0000-0000000a6503', '00000000-0000-0000-0000-0000000a6c02', '00000000-0000-0000-0000-0000000a6202', true,  true,  'A6 Other — Team Channel'),
    ('00000000-0000-0000-0000-0000000a6504', '00000000-0000-0000-0000-0000000a6c03', '00000000-0000-0000-0000-0000000a6203', true,  true,  'A6 Gone — Team Channel');
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c01'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c02'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c03'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d01'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d02'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b01'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b02'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b03'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b04'),
    ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b06'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c01'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c02'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d01'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d02'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b01'),
    ('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b02'),
    ('00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6c01'),
    ('00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6b01'),
    ('00000000-0000-0000-0000-0000000a6503', '00000000-0000-0000-0000-0000000a6c02'),
    ('00000000-0000-0000-0000-0000000a6503', '00000000-0000-0000-0000-0000000a6b01'),
    ('00000000-0000-0000-0000-0000000a6504', '00000000-0000-0000-0000-0000000a6c03'),
    ('00000000-0000-0000-0000-0000000a6504', '00000000-0000-0000-0000-0000000a6b05');
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content) VALUES
    ('00000000-0000-0000-0000-0000000a6600', '00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c01', 'channel: tee times'),
    ('00000000-0000-0000-0000-0000000a6601', '00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c01', 'group: travel list'),
    ('00000000-0000-0000-0000-0000000a6602', '00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6c01', 'one-to-one: see me')
  ON CONFLICT DO NOTHING;
END $$;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 3 FROM pg_trigger
    WHERE NOT tgisinternal AND tgenabled = 'O' AND (tgtype & 2) = 0 AND (tgtype & 1) = 1
      AND ((tgrelid = 'public.golf_team_members'::regclass AND tgname = 'golf_team_members_leave_team_chats' AND (tgtype & 16) = 16)
        OR (tgrelid = 'public.golf_team_members'::regclass AND tgname = 'golf_team_members_delete_leave_team_chats' AND (tgtype & 8) = 8)
        OR (tgrelid = 'public.golf_team_coach_staff'::regclass AND tgname = 'golf_team_coach_staff_leave_team_chats' AND (tgtype & 8) = 8))),
  'three AFTER ROW triggers exist: roster status, roster delete, staff delete');
SELECT ok(
  (SELECT count(*) = 3 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private'
      AND p.proname IN ('golf_team_remove_departed', 'golf_team_chats_leave_member', 'golf_team_chats_leave_staff')
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'the three functions are SECURITY DEFINER with an empty search_path, and neither anon nor authenticated may execute them');

-- ---------------------------------------------------------------------------
-- A coach sets a player inactive (team-management.ts, as the coach)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a6c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'inactive', updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000a6401' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'the coach sets P1 inactive');
RESET ROLE;
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b01')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b01'),
  0, 'P1 is out of the team channel and out of the coach''s group');
SELECT is(public.a6_in('00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6b01'), 1,
  'P1 keeps the one-to-one conversation with the coach');
SELECT is(public.a6_in('00000000-0000-0000-0000-0000000a6503', '00000000-0000-0000-0000-0000000a6b01'), 1,
  'and stays in the channel of the other team P1 is still on');
SELECT is(
  public.a6_size('00000000-0000-0000-0000-0000000a6500') * 100 + public.a6_size('00000000-0000-0000-0000-0000000a6501'),
  905, 'nobody else was touched: the channel holds 9, the group 5');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a6b01", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(content, ', ' ORDER BY content) FROM public.golf_messages
    WHERE id IN ('00000000-0000-0000-0000-0000000a6600', '00000000-0000-0000-0000-0000000a6601', '00000000-0000-0000-0000-0000000a6602')),
  'one-to-one: see me', 'P1 now reads the one-to-one message and neither the channel''s nor the group''s');
SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b01', 'still here?')$$,
  '42501', NULL, 'and can no longer post in the channel');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Set active again: back in the channel (20261110090200 / 090300), not in the coach's group
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a6c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'active', updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000a6401' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'the coach sets P1 active again');
RESET ROLE;
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b01') * 10
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b01'),
  10, 'P1 is back in the channel and not in the group: the coach adds people to a group, the roster does not');

-- ---------------------------------------------------------------------------
-- A roster edit that is not leaving; then 'removed'; then the player deletes their own row
-- ---------------------------------------------------------------------------
UPDATE public.golf_team_members SET jersey_number = 7, updated_at = now()
  WHERE player_id = '00000000-0000-0000-0000-0000000a6402' AND team_id = '00000000-0000-0000-0000-0000000a6201';
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b02')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b02'),
  2, 'an edit that leaves P2 active removes P2 from nothing');
UPDATE public.golf_team_members SET status = 'removed'
  WHERE player_id = '00000000-0000-0000-0000-0000000a6402' AND team_id = '00000000-0000-0000-0000-0000000a6201';
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b02')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6b02'),
  0, 'P2, set to removed, is out of the channel and the group');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a6b03", "role": "authenticated"}';
SELECT lives_ok(
  $$DELETE FROM public.golf_team_members
    WHERE player_id = '00000000-0000-0000-0000-0000000a6403' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'P3 leaves the team (deletes their own roster row), without holding EXECUTE on the trigger function');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_team_members WHERE player_id = '00000000-0000-0000-0000-0000000a6403') * 10
  + public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b03'),
  0, 'the roster row is gone and P3 is out of the channel');

-- ---------------------------------------------------------------------------
-- One login, two roles: access lasts until both end
-- ---------------------------------------------------------------------------
-- X stops being a player first, then comes off the staff.
UPDATE public.golf_team_members SET status = 'inactive'
  WHERE player_id = '00000000-0000-0000-0000-0000000a6411' AND team_id = '00000000-0000-0000-0000-0000000a6201';
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d01')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d01'),
  2, 'X, inactive as a player but still a coach of the team, keeps the channel and the group');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a6d01", "role": "authenticated"}';
SELECT lives_ok(
  $$DELETE FROM public.golf_team_coach_staff
    WHERE coach_id = '00000000-0000-0000-0000-0000000a6311' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'X comes off the staff (deletes their own staff row)');
RESET ROLE;
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d01')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d01'),
  0, 'now X has no role on the team and is out of both');
-- Y comes off the staff first, then stops being a player.
DELETE FROM public.golf_team_coach_staff
  WHERE coach_id = '00000000-0000-0000-0000-0000000a6312' AND team_id = '00000000-0000-0000-0000-0000000a6201';
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d02')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d02'),
  2, 'Y, off the staff but still an active player, keeps the channel and the group');
UPDATE public.golf_team_members SET status = 'inactive'
  WHERE player_id = '00000000-0000-0000-0000-0000000a6412' AND team_id = '00000000-0000-0000-0000-0000000a6201';
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6d02')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6d02'),
  0, 'and is out of both once inactive as a player too');

-- ---------------------------------------------------------------------------
-- A coach removed from the staff
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$DELETE FROM public.golf_team_coach_staff
    WHERE coach_id = '00000000-0000-0000-0000-0000000a6302' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'C2 is taken off the team''s staff');
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c02')
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c02'),
  0, 'C2 is out of the channel and the group');
SELECT is(public.a6_in('00000000-0000-0000-0000-0000000a6503', '00000000-0000-0000-0000-0000000a6c02'), 1,
  'and still in the channel of the other team C2 coaches');

-- The coach who created the channel and the group leaves the staff.
SELECT lives_ok(
  $$DELETE FROM public.golf_team_coach_staff
    WHERE coach_id = '00000000-0000-0000-0000-0000000a6301' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'C1, who created the channel and the group, is taken off the staff');
SELECT is(
  public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6c01') * 100
  + public.a6_in('00000000-0000-0000-0000-0000000a6501', '00000000-0000-0000-0000-0000000a6c01') * 10
  + public.a6_in('00000000-0000-0000-0000-0000000a6502', '00000000-0000-0000-0000-0000000a6c01'),
  1, 'C1 is out of the channel and the group, and keeps the one-to-one conversation');
SELECT is(
  (SELECT created_by FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000a6500'),
  '00000000-0000-0000-0000-0000000a6c03'::uuid,
  'the channel now belongs to C3, the coach still on the staff, so a current coach can manage it');
SELECT is(
  (SELECT created_by::text || ' ' || public.a6_size(id) FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000a6501'),
  '00000000-0000-0000-0000-0000000a6c01 0',
  'the group is not deleted and keeps its creator; it is empty here because every member has left the team');

-- ---------------------------------------------------------------------------
-- The removal fails: the roster write still succeeds
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.a6_refuse_p4() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF OLD.user_id = '00000000-0000-0000-0000-0000000a6b04' THEN
    RAISE EXCEPTION 'simulated failure removing P4 from a conversation';
  END IF;
  RETURN OLD;
END $f$;
CREATE TRIGGER a6_refuse_p4 BEFORE DELETE ON public.golf_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.a6_refuse_p4();
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'inactive'
    WHERE player_id = '00000000-0000-0000-0000-0000000a6404' AND team_id = '00000000-0000-0000-0000-0000000a6201'$$,
  'with the removal failing, P4 is still set inactive');
SELECT is(
  (SELECT count(*)::int FROM public.golf_team_members
    WHERE player_id = '00000000-0000-0000-0000-0000000a6404' AND status = 'inactive') * 10
  + public.a6_in('00000000-0000-0000-0000-0000000a6500', '00000000-0000-0000-0000-0000000a6b04'),
  11, 'the roster says inactive, and P4 is still in the channel (the failure was a warning)');
DROP TRIGGER a6_refuse_p4 ON public.golf_conversation_participants;

-- ---------------------------------------------------------------------------
-- Cascades: a whole team deleted, a player profile deleted
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$DELETE FROM public.golf_teams WHERE id = '00000000-0000-0000-0000-0000000a6203'$$,
  'a team is deleted: its roster and staff rows cascade without error');
SELECT is(
  (SELECT (team_id IS NULL)::text || ' ' || public.a6_size(id) FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000a6504'),
  'true 2', 'its channel is left as before this file: no team, and both members still in it');
SELECT lives_ok(
  $$DELETE FROM public.golf_players WHERE id = '00000000-0000-0000-0000-0000000a6406'$$,
  'a player profile is deleted: its roster row cascades without error');

-- ---------------------------------------------------------------------------
-- Nobody can call the functions directly
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT helm_private.golf_team_remove_departed('00000000-0000-0000-0000-0000000a6201', '00000000-0000-0000-0000-0000000a6c03')$$,
  '42501', NULL, 'an authenticated session cannot call golf_team_remove_departed');
SELECT throws_ok(
  $$SELECT helm_private.golf_team_chats_leave_member()$$,
  '42501', NULL, 'nor a trigger function');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
