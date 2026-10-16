-- Contract for 20261016200000_coach_organization_pin.sql (S1).
-- A signed-in account can no longer make itself a coach of someone else's
-- organization (golf, baseball or Lift Lab, including by racing a program's
-- onboarding or inviting itself), reactivate a removed Lift Lab coach, delete a
-- shared program, or put a baseball team in another organization. Onboarding,
-- server-side joins, invites by a head coach and leaving a program still work.

BEGIN;
\ir _helpers.sql

SELECT plan(46);

-- Users: a attacker · b head coach of V · b2 assistant in V · c new golf coach
-- d baseball attacker · e sole coach of S · bb baseball coach of BV · f fresh
-- account · l Lift Lab coach · r removed Lift Lab coach · g golf coach of mixed M
-- · m baseball coach of mixed M.
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-0000000c1a01'::uuid, 'pgtap-s1-a@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a02'::uuid, 'pgtap-s1-b@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a03'::uuid, 'pgtap-s1-b2@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a04'::uuid, 'pgtap-s1-c@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a05'::uuid, 'pgtap-s1-d@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a06'::uuid, 'pgtap-s1-e@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a07'::uuid, 'pgtap-s1-bb@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a08'::uuid, 'pgtap-s1-f@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a09'::uuid, 'pgtap-s1-l@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a10'::uuid, 'pgtap-s1-r@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a11'::uuid, 'pgtap-s1-g@helm.test'),
    ('00000000-0000-0000-0000-0000000c1a12'::uuid, 'pgtap-s1-m@helm.test')
  ) AS t(id, email) LOOP
    INSERT INTO auth.users (id, email, role) VALUES (u.id, u.email, 'authenticated') ON CONFLICT DO NOTHING;
    -- The auth.users insert may already have made the row as a player.
    INSERT INTO public.users (id, email, role) VALUES (u.id, u.email, 'coach')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  END LOOP;

  -- Organizations made outside the client (no created_by), as server code does.
  INSERT INTO public.organizations (id, name, type, created_at) VALUES
    ('00000000-0000-0000-0000-0000000c1b01', 'pgTAP S1 Victim U',    'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b02', 'pgTAP S1 Sole U',      'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b03', 'pgTAP S1 Old Empty',   'college', now() - interval '1 hour'),
    ('00000000-0000-0000-0000-0000000c1b04', 'pgTAP S1 Baseball U',  'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b08', 'pgTAP S1 Lift U',      'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b09', 'pgTAP S1 Lift U2',     'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b0a', 'pgTAP S1 Mixed U',     'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b0c', 'pgTAP S1 Fresh Empty', 'college', now()),
    ('00000000-0000-0000-0000-0000000c1b0d', 'pgTAP S1 Server Fresh','college', now());

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c1c01', '00000000-0000-0000-0000-0000000c1a01', NULL),
    ('00000000-0000-0000-0000-0000000c1c02', '00000000-0000-0000-0000-0000000c1a02', '00000000-0000-0000-0000-0000000c1b01'),
    ('00000000-0000-0000-0000-0000000c1c03', '00000000-0000-0000-0000-0000000c1a03', '00000000-0000-0000-0000-0000000c1b01'),
    ('00000000-0000-0000-0000-0000000c1c06', '00000000-0000-0000-0000-0000000c1a06', '00000000-0000-0000-0000-0000000c1b02'),
    ('00000000-0000-0000-0000-0000000c1c0b', '00000000-0000-0000-0000-0000000c1a11', '00000000-0000-0000-0000-0000000c1b0a');

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c1c05', '00000000-0000-0000-0000-0000000c1a05', 'college', NULL),
    ('00000000-0000-0000-0000-0000000c1c07', '00000000-0000-0000-0000-0000000c1a07', 'college', '00000000-0000-0000-0000-0000000c1b04'),
    ('00000000-0000-0000-0000-0000000c1c0c', '00000000-0000-0000-0000-0000000c1a12', 'college', '00000000-0000-0000-0000-0000000c1b0a');

  INSERT INTO public.helm_lifting_coaches (id, user_id, organization_id, status, onboarding_completed) VALUES
    ('00000000-0000-0000-0000-0000000c1c09', '00000000-0000-0000-0000-0000000c1a09', '00000000-0000-0000-0000-0000000c1b08', 'active', true),
    ('00000000-0000-0000-0000-0000000c1c10', '00000000-0000-0000-0000-0000000c1a10', '00000000-0000-0000-0000-0000000c1b09', 'removed', true);

  -- b is the primary coach of a golf team in V (may invite a Lift Lab coach).
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c1e01', 'pgTAP S1 Victim Golf', 'PGS1VICT', '00000000-0000-0000-0000-0000000c1b01');
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    ('00000000-0000-0000-0000-0000000c1e01', '00000000-0000-0000-0000-0000000c1c02', 'head_coach', true);

  -- The program switched bb's Lift Lab edit access off.
  UPDATE public.helm_lifting_org_viewers SET can_edit = false
  WHERE user_id = '00000000-0000-0000-0000-0000000c1a07' AND organization_id = '00000000-0000-0000-0000-0000000c1b04';
