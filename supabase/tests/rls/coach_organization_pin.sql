-- Contract for 20261016200000_coach_organization_pin.sql (S1).
-- A signed-in account can no longer make itself a coach of someone else's
-- organization, delete a shared program, or put a baseball team in another
-- organization; onboarding, server-side joins and leaving a program still work.

BEGIN;
\ir _helpers.sql

SELECT plan(22);

-- Fixtures, as the migration owner (RLS and the guard do not apply).
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c1a01', 'pgtap-s1-attacker@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a02', 'pgtap-s1-head@helm.test',      'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a03', 'pgtap-s1-assistant@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a04', 'pgtap-s1-newcoach@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a05', 'pgtap-s1-bbattacker@helm.test','authenticated'),
    ('00000000-0000-0000-0000-0000000c1a06', 'pgtap-s1-sole@helm.test',      'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a07', 'pgtap-s1-bbvictim@helm.test',  'authenticated'),
    ('00000000-0000-0000-0000-0000000c1a08', 'pgtap-s1-fresh@helm.test',     'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c1a01', 'pgtap-s1-attacker@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000c1a02', 'pgtap-s1-head@helm.test',      'coach'),
    ('00000000-0000-0000-0000-0000000c1a03', 'pgtap-s1-assistant@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000c1a04', 'pgtap-s1-newcoach@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000c1a05', 'pgtap-s1-bbattacker@helm.test','coach'),
    ('00000000-0000-0000-0000-0000000c1a06', 'pgtap-s1-sole@helm.test',      'coach'),
    ('00000000-0000-0000-0000-0000000c1a07', 'pgtap-s1-bbvictim@helm.test',  'coach'),
    ('00000000-0000-0000-0000-0000000c1a08', 'pgtap-s1-fresh@helm.test',     'coach')
  -- The auth.users insert above may already have made these rows as players.
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- V: an established golf program with a head coach and an assistant.
  -- S: a program with one coach. O: an empty organization made an hour ago.
  -- BV: an established baseball program.
  INSERT INTO public.organizations (id, name, type, created_at) VALUES
    ('00000000-0000-0000-0000-0000000c1b01', 'pgTAP S1 Victim U',  'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b02', 'pgTAP S1 Sole U',    'college', now() - interval '30 days'),
    ('00000000-0000-0000-0000-0000000c1b03', 'pgTAP S1 Old Empty', 'college', now() - interval '1 hour'),
    ('00000000-0000-0000-0000-0000000c1b04', 'pgTAP S1 Baseball U','college', now() - interval '30 days');

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c1c01', '00000000-0000-0000-0000-0000000c1a01', NULL),
    ('00000000-0000-0000-0000-0000000c1c02', '00000000-0000-0000-0000-0000000c1a02', '00000000-0000-0000-0000-0000000c1b01'),
    ('00000000-0000-0000-0000-0000000c1c03', '00000000-0000-0000-0000-0000000c1a03', '00000000-0000-0000-0000-0000000c1b01'),
    ('00000000-0000-0000-0000-0000000c1c06', '00000000-0000-0000-0000-0000000c1a06', '00000000-0000-0000-0000-0000000c1b02');

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c1c05', '00000000-0000-0000-0000-0000000c1a05', 'college', NULL),
    ('00000000-0000-0000-0000-0000000c1c07', '00000000-0000-0000-0000-0000000c1a07', 'college', '00000000-0000-0000-0000-0000000c1b04');
END $$;

-- A definer function stands in for server-side joins (baseball_accept_staff_invite).
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
END $$;

-- ── The attack, golf ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a01", "role": "authenticated"}';

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b01'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL,
  'a coach cannot move their own row into an established program'
);

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b03'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL,
  'a coach cannot claim an empty organization that is not freshly made'
);

SELECT lives_ok(
  $$UPDATE public.golf_coaches SET full_name = 'Renamed' WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'a coach can still edit their own name'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a08", "role": "authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a08', '00000000-0000-0000-0000-0000000c1b01')$$,
  '42501', NULL,
  'a new account cannot create a coach row in an established program'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a08', NULL)$$,
  'a new account can still create a coach row with no program'
);

-- ── Onboarding: create a program, then coach it ────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a04", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b05', 'pgTAP S1 New Program', 'college')$$,
  'onboarding: a coach can create an organization'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (id, user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1c04', '00000000-0000-0000-0000-0000000c1a04', '00000000-0000-0000-0000-0000000c1b05')$$,
  'onboarding: the coach row can point at the program just created'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_coaches (user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-0000000c1a04', '00000000-0000-0000-0000-0000000c1b05')
    ON CONFLICT (user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id$$,
  'onboarding: the upsert onboarding runs, repeated, keeps the same program'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a01", "role": "authenticated"}';

SELECT throws_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b05'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  '42501', NULL,
  'a fresh program stops being claimable once it has a coach'
);

-- ── Server-side joins are not the guard's business ─────────────────────────
SELECT lives_ok(
  $$SELECT pg_temp.definer_join('00000000-0000-0000-0000-0000000c1c01', '00000000-0000-0000-0000-0000000c1b01')$$,
  'a SECURITY DEFINER function can still attach a coach (invite acceptance)'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b02'
    WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'the service role can still attach a coach (golf staff invites)'
);
SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = NULL WHERE id = '00000000-0000-0000-0000-0000000c1c01'$$,
  'the service role can still detach a coach (declining a request)'
);

-- ── Deleting an organization ────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a03", "role": "authenticated"}';

SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b01'), 0,
  'an assistant cannot delete a program other coaches share');

SELECT lives_ok(
  $$UPDATE public.golf_coaches SET organization_id = NULL WHERE id = '00000000-0000-0000-0000-0000000c1c03'$$,
  'a coach can still leave their program'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a06", "role": "authenticated"}';

SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b02'), 1,
  'the sole coach of a program can still delete it');

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a04", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b06', 'pgTAP S1 Rolled Back', 'college')$$,
  'onboarding rollback: an organization is created'
);
SELECT is(pg_temp.delete_org('00000000-0000-0000-0000-0000000c1b06'), 1,
  'onboarding rollback: a fresh organization nobody coaches can be deleted');

-- ── The attack, baseball (the lifting bridge made it Lift Lab edit access) ──
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c1a05", "role": "authenticated"}';

SELECT throws_ok(
  $$UPDATE public.baseball_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b04'
    WHERE id = '00000000-0000-0000-0000-0000000c1c05'$$,
  '42501', NULL,
  'a baseball coach cannot move their own row into an established program'
);

SELECT lives_ok(
  $$INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000c1b07', 'pgTAP S1 New Baseball', 'college')$$,
  'baseball onboarding: a coach can create an organization'
);
SELECT lives_ok(
  $$UPDATE public.baseball_coaches SET organization_id = '00000000-0000-0000-0000-0000000c1b07'
    WHERE id = '00000000-0000-0000-0000-0000000c1c05'$$,
  'baseball onboarding: the coach row can point at the program just created'
);

SELECT throws_ok(
  $$INSERT INTO public.baseball_teams (name, team_type, join_code, organization_id)
    VALUES ('pgTAP S1 Planted', 'college', 'PGS1PLNT', '00000000-0000-0000-0000-0000000c1b04')$$,
  '42501', NULL,
  'a baseball coach cannot create a team in another organization'
);

SELECT lives_ok(
  $$INSERT INTO public.baseball_teams (name, team_type, join_code, organization_id)
    VALUES ('pgTAP S1 Own', 'college', 'PGS1OWNT', '00000000-0000-0000-0000-0000000c1b07')$$,
  'a baseball coach can still create a team in their own organization'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
