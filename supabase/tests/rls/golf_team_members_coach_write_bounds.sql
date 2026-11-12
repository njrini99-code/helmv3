-- pgTAP contract for 20261110090700_golf_team_members_coach_write_bounds.sql.
--
-- The hole (security review 2026-11-10, item 1): golf_team_members_insert_coach and _update_coach check only
-- is_golf_team_coach(team_id). Coach sign-up is self-serve, so any staffed coach could INSERT a roster row for ANY
-- player id as 'active', or UPDATE one of their own rows onto another player. The coach then reads that player's
-- profile row, can add them to team chats, and the auto-join trigger puts the player in the coach's team channel.
-- Many players are minors.
--
-- The fixture: CA is head coach of TA and TA2 (org A), CA2 an assistant on TA, CB coaches TB (org B). P1 is active on
-- TA. V is active on TB and has never asked to join TA. P5 has a rejected request to TA, P6 a pending one. P2, P3 and
-- P4 are on no team. TA has a team channel (CA, CA2, P1).
--
-- Before the migration 20 of the 39 fail (run that way on the local stack, 2026-11-10): the five structure checks
-- and every attack, which succeeds. Each legitimate roster write passes before and after:
--   acceptJoinRequest        teams.ts:1355 insert, :1371 request -> approved      (the same lines at d0f467a73)
--   rejectJoinRequest        teams.ts:1512
--   updatePlayerStatus       team-management.ts:335                               (d0f467a73: :241)
--   setPlayerAvailability    team-management.ts:454                               (not in d0f467a73)
--   removePlayerFromTeam     roster.ts:107
--   a player leaves          JoinTeamSection.tsx:138, clubhouse settings/writes.ts:198 (d0f467a73: :197)
--   join by code             teams.ts:430, RPC golf_join_team_with_code (SECURITY DEFINER)
--   seed and admin scripts   service role
--
-- Ids use the 0000...0b7xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(39);

CREATE FUNCTION public.b7_roster(p_team uuid, p_player uuid) RETURNS text
LANGUAGE sql AS $f$
  SELECT coalesce(
    (SELECT status::text FROM public.golf_team_members WHERE team_id = p_team AND player_id = p_player), 'none');
