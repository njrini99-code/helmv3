-- pgTAP contracts for 20261017003000_golf_participant_insert_tenancy.sql
-- (security review 2026-10-16, S8).
--
-- The creator of a fresh conversation could add ANY user id as a participant
-- (golf_participants_insert_v2, branch 2). Now the added user must be on the
-- conversation's team: an ACTIVE roster row or a staffed coach.
--
-- Behavioural, as the conversation's creator through request.jwt.claims, on
-- conversations with no participant yet, in the exact orders the app uses:
-- self then the others as a second statement (createConversation), and
-- everyone in one statement (createGolfTeamBroadcast).
--
-- Plan arithmetic: 2 structural + 7 behavioural = 9.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversation_participants'
      AND policyname = 'golf_participants_insert_v2'
      AND position('golf_user_in_conversation_team_audience' IN with_check) > 0
  ),
  'golf_participants_insert_v2 bounds the creator''s additions by team'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_user_in_conversation_team_audience(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_user_in_conversation_team_audience(uuid, uuid)', 'EXECUTE'),
  'the audience helper is not executable by anon, and is by authenticated'
);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000017003001', 'creator@tenancy.test',   'authenticated'),
    ('00000000-0000-0000-0000-000017003002', 'active@tenancy.test',    'authenticated'),
    ('00000000-0000-0000-0000-000017003003', 'inactive@tenancy.test',  'authenticated'),
    ('00000000-0000-0000-0000-000017003004', 'outsider@tenancy.test',  'authenticated'),
    ('00000000-0000-0000-0000-000017003005', 'orgcoach@tenancy.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000017003101', 'Tenancy Org',   'college'),
    ('00000000-0000-0000-0000-000017003102', 'Tenancy Other', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000017003201', 'Tenancy Team',  'TENA0001', '00000000-0000-0000-0000-000017003101'),
    ('00000000-0000-0000-0000-000017003202', 'Tenancy Other', 'TENA0002', '00000000-0000-0000-0000-000017003102')
  ON CONFLICT DO NOTHING;

  -- The creator is staffed; the org coach is in the same organization with no staff row.
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000017003301', '00000000-0000-0000-0000-000017003001', '00000000-0000-0000-0000-000017003101'),
    ('00000000-0000-0000-0000-000017003302', '00000000-0000-0000-0000-000017003005', '00000000-0000-0000-0000-000017003101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-000017003201', '00000000-0000-0000-0000-000017003301')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000017003401', '00000000-0000-0000-0000-000017003002', 'Act',  'Ive'),
    ('00000000-0000-0000-0000-000017003402', '00000000-0000-0000-0000-000017003003', 'In',   'Active'),
    ('00000000-0000-0000-0000-000017003403', '00000000-0000-0000-0000-000017003004', 'Out',  'Sider')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000017003201', '00000000-0000-0000-0000-000017003401', 'active'),
    ('00000000-0000-0000-0000-000017003201', '00000000-0000-0000-0000-000017003402', 'inactive'),
    ('00000000-0000-0000-0000-000017003202', '00000000-0000-0000-0000-000017003403', 'active')
  ON CONFLICT DO NOTHING;

  -- Four fresh conversations on the team, created by the coach, no participants.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-000017003501', '00000000-0000-0000-0000-000017003001', '00000000-0000-0000-0000-000017003201', false, NULL),
    ('00000000-0000-0000-0000-000017003502', '00000000-0000-0000-0000-000017003001', '00000000-0000-0000-0000-000017003201', false, NULL),
    ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003001', '00000000-0000-0000-0000-000017003201', true,  'Everyone'),
    ('00000000-0000-0000-0000-000017003504', '00000000-0000-0000-0000-000017003001', '00000000-0000-0000-0000-000017003201', false, NULL)
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017003001", "role": "authenticated"}';

-- The attack: a fresh DM, self first (branch 1), then someone from another program.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000017003501', '00000000-0000-0000-0000-000017003001')$$,
  'the creator adds themself to a fresh conversation'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000017003501', '00000000-0000-0000-0000-000017003004')$$,
  '42501', NULL,
  'the creator CANNOT add a user who is not on the conversation''s team'
);

-- The DM the app creates: self, then the teammate as a second statement.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-000017003502', '00000000-0000-0000-0000-000017003001');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-000017003502', '00000000-0000-0000-0000-000017003002')$$,
  'a DM with a player on the team is still created (self, then the other)'
);

-- A broadcast that names an inactive roster row is refused whole (the app's
-- broadcast reads active members only; a former player must not read the chat).
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003001'),
      ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003002'),
      ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003003')$$,
  '42501', NULL,
  'the creator CANNOT add a player whose roster row is inactive'
);

-- The broadcast the app creates: the active roster in one statement.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
      ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003001'),
      ('00000000-0000-0000-0000-000017003503', '00000000-0000-0000-0000-000017003002')$$,
  'an all-players broadcast of the active roster is still created in one statement'
);

-- The documented gap against the app's audience: an organization coach with no staff row.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000017003504', '00000000-0000-0000-0000-000017003001')$$,
  'the creator adds themself to another fresh conversation'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000017003504', '00000000-0000-0000-0000-000017003005')$$,
  '42501', NULL,
  'an organization coach with no staff row on the team is not addable (staff rows are the tenancy the database trusts)'
);

RESET role;
SELECT * FROM finish();
ROLLBACK;