END $$;

-- A definer function stands in for server-side joins (invite acceptance).
CREATE FUNCTION pg_temp.definer_join(p_coach uuid, p_org uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.golf_coaches SET organization_id = p_org WHERE id = p_coach;
$$;

CREATE FUNCTION pg_temp.delete_org(p_org uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.organizations WHERE id = p_org;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END $$;

CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
END $$;

-- ── Golf: the attack ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a01');

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b01'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL, 'a coach cannot move their own row into an established program');

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b03'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL, 'a coach cannot claim an empty organization that is not freshly made');

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b0d'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL, 'a coach cannot race onto a program the server just created');

SELECT lives_ok(
  $$UPDATE public.golf_coaches SET full_name = 'Renamed' WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'a coach can still edit their own name');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a08');

SELECT throws_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a08', '00000000-0000-0000-0000-0000000c1b01')$$,
  '42501', NULL, 'a new account cannot create a coach row in an established program');

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a08', NULL)$$,
  'a new account can still create a coach row with no program');

-- ── Golf onboarding: create a program, then coach it ───────────────────────
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a04');

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type, created_by, created_at)
    VALUES ('00000000-0000-0000-0000-0000000c1b05', 'pgTAP S1 New Program', 'college',
            '00000000-0000-0000-0000-0000000c1a01', now() + interval '10 years')$$,
  'onboarding: a coach can create an organization');

SELECT is(
  (SELECT created_by FROM public.organizations WHERE id = '00000000-0000-0000-0000-0000000c1b05'),
  '00000000-0000-0000-0000-0000000c1a04'::uuid,
  'the organization records its real creator, whatever the client sent');

SELECT ok(
  (SELECT created_at <= now() FROM public.organizations WHERE id = '00000000-0000-0000-0000-0000000c1b05'),
  'the client cannot date an organization into the future');

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (id, user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1c04', '00000000-0000-0000-0000-0000000c1a04', '00000000-0000-0000-0000-0000000c1b05')$$,
  'onboarding: the coach row can point at the program just created');

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a04', '00000000-0000-0000-0000-0000000c1b05')
    ON CONFLICT (user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id$$,
  'onboarding: the upsert onboarding runs, repeated, keeps the same program');

SELECT lives_ok(
  $$UPDATE public.organizations SET name = 'pgTAP S1 New Program Renamed', created_at = now() - interval '1 day',
      created_by = '00000000-0000-0000-0000-0000000c1a01'
    WHERE id = '00000000-0000-0000-0000-0000000c1b05'$$,
  'a coach can still edit their own organization');

SELECT is(
  (SELECT created_by::text || ' ' || (created_at > now() - interval '1 minute')::text
   FROM public.organizations WHERE id = '00000000-0000-0000-0000-0000000c1b05'),
  '00000000-0000-0000-0000-0000000c1a04 true',
  'an update cannot rewrite who created an organization or when');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a01');

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b05'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL, 'nobody else can claim a program someone else just created');

SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b05'), 0,
  'a stranger cannot delete a program in its first minutes');

-- ── Server-side joins are not the guards' business ─────────────────────────
SELECT lives_ok(
  $$SELECT pg_temp.definer_join('00000000-0000-0000-0000-0000000c1c01', '00000000-0000-0000-0000-0000000c1b01')$$,
  'a SECURITY DEFINER function can still attach a coach');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b02'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'the service role can still attach a coach (golf staff invites)');
SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = NULL WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'the service role can still detach a coach (declining a request)');

-- ── Deleting an organization ────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a03');

SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b01'), 0,
  'an assistant cannot delete a program other coaches share');

SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = NULL WHERE id = '00000000-0000-0000-0000-0000000c1c03'$$,
  'a coach can still leave their program');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a06');
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b02'), 1,
  'the sole coach of a program can still delete it');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a11');
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b0a'), 0,
  'the only golf coach cannot delete a program a baseball coach shares');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a04');
SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b06', 'pgTAP S1 Rolled Back', 'college')$$,
  'onboarding rollback: an organization is created');
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b06'), 1,
  'onboarding rollback: its creator can delete it while nobody coaches it');

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b07', 'pgTAP S1 Has Baseball', 'college')$$,
  'a second fresh organization is created');
RESET ROLE;
INSERT INTO public.baseball_coaches (user_id, coach_type, organization_id)
VALUES ('00000000-0000-0000-0000-0000000c1a10', 'college', '00000000-0000-0000-0000-0000000c1b07');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a04');
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b07'), 0,
  'its creator cannot delete a fresh organization once a baseball coach is in it');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role": "anon"}', true);
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b0c'), 0,
  'anon cannot delete a fresh organization');

-- ── Baseball ────────────────────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a05');

SELECT throws_ok(
  $$UPDATE public.baseball_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b04'
    WHERE id = '00000000-0000-0000-0000-0000000c1c05'$$,
  '42501', NULL, 'a baseball coach cannot move their own row into an established program');

SELECT throws_ok(
  $$UPDATE public.baseball_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b0d'
    WHERE id = '00000000-0000-0000-0000-0000000c1c05'$$,
  '42501', NULL, 'a baseball coach cannot race onto a program the server just created');

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b0e', 'pgTAP S1 Own Baseball', 'college')$$,
  'a baseball coach can create an organization');
SELECT lives_ok(
  $$UPDATE public.baseball_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b0e'
    WHERE id = '00000000-0000-0000-0000-0000000c1c05'$$,
  'a baseball coach can point their row at the program they just created');

SELECT throws_ok(
  $$INSERT INTO public.baseball_teams (name, team_type, join_code, organization_id)
    VALUES ('pgTAP S1 Planted', 'college', 'PGS1PLNT', '00000000-0000-0000-0000-0000000c1b04')$$,
  '42501', NULL, 'a baseball coach cannot create a team in another organization');