$f$;
CREATE FUNCTION public.b7_in_channel(p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = '00000000-0000-0000-0000-0000000b7500' AND user_id = p_user;
$f$;

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000b7c01', 'b7-coach-a@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000b7c02', 'b7-coach-a2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000b7c03', 'b7-coach-b@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b01', 'b7-p1@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b02', 'b7-p2@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b03', 'b7-p3@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b04', 'b7-p4@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b05', 'b7-p5@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b06', 'b7-p6@helm.test',       'authenticated'),
    ('00000000-0000-0000-0000-0000000b7b09', 'b7-victim@helm.test',   'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000b7c01', 'b7-coach-a@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000b7c02', 'b7-coach-a2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000b7c03', 'b7-coach-b@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000b7b01', 'b7-p1@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b02', 'b7-p2@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b03', 'b7-p3@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b04', 'b7-p4@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b05', 'b7-p5@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b06', 'b7-p6@helm.test',       'player'),
    ('00000000-0000-0000-0000-0000000b7b09', 'b7-victim@helm.test',   'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000b7101', 'B7 Org A', 'college'),
    ('00000000-0000-0000-0000-0000000b7102', 'B7 Org B', 'college');
  INSERT INTO public.golf_teams (id, name, join_code, gender, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000b7201', 'B7 Team A',  'B7TEAMA1', 'mens',   '00000000-0000-0000-0000-0000000b7101'),
    ('00000000-0000-0000-0000-0000000b7202', 'B7 Team A2', 'B7TEAMA2', 'womens', '00000000-0000-0000-0000-0000000b7101'),
    ('00000000-0000-0000-0000-0000000b7203', 'B7 Team B',  'B7TEAMB1', 'mens',   '00000000-0000-0000-0000-0000000b7102');
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000b7301', '00000000-0000-0000-0000-0000000b7c01', '00000000-0000-0000-0000-0000000b7101'),
    ('00000000-0000-0000-0000-0000000b7302', '00000000-0000-0000-0000-0000000b7c02', '00000000-0000-0000-0000-0000000b7101'),
    ('00000000-0000-0000-0000-0000000b7303', '00000000-0000-0000-0000-0000000b7c03', '00000000-0000-0000-0000-0000000b7102')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7301', 'head_coach',      true),
    ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7302', 'assistant_coach', false),
    ('00000000-0000-0000-0000-0000000b7202', '00000000-0000-0000-0000-0000000b7301', 'head_coach',      true),
    ('00000000-0000-0000-0000-0000000b7203', '00000000-0000-0000-0000-0000000b7303', 'head_coach',      true);
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000b7401', '00000000-0000-0000-0000-0000000b7b01', 'Pone',   'Rostered'),
    ('00000000-0000-0000-0000-0000000b7402', '00000000-0000-0000-0000-0000000b7b02', 'Ptwo',   'Asks'),
    ('00000000-0000-0000-0000-0000000b7403', '00000000-0000-0000-0000-0000000b7b03', 'Pthree', 'Code'),
    ('00000000-0000-0000-0000-0000000b7404', '00000000-0000-0000-0000-0000000b7b04', 'Pfour',  'Seeded'),
    ('00000000-0000-0000-0000-0000000b7405', '00000000-0000-0000-0000-0000000b7b05', 'Pfive',  'Rejected'),
    ('00000000-0000-0000-0000-0000000b7406', '00000000-0000-0000-0000-0000000b7b06', 'Psix',   'Pending'),
    ('00000000-0000-0000-0000-0000000b7409', '00000000-0000-0000-0000-0000000b7b09', 'Victim', 'Elsewhere')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
    ('00000000-0000-0000-0000-0000000b7401', '00000000-0000-0000-0000-0000000b7201', 'active'),
    ('00000000-0000-0000-0000-0000000b7409', '00000000-0000-0000-0000-0000000b7203', 'active');
  INSERT INTO public.golf_team_join_requests (id, team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-0000000b7605', '00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7405', 'rejected'),
    ('00000000-0000-0000-0000-0000000b7606', '00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7406', 'pending');

  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
    ('00000000-0000-0000-0000-0000000b7500', '00000000-0000-0000-0000-0000000b7c01', '00000000-0000-0000-0000-0000000b7201', true, true, 'B7 Team A — Team Channel');
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000b7500', '00000000-0000-0000-0000-0000000b7c01'),
    ('00000000-0000-0000-0000-0000000b7500', '00000000-0000-0000-0000-0000000b7c02'),
    ('00000000-0000-0000-0000-0000000b7500', '00000000-0000-0000-0000-0000000b7b01');
END $$;
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_team_members'
      AND policyname = 'golf_team_members_insert_coach' AND permissive = 'PERMISSIVE' AND cmd = 'INSERT'
      AND roles = '{authenticated}'
      AND position('is_golf_team_coach' IN with_check) > 0
      AND position('golf_team_join_requests' IN with_check) > 0
      AND position('pending' IN with_check) > 0),
  'the coach INSERT policy asks for a staffed coach AND a pending join request from that player for that team');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_team_members' AND cmd IN ('INSERT', 'ALL')),
  1, 'it is the only policy through which a client session inserts a roster row');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.golf_team_members'::regclass AND tgname = 'golf_team_members_identity_guard'
      AND NOT tgisinternal AND tgenabled = 'O' AND (tgtype & 1) = 1 AND (tgtype & 2) = 2 AND (tgtype & 16) = 16),
  'golf_team_members_identity_guard is a BEFORE UPDATE row trigger');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.golf_team_join_requests'::regclass AND tgname = 'golf_team_join_requests_identity_guard'
      AND NOT tgisinternal AND tgenabled = 'O' AND (tgtype & 1) = 1 AND (tgtype & 2) = 2 AND (tgtype & 16) = 16),
  'golf_team_join_requests_identity_guard is a BEFORE UPDATE row trigger');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('golf_team_members_identity_guard', 'golf_team_join_requests_identity_guard')
      AND NOT p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')),
  2, 'both guard functions run as the caller (so current_user is the session''s role), with an empty search_path');

-- ---------------------------------------------------------------------------
-- The attack, as coach CA of team TA
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7409', 'active')$$,
  '42501', NULL, 'a coach cannot roster another team''s player who never asked to join');
SELECT throws_ok(
  $$INSERT INTO public.golf_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7409', 'pending')$$,
  '42501', NULL, 'whatever status the row carries');
SELECT throws_ok(
  $$INSERT INTO public.golf_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7405', 'active')$$,
  '42501', NULL, 'a request the coach rejected is not an invitation');
