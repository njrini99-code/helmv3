-- pgTAP contract for 20261110090300_golf_team_channel_ensure.sql (owner decision 2026-11-10: every team has a team
-- channel, created automatically and filled from the roster).
--
-- The fixture is written with triggers off (session_replication_role = replica), so it starts from the state
-- production is in: teams with a staff and a roster and no channel. Then the roster is written the way the app writes
-- it, and each write must leave the team with exactly one channel that holds the team's people.
--
-- Before the migration (run that way on the local stack, 2026-11-10) 10 of the first 15 fail: the three structure
-- checks, the second channel that should be refused, and every line that needs a channel to have been created. The
-- 16th then stops the run, because it calls a function that does not exist yet. After it all 33 pass. The roster and
-- staff writes themselves pass before and after.
--
-- Ids use the 0000...0a5xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(33);

CREATE FUNCTION public.a5_channel(p_team uuid) RETURNS uuid
LANGUAGE sql AS $f$
  SELECT id FROM public.golf_conversations
  WHERE team_id = p_team AND is_team_channel ORDER BY created_at, id LIMIT 1;
$f$;
CREATE FUNCTION public.a5_channels(p_team uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversations WHERE team_id = p_team AND is_team_channel;
$f$;
CREATE FUNCTION public.a5_in(p_conversation uuid, p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = p_conversation AND user_id = p_user;
$f$;

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a5c01', 'a5-coach1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a5c02', 'a5-coach2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a5c03', 'a5-coach3@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b01', 'a5-p1@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b02', 'a5-p2@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b03', 'a5-p3@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b04', 'a5-p4@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b06', 'a5-p6@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b07', 'a5-p7@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b08', 'a5-p8@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b09', 'a5-p9@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000a5b0a', 'a5-p10@helm.test',    'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000a5c01', 'a5-coach1@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a5c02', 'a5-coach2@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a5c03', 'a5-coach3@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000a5b01', 'a5-p1@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b02', 'a5-p2@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b03', 'a5-p3@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b04', 'a5-p4@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b06', 'a5-p6@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b07', 'a5-p7@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b08', 'a5-p8@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b09', 'a5-p9@helm.test',     'player'),
    ('00000000-0000-0000-0000-0000000a5b0a', 'a5-p10@helm.test',    'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000a5101', 'A5 Org One',   'college'),
    ('00000000-0000-0000-0000-0000000a5102', 'A5 Org Two',   'college'),
    ('00000000-0000-0000-0000-0000000a5103', 'A5 Org Three', 'college'),
    ('00000000-0000-0000-0000-0000000a5104', 'A5 Org Four',  'college'),
    ('00000000-0000-0000-0000-0000000a5105', 'A5 Org Five',  'college');
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a5201', 'A5 One',   'A5TEAM01', '00000000-0000-0000-0000-0000000a5101'),
    ('00000000-0000-0000-0000-0000000a5202', 'A5 Two',   'A5TEAM02', '00000000-0000-0000-0000-0000000a5102'),
    ('00000000-0000-0000-0000-0000000a5203', 'A5 Three', 'A5TEAM03', '00000000-0000-0000-0000-0000000a5103'),
    ('00000000-0000-0000-0000-0000000a5204', 'A5 Four',  'A5TEAM04', '00000000-0000-0000-0000-0000000a5104'),
    ('00000000-0000-0000-0000-0000000a5205', 'A5 Five',  'A5TEAM05', '00000000-0000-0000-0000-0000000a5105');

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000a5301', '00000000-0000-0000-0000-0000000a5c01', '00000000-0000-0000-0000-0000000a5101'),
    ('00000000-0000-0000-0000-0000000a5302', '00000000-0000-0000-0000-0000000a5c02', '00000000-0000-0000-0000-0000000a5101'),
    ('00000000-0000-0000-0000-0000000a5303', '00000000-0000-0000-0000-0000000a5c03', '00000000-0000-0000-0000-0000000a5101')
  ON CONFLICT DO NOTHING;
  -- P5 has no account.
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000a5401', '00000000-0000-0000-0000-0000000a5b01', 'Pone',   'Active'),
    ('00000000-0000-0000-0000-0000000a5402', '00000000-0000-0000-0000-0000000a5b02', 'Ptwo',   'Inactive'),
    ('00000000-0000-0000-0000-0000000a5403', '00000000-0000-0000-0000-0000000a5b03', 'Pthree', 'Nocoach'),
    ('00000000-0000-0000-0000-0000000a5404', '00000000-0000-0000-0000-0000000a5b04', 'Pfour',  'Missing'),
    ('00000000-0000-0000-0000-0000000a5405', NULL,                                   'Pfive',  'Noaccount'),
    ('00000000-0000-0000-0000-0000000a5406', '00000000-0000-0000-0000-0000000a5b06', 'Psix',   'Joins'),
    ('00000000-0000-0000-0000-0000000a5407', '00000000-0000-0000-0000-0000000a5b07', 'Pseven', 'Teamtwo'),
    ('00000000-0000-0000-0000-0000000a5408', '00000000-0000-0000-0000-0000000a5b08', 'Peight', 'Nocoach'),
    ('00000000-0000-0000-0000-0000000a5409', '00000000-0000-0000-0000-0000000a5b09', 'Pnine',  'Unlucky'),
    ('00000000-0000-0000-0000-0000000a540a', '00000000-0000-0000-0000-0000000a5b0a', 'Pten',   'Pending')
  ON CONFLICT DO NOTHING;
END $$;

-- The roster and staff as production has them today: written with no trigger running, so no channel exists.
SET LOCAL session_replication_role = replica;
-- One: C2 was staffed first, C1 is the primary coach. Two: C2 first, then C1, nobody primary. Three: no coach.
-- Four and Five: C1.
INSERT INTO public.golf_team_coach_staff (team_id, coach_id, is_primary, created_at) VALUES
  ('00000000-0000-0000-0000-0000000a5201', '00000000-0000-0000-0000-0000000a5302', false, now() - interval '9 days'),
  ('00000000-0000-0000-0000-0000000a5201', '00000000-0000-0000-0000-0000000a5301', true,  now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000a5202', '00000000-0000-0000-0000-0000000a5302', false, now() - interval '9 days'),
  ('00000000-0000-0000-0000-0000000a5202', '00000000-0000-0000-0000-0000000a5301', false, now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000a5204', '00000000-0000-0000-0000-0000000a5301', true,  now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000a5205', '00000000-0000-0000-0000-0000000a5301', true,  now() - interval '5 days');
INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
  ('00000000-0000-0000-0000-0000000a5401', '00000000-0000-0000-0000-0000000a5201', 'active'),
  ('00000000-0000-0000-0000-0000000a5402', '00000000-0000-0000-0000-0000000a5201', 'inactive'),
  ('00000000-0000-0000-0000-0000000a5405', '00000000-0000-0000-0000-0000000a5201', 'active'),
  ('00000000-0000-0000-0000-0000000a5403', '00000000-0000-0000-0000-0000000a5203', 'active'),
  ('00000000-0000-0000-0000-0000000a5404', '00000000-0000-0000-0000-0000000a5204', 'active'),
  ('00000000-0000-0000-0000-0000000a540a', '00000000-0000-0000-0000-0000000a5204', 'pending');
-- Four already has a channel, with only its coach in it: P4 was never added.
INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title) VALUES
  ('00000000-0000-0000-0000-0000000a5500', '00000000-0000-0000-0000-0000000a5c01', '00000000-0000-0000-0000-0000000a5204', true, true, 'Four, made by hand');
INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
  ('00000000-0000-0000-0000-0000000a5500', '00000000-0000-0000-0000-0000000a5c01');
SET LOCAL session_replication_role = origin;
-- The coach adds these players the way acceptJoinRequest does: each has a pending join request for that team
-- (20261110090700 refuses a coach's roster INSERT without one).
INSERT INTO public.golf_team_join_requests (team_id, player_id, status) VALUES
  ('00000000-0000-0000-0000-0000000a5201', '00000000-0000-0000-0000-0000000a5406', 'pending'),
  ('00000000-0000-0000-0000-0000000a5205', '00000000-0000-0000-0000-0000000a5409', 'pending');
-- A coach reads (and so approves) join requests of teams in their own organization. Coach One is staffed on team
-- Five, so team Five moves into Org One; it is the women's team there (one team per organization and gender).
SET LOCAL session_replication_role = replica;
UPDATE public.golf_teams SET organization_id = '00000000-0000-0000-0000-0000000a5101', gender = 'womens'
WHERE id = '00000000-0000-0000-0000-0000000a5205';
SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.golf_conversations'::regclass
      AND i.indisunique AND i.indisvalid AND i.indnatts = 1
      AND pg_get_indexdef(i.indexrelid) LIKE '%(team_id) WHERE is_team_channel'),
  'a unique index allows one channel per team');
SELECT ok(
  (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private' AND p.proname = 'golf_ensure_team_channel'
      AND p.prorettype = 'uuid'::regtype
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'golf_ensure_team_channel is SECURITY DEFINER with an empty search_path, and neither anon nor authenticated may execute it');
SELECT ok(
  (SELECT count(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private'
      AND p.proname IN ('golf_team_channel_join_member', 'golf_team_channel_join_staff')
      AND p.prosrc LIKE '%golf_ensure_team_channel%'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'both auto-join functions ensure the channel first, and are still definer functions nobody can call');

-- ---------------------------------------------------------------------------
-- One channel per team
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.golf_conversations (created_by, team_id, is_team_chat, is_team_channel, title)
    VALUES ('00000000-0000-0000-0000-0000000a5c01', '00000000-0000-0000-0000-0000000a5204', true, true, 'A second channel')$$,
  '23505', NULL, 'a second channel for a team that has one is refused');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, is_team_channel, title)
    VALUES ('00000000-0000-0000-0000-0000000a5501', '00000000-0000-0000-0000-0000000a5c01', '00000000-0000-0000-0000-0000000a5204', true, false, 'A coach group')$$,
  'a coach''s group on the same team is not a channel and is still allowed');

-- ---------------------------------------------------------------------------
-- A team with a staff and no channel: a player becomes active (teams.ts:1356, as the coach)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a5c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a5406', '00000000-0000-0000-0000-0000000a5201', 'active')$$,
  'the coach adds P6 to team One, which has no channel');
