-- Contract for 20261007103000_document_public_profile_views_definer.sql.
-- The four public-profile views stay SECURITY DEFINER on purpose (their
-- consumers are cross-organisation or logged-out readers that base-table RLS
-- denies) and carry a comment that says so.

BEGIN;
\ir _helpers.sql

SELECT plan(6);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c
   JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('baseball_coaches_public', 'baseball_team_coach_staff_public',
                       'baseball_teams_public_profile', 'organizations_public_profile')
     AND d.description LIKE 'SECURITY DEFINER BY DESIGN%'),
  4,
  'all four public-profile views carry the by-design comment'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('baseball_coaches_public', 'baseball_team_coach_staff_public',
                       'baseball_teams_public_profile', 'organizations_public_profile')
     AND coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=false']),
  4,
  'the four views are still security_invoker = false (definer), as the consumers require'
);

-- A logged-out visitor can still read the organisation profile view: the base
-- table is authenticated-only, so this passes only because the view is definer.
INSERT INTO public.organizations (id, name, type)
VALUES ('00000000-0000-0000-0000-00000000f201', 'pgtap-view-org', 'college')
ON CONFLICT DO NOTHING;

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims TO '';

SELECT is(
  (SELECT count(*)::int FROM public.organizations_public_profile
   WHERE id = '00000000-0000-0000-0000-00000000f201'),
  1,
  'anon reads an organisation through the definer view'
);

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000f202", "role": "authenticated"}';

SELECT lives_ok(
  $$SELECT count(*) FROM public.baseball_coaches_public$$,
  'an authenticated user can read baseball_coaches_public'
);

SELECT lives_ok(
  $$SELECT count(*) FROM public.baseball_teams_public_profile$$,
  'an authenticated user can read baseball_teams_public_profile'
);

RESET ROLE;

SELECT lives_ok(
  $$SELECT count(*) FROM public.baseball_team_coach_staff_public$$,
  'baseball_team_coach_staff_public is readable'
);

SELECT * FROM finish();
ROLLBACK;