SELECT throws_ok(
  $$UPDATE public.golf_team_members SET player_id = '00000000-0000-0000-0000-0000000b7409'
    WHERE team_id = '00000000-0000-0000-0000-0000000b7201' AND player_id = '00000000-0000-0000-0000-0000000b7401'$$,
  '42501', 'A roster row cannot be moved to another team or player',
  'a coach cannot re-point one of their roster rows at another player');
SELECT throws_ok(
  $$UPDATE public.golf_team_members SET team_id = '00000000-0000-0000-0000-0000000b7202'
    WHERE team_id = '00000000-0000-0000-0000-0000000b7201' AND player_id = '00000000-0000-0000-0000-0000000b7401'$$,
  '42501', 'A roster row cannot be moved to another team or player',
  'nor move a roster row to another team they coach');
-- The request is the player's consent, so it must not be forgeable either.
SELECT throws_ok(
  $$INSERT INTO public.golf_team_join_requests (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7409', 'pending')$$,
  '42501', NULL, 'a coach cannot file a join request in a player''s name');
SELECT throws_ok(
  $$UPDATE public.golf_team_join_requests SET player_id = '00000000-0000-0000-0000-0000000b7409'
    WHERE id = '00000000-0000-0000-0000-0000000b7606'$$,
  '42501', 'A join request cannot be moved to another team or player',
  'nor re-point a pending request at another player');
SELECT throws_ok(
  $$UPDATE public.golf_team_join_requests SET team_id = '00000000-0000-0000-0000-0000000b7202'
    WHERE id = '00000000-0000-0000-0000-0000000b7606'$$,
  '42501', 'A join request cannot be moved to another team or player',
  'nor move it to another team');
SELECT throws_ok(
  $$UPDATE public.golf_team_join_requests SET status = 'pending'
    WHERE id = '00000000-0000-0000-0000-0000000b7605'$$,
  '42501', 'A decided join request cannot be reopened',
  'nor reopen a request that was already decided');
SELECT is(
  (SELECT count(*)::int FROM public.golf_players WHERE id = '00000000-0000-0000-0000-0000000b7409'),
  0, 'the coach still cannot read that player''s profile row');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7409')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b09'),
  'none/0', 'the other team''s player is not on the coach''s roster and not in the coach''s team channel');
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7401')
  || '/' || public.b7_roster('00000000-0000-0000-0000-0000000b7202', '00000000-0000-0000-0000-0000000b7401'),
  'active/none', 'and the coach''s own player is where they were');

-- ---------------------------------------------------------------------------
-- Every legitimate roster write still works
-- ---------------------------------------------------------------------------
-- A player asks to join; the coach approves (insert while the request is pending, then mark it approved).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7b02", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_join_requests (id, team_id, player_id, status, message)
    VALUES ('00000000-0000-0000-0000-0000000b7602', '00000000-0000-0000-0000-0000000b7201',
            '00000000-0000-0000-0000-0000000b7402', 'pending', 'Please')$$,
  'createTeamJoinRequest: a player asks to join a team');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7402', '00000000-0000-0000-0000-0000000b7201', 'active')$$,
  'acceptJoinRequest: the coach adds the player who asked');
SELECT lives_ok(
  $$UPDATE public.golf_team_join_requests
    SET status = 'approved', reviewed_by = '00000000-0000-0000-0000-0000000b7301', reviewed_at = now()
    WHERE id = '00000000-0000-0000-0000-0000000b7602'$$,
  'acceptJoinRequest: and marks the request approved');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7402')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b02')
  || '/' || (SELECT status FROM public.golf_team_join_requests WHERE id = '00000000-0000-0000-0000-0000000b7602'),
  'active/1/approved', 'the player is active, the auto-join trigger put them in the team channel, the request is approved');

-- The player leaves; the old approved request does not let the coach put them back.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7b02", "role": "authenticated"}';
SELECT lives_ok(
  $$DELETE FROM public.golf_team_members WHERE player_id = '00000000-0000-0000-0000-0000000b7402'$$,
  'a player leaves their team');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000b7402', '00000000-0000-0000-0000-0000000b7201', 'active')$$,
  '42501', NULL, 'an approved request from the past does not let the coach put a player who left back on the roster');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7402')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b02'),
  'none/0', 'the player who left is off the roster and the leave trigger took them out of the channel');