RESET ROLE;
SELECT is(public.a5_channels('00000000-0000-0000-0000-0000000a5201'), 1, 'team One now has one channel');
SELECT is(
  (SELECT created_by::text || ' | ' || title || ' | ' || is_team_chat::text
     FROM public.golf_conversations WHERE id = public.a5_channel('00000000-0000-0000-0000-0000000a5201')),
  '00000000-0000-0000-0000-0000000a5c01 | A5 One — Team Channel | true',
  'created by the primary coach (not the coach staffed first), titled with the team''s name, and a team chat');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = public.a5_channel('00000000-0000-0000-0000-0000000a5201')$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a5c01'::uuid), ('00000000-0000-0000-0000-0000000a5c02'::uuid),
           ('00000000-0000-0000-0000-0000000a5b01'::uuid), ('00000000-0000-0000-0000-0000000a5b06'::uuid)$$,
  'filled from the roster: both coaches, P1 and P6; not P2 (inactive) and nobody for P5 (no account)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a5b06", "role": "authenticated"}';
SELECT is(
  (SELECT title || ' | ' || participant_count || ' | ' || is_team_channel::text || ' | ' || unread_count
          || ' | ' || coalesce(last_message_content, '(none)')
     FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000a5b06')),
  'A5 One — Team Channel | 4 | true | 0 | (none)',
  'P6''s conversation list holds the channel: its title, four members, nothing unread, no last message');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content)
    SELECT c.id, '00000000-0000-0000-0000-0000000a5b06', 'hello team'
    FROM public.golf_conversations c
    WHERE c.team_id = '00000000-0000-0000-0000-0000000a5201' AND c.is_team_channel$$,
  'P6 posts in it');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages
    WHERE sender_id = '00000000-0000-0000-0000-0000000a5b06'
      AND conversation_id = public.a5_channel('00000000-0000-0000-0000-0000000a5201')),
  1, 'and the message is there');