SELECT lives_ok(
  $$INSERT INTO public.baseball_teams (id, name, team_type, join_code, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1d01', 'pgTAP S1 Own', 'college', 'PGS1OWNT', '00000000-0000-0000-0000-0000000c1b0e')$$,
  'a baseball coach can still create a team in their own organization');

RESET ROLE;
INSERT INTO public.baseball_team_coach_staff (team_id, coach_id, role, is_primary, is_head_coach)
VALUES ('00000000-0000-0000-0000-0000000c1d01', '00000000-0000-0000-0000-0000000c1c05', 'head_coach', true, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a05');

SELECT throws_ok(
  $$UPDATE public.baseball_teams SET organization_id = '00000000-0000-0000-0000-0000000c1b04'
    WHERE id = '00000000-0000-0000-0000-0000000c1d01'$$,
  '42501', NULL, 'a baseball coach cannot move their team into another organization');
SELECT lives_ok(
  $$UPDATE public.baseball_teams SET name = 'pgTAP S1 Own Renamed' WHERE id = '00000000-0000-0000-0000-0000000c1d01'$$,
  'a baseball coach can still edit their own team');

-- The bridge no longer re-grants Lift Lab edit access on a no-op update.
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a07');
SELECT lives_ok(
  $$UPDATE public.baseball_coaches SET organization_id = organization_id
    WHERE id = '00000000-0000-0000-0000-0000000c1c07'$$,
  'a baseball coach can save their row unchanged');
RESET ROLE;
SELECT is(
  (SELECT can_edit FROM public.helm_lifting_org_viewers
   WHERE user_id = '00000000-0000-0000-0000-0000000c1a07' AND organization_id = '00000000-0000-0000-0000-0000000c1b04'),
  false,
  'an unchanged save does not switch Lift Lab edit access back on');

-- ── Lift Lab ────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a09');

SELECT throws_ok(
  $$UPDATE public.helm_lifting_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b01'
    WHERE id = '00000000-0000-0000-0000-0000000c1c09'$$,
  '42501', NULL, 'a Lift Lab coach cannot move their row into another organization');
SELECT lives_ok(
  $$UPDATE public.helm_lifting_coaches SET title = 'Strength coach' WHERE id = '00000000-0000-0000-0000-0000000c1c09'$$,
  'a Lift Lab coach can still edit their own profile');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a10');
SELECT throws_ok(
  $$UPDATE public.helm_lifting_coaches SET status = 'active' WHERE id = '00000000-0000-0000-0000-0000000c1c10'$$,
  '42501', NULL, 'a removed Lift Lab coach cannot reactivate themselves');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a01');
SELECT throws_ok(
  $$INSERT INTO public.helm_lifting_coach_invites (organization_id, email, invited_by_user_id, invited_by_sport)
    VALUES ('00000000-0000-0000-0000-0000000c1b01', 'pgtap-s1-a@helm.test', '00000000-0000-0000-0000-0000000c1a01', 'golf')$$,
  '42501', NULL, 'an account cannot invite itself to coach Lift Lab for another organization');

SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a02');
SELECT lives_ok(
  $$INSERT INTO public.helm_lifting_coach_invites (id, organization_id, email, invited_by_user_id, invited_by_sport)
    VALUES ('00000000-0000-0000-0000-0000000c1f01', '00000000-0000-0000-0000-0000000c1b01', 'pgtap-s1-l@helm.test',
            '00000000-0000-0000-0000-0000000c1a02', 'golf')$$,
  'a golf head coach can still invite a Lift Lab coach to their organization');

-- d heads a baseball team in their own program: they may invite themselves
-- there, and see that invite (it carries their email), but not move it.
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a05');
SELECT lives_ok(
  $$INSERT INTO public.helm_lifting_coach_invites (id, organization_id, email, invited_by_user_id, invited_by_sport)
    VALUES ('00000000-0000-0000-0000-0000000c1f02', '00000000-0000-0000-0000-0000000c1b0e', 'pgtap-s1-d@helm.test',
            '00000000-0000-0000-0000-0000000c1a05', 'baseball')$$,
  'a baseball head coach can invite a Lift Lab coach to their own organization');
SELECT throws_ok(
  $$UPDATE public.helm_lifting_coach_invites SET organization_id = '00000000-0000-0000-0000-0000000c1b01'
    WHERE id = '00000000-0000-0000-0000-0000000c1f02'$$,
  '42501', NULL, 'an invite cannot be moved to an organization the inviter may not invite to');

-- An assistant from another program (no organization on their coach row) who
-- marks their own staff row head coach still may not invite: the app's rule
-- also needs the coach row in the organization.
RESET ROLE;
INSERT INTO public.baseball_coaches (id, user_id, coach_type, organization_id)
VALUES ('00000000-0000-0000-0000-0000000c1c11', '00000000-0000-0000-0000-0000000c1a08', 'college', NULL);
INSERT INTO public.baseball_team_coach_staff (team_id, coach_id, role, is_primary, is_head_coach)
VALUES ('00000000-0000-0000-0000-0000000c1d01', '00000000-0000-0000-0000-0000000c1c11', 'assistant', false, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000c1a08');
SELECT throws_ok(
  $$INSERT INTO public.helm_lifting_coach_invites (organization_id, email, invited_by_user_id, invited_by_sport)
    VALUES ('00000000-0000-0000-0000-0000000c1b0e', 'pgtap-s1-f@helm.test', '00000000-0000-0000-0000-0000000c1a08', 'baseball')$$,
  '42501', NULL, 'a self-promoted assistant from outside the organization cannot invite');

RESET ROLE;
SELECT ok(
  (SELECT bool_and(with_check LIKE '%helm_lifting_can_invite_coach%') AND count(*) = 2
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'helm_lifting_coach_invites'
     AND policyname IN ('hlci_insert', 'hlci_update')),
  'both Lift Lab invite write policies check the inviter may invite to the organization');

SELECT * FROM finish();
ROLLBACK;