-- Reject, deactivate, reactivate, availability, an edit that names the identity columns unchanged, remove.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_join_requests
    SET status = 'rejected', rejection_reason = 'Roster is full',
        reviewed_by = '00000000-0000-0000-0000-0000000b7301', reviewed_at = now()
    WHERE id = '00000000-0000-0000-0000-0000000b7606'$$,
  'rejectJoinRequest: the coach rejects a pending request');
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'inactive', updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000b7401' AND team_id = '00000000-0000-0000-0000-0000000b7201'$$,
  'updatePlayerStatus: the coach deactivates a player');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7401')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b01'),
  'inactive/0', 'the player is inactive and the leave trigger took them out of the channel');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'active', updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000b7401' AND team_id = '00000000-0000-0000-0000-0000000b7201'$$,
  'updatePlayerStatus: the coach reactivates the player (no join request is needed for a row already on the team)');
SELECT lives_ok(
  $$UPDATE public.golf_team_members
    SET availability = 'injured', availability_note = 'Wrist', availability_updated_at = now(), updated_at = now()
    WHERE player_id = '00000000-0000-0000-0000-0000000b7401' AND team_id = '00000000-0000-0000-0000-0000000b7201'$$,
  'setPlayerAvailability: the coach sets availability and a note');
SELECT lives_ok(
  $$UPDATE public.golf_team_members
    SET team_id = team_id, player_id = player_id, jersey_number = 7
    WHERE player_id = '00000000-0000-0000-0000-0000000b7401' AND team_id = '00000000-0000-0000-0000-0000000b7201'$$,
  'an update that carries the identity columns unchanged is not refused');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7401')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b01'),
  'active/1', 'the player is active again and the auto-join trigger put them back in the channel');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c01", "role": "authenticated"}';
SELECT lives_ok(
  $$DELETE FROM public.golf_team_members
    WHERE player_id = '00000000-0000-0000-0000-0000000b7401' AND team_id = '00000000-0000-0000-0000-0000000b7201'$$,
  'removePlayerFromTeam: the coach removes a player');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7401')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b01'),
  'none/0', 'the removed player is off the roster and out of the channel');

-- Join by code: the SECURITY DEFINER RPC inserts the row itself, so no request is needed.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7b03", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT * FROM public.golf_join_team_with_code('B7TEAMA1')$$,
  'golf_join_team_with_code: a player joins with the team''s code');
RESET ROLE;
SELECT is(
  public.b7_roster('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7403')
  || '/' || public.b7_in_channel('00000000-0000-0000-0000-0000000b7b03'),
  'active/1', 'that player is active and in the team channel');

-- Seed and admin scripts use the service role: no request, and a row may be moved.
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
      VALUES ('00000000-0000-0000-0000-0000000b7404', '00000000-0000-0000-0000-0000000b7201', 'active');
    UPDATE public.golf_team_members SET team_id = '00000000-0000-0000-0000-0000000b7202'
      WHERE player_id = '00000000-0000-0000-0000-0000000b7404';
    UPDATE public.golf_team_join_requests SET status = 'pending'
      WHERE id = '00000000-0000-0000-0000-0000000b7605'$$,
  'the service role adds a roster row with no request, moves it, and reopens a request');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Who inherits a team channel (20261110090400 hands created_by to a coach still on the staff when its creator's
-- staff row is deleted). A client cannot arrange that for themself: they can delete only their own staff row and
-- cannot put themself on another team's staff.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c02", "role": "authenticated"}';
SELECT lives_ok(
  $$DELETE FROM public.golf_team_coach_staff
    WHERE team_id = '00000000-0000-0000-0000-0000000b7201' AND coach_id = '00000000-0000-0000-0000-0000000b7301'$$,
  'an assistant''s delete of the head coach''s staff row raises nothing (the row is filtered out)');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000b7c03", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role)
    VALUES ('00000000-0000-0000-0000-0000000b7201', '00000000-0000-0000-0000-0000000b7303', 'head_coach')$$,
  '42501', NULL, 'a coach of another team cannot put themself on this team''s staff');
RESET ROLE;
SELECT is(
  (SELECT created_by::text FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000b7500')
  || '/' || (SELECT count(*) FROM public.golf_team_coach_staff WHERE team_id = '00000000-0000-0000-0000-0000000b7201'),
  '00000000-0000-0000-0000-0000000b7c01/2', 'so the channel keeps its creator and the staff is unchanged');

SELECT * FROM finish();
ROLLBACK;