-- ---------------------------------------------------------------------------
-- Two teams never share one
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a5407', '00000000-0000-0000-0000-0000000a5202', 'active')$$,
  'P7 becomes active on team Two');
SELECT ok(
  public.a5_channels('00000000-0000-0000-0000-0000000a5202') = 1
  AND public.a5_channel('00000000-0000-0000-0000-0000000a5202') <> public.a5_channel('00000000-0000-0000-0000-0000000a5201')
  AND (SELECT created_by = '00000000-0000-0000-0000-0000000a5c02' FROM public.golf_conversations
        WHERE id = public.a5_channel('00000000-0000-0000-0000-0000000a5202')),
  'team Two has its own channel, created by the coach staffed first because nobody is primary');
SELECT is(
  public.a5_in(public.a5_channel('00000000-0000-0000-0000-0000000a5201'), '00000000-0000-0000-0000-0000000a5b07')
  + public.a5_in(public.a5_channel('00000000-0000-0000-0000-0000000a5202'), '00000000-0000-0000-0000-0000000a5b06')
  + public.a5_in(public.a5_channel('00000000-0000-0000-0000-0000000a5202'), '00000000-0000-0000-0000-0000000a5b01'),
  0, 'and neither channel holds a player of the other team');

-- ---------------------------------------------------------------------------
-- Asking again does not make a second channel
-- ---------------------------------------------------------------------------
SELECT is(
  helm_private.golf_ensure_team_channel('00000000-0000-0000-0000-0000000a5201'),
  public.a5_channel('00000000-0000-0000-0000-0000000a5201'),
  'a second ensure call returns the channel the team already has');
SELECT is(
  public.a5_channels('00000000-0000-0000-0000-0000000a5201') + public.a5_channels('00000000-0000-0000-0000-0000000a5202'),
  2, 'and the two teams still have one channel each');
SELECT ok(
  helm_private.golf_ensure_team_channel(NULL) IS NULL
  AND helm_private.golf_ensure_team_channel('00000000-0000-0000-0000-0000000a5299') IS NULL,
  'no team, or a team that does not exist: no channel and no error');

-- ---------------------------------------------------------------------------
-- A new coach lands in the existing channel
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-0000000a5201', '00000000-0000-0000-0000-0000000a5303')$$,
  'C3 is put on team One''s staff');
SELECT ok(
  public.a5_in(public.a5_channel('00000000-0000-0000-0000-0000000a5201'), '00000000-0000-0000-0000-0000000a5c03') = 1
  AND public.a5_channels('00000000-0000-0000-0000-0000000a5201') = 1,
  'C3 is in the channel the team already had');

-- ---------------------------------------------------------------------------
-- A team with no coach: no channel until it has one
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a5408', '00000000-0000-0000-0000-0000000a5203', 'active')$$,
  'P8 becomes active on team Three, which has no coach');
SELECT is(
  public.a5_channels('00000000-0000-0000-0000-0000000a5203')
  + (SELECT count(*)::int FROM public.golf_conversation_participants WHERE user_id = '00000000-0000-0000-0000-0000000a5b08'),
  0, 'no channel is created for a team with no coach, and P8 is in no conversation');
SELECT lives_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-0000000a5203', '00000000-0000-0000-0000-0000000a5303')$$,
  'C3 becomes team Three''s first coach');
SELECT ok(
  public.a5_channels('00000000-0000-0000-0000-0000000a5203') = 1
  AND (SELECT created_by = '00000000-0000-0000-0000-0000000a5c03' FROM public.golf_conversations
        WHERE id = public.a5_channel('00000000-0000-0000-0000-0000000a5203')),
  'now team Three has a channel, created by that coach');
SELECT bag_eq(
  $$SELECT user_id FROM public.golf_conversation_participants
     WHERE conversation_id = public.a5_channel('00000000-0000-0000-0000-0000000a5203')$$,
  $$VALUES ('00000000-0000-0000-0000-0000000a5c03'::uuid), ('00000000-0000-0000-0000-0000000a5b03'::uuid),
           ('00000000-0000-0000-0000-0000000a5b08'::uuid)$$,
  'holding the coach and the two players who were waiting');

-- ---------------------------------------------------------------------------
-- A team that already has a channel: the new member joins it, nobody else is touched
-- ---------------------------------------------------------------------------
UPDATE public.golf_team_members SET status = 'active'
  WHERE player_id = '00000000-0000-0000-0000-0000000a540a' AND team_id = '00000000-0000-0000-0000-0000000a5204';
SELECT ok(
  public.a5_in('00000000-0000-0000-0000-0000000a5500', '00000000-0000-0000-0000-0000000a5b0a') = 1
  AND public.a5_channels('00000000-0000-0000-0000-0000000a5204') = 1,
  'P10, set active on team Four, is in the channel made by hand; no second channel');
SELECT is(public.a5_in('00000000-0000-0000-0000-0000000a5500', '00000000-0000-0000-0000-0000000a5b04'), 0,
  'P4, active before and never added, is not pulled in: an existing channel is filled by the backfill, not here');

-- ---------------------------------------------------------------------------
-- The channel cannot be created: the roster and staff writes still succeed
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.a5_refuse_channel() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.team_id = '00000000-0000-0000-0000-0000000a5205' THEN
    RAISE EXCEPTION 'simulated failure creating a channel for team Five';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER a5_refuse_channel BEFORE INSERT ON public.golf_conversations
  FOR EACH ROW EXECUTE FUNCTION public.a5_refuse_channel();

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000a5c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000a5409', '00000000-0000-0000-0000-0000000a5205', 'active')$$,
  'with channel creation failing, the coach still adds P9 to team Five');
RESET ROLE;
SELECT lives_ok(
  $$INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-0000000a5205', '00000000-0000-0000-0000-0000000a5302')$$,
  'and C2 is still put on its staff');
SELECT is(
  (SELECT count(*)::int FROM public.golf_team_members
    WHERE player_id = '00000000-0000-0000-0000-0000000a5409' AND team_id = '00000000-0000-0000-0000-0000000a5205' AND status = 'active')
  + (SELECT count(*)::int FROM public.golf_team_coach_staff
    WHERE coach_id = '00000000-0000-0000-0000-0000000a5302' AND team_id = '00000000-0000-0000-0000-0000000a5205'),
  2, 'both rows are there');
SELECT is(public.a5_channels('00000000-0000-0000-0000-0000000a5205'), 0,
  'and team Five has no channel (the failure was a warning)');
DROP TRIGGER a5_refuse_channel ON public.golf_conversations;

-- ---------------------------------------------------------------------------
-- Nobody can call the function directly
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT helm_private.golf_ensure_team_channel('00000000-0000-0000-0000-0000000a5205')$$,
  '42501', NULL, 'an authenticated session cannot call golf_ensure_team_channel');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT helm_private.golf_ensure_team_channel('00000000-0000-0000-0000-0000000a5205')$$,
  '42501', NULL, 'nor can anon');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
