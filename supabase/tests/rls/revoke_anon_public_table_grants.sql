-- Contract for 20261007102000_revoke_anon_public_table_grants.sql.
--
-- anon must be able to do exactly three things on public relations and
-- nothing else:
--   1. INSERT into demo_requests (landing-page lead form, no read-back)
--   2. SELECT from organizations_public_profile
--   3. SELECT from baseball_teams_public_profile
--   4. SELECT from baseball_team_coach_staff_public
-- authenticated and service_role must be unchanged, and a table created
-- later must not come up with an anon grant.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

-- ----------------------------------------------------------------------------
-- A. The exhaustive check: every anon privilege left on a public relation is
--    one of the four allowed ones.
-- ----------------------------------------------------------------------------
SELECT is_empty(
  $$SELECT c.relname, a.privilege_type
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
      AND NOT (
        (c.relname = 'demo_requests' AND a.privilege_type = 'INSERT')
        OR (c.relname IN ('organizations_public_profile',
                          'baseball_teams_public_profile',
                          'baseball_team_coach_staff_public')
            AND a.privilege_type = 'SELECT')
      )$$,
  'anon holds no privilege on any public relation beyond the four allowed grants'
);

SELECT is_empty(
  $$SELECT 1 FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'S'
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')$$,
  'anon holds no privilege on any public sequence'
);

SELECT is_empty(
  $$SELECT 1 FROM pg_attribute at
    JOIN pg_class c ON c.oid = at.attrelid
    CROSS JOIN LATERAL aclexplode(at.attacl) a
    WHERE c.relnamespace = 'public'::regnamespace
      AND at.attacl IS NOT NULL
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')$$,
  'anon holds no column-level privilege in public'
);

SELECT is_empty(
  $$SELECT 1 FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      AND a.grantee = 0$$,
  'PUBLIC holds no privilege on any public relation'
);

-- ----------------------------------------------------------------------------
-- B. Default privileges
-- ----------------------------------------------------------------------------
SELECT is_empty(
  $$SELECT 1 FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace = 'public'::regnamespace
      AND d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND d.defaclobjtype IN ('r', 'S')
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')$$,
  'postgres default table and sequence privileges in public no longer grant anon anything (function defaults are out of scope)'
);

CREATE TABLE public.pgtap_anon_default_probe (id int);
CREATE SEQUENCE public.pgtap_anon_default_probe_seq;

SELECT ok(
  NOT has_table_privilege('anon', 'public.pgtap_anon_default_probe', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.pgtap_anon_default_probe', 'INSERT'),
  'a table created after the migration comes up with no anon grant'
);

SELECT ok(
  NOT has_sequence_privilege('anon', 'public.pgtap_anon_default_probe_seq', 'USAGE'),
  'a sequence created after the migration comes up with no anon grant'
);

-- ----------------------------------------------------------------------------
-- C. The legitimate anon paths still work, executed AS anon
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims TO '';

SELECT lives_ok(
  $$INSERT INTO public.demo_requests (email, interest_type, status)
    VALUES ('pgtap-anon-lead@helm.test', 'other', 'pending')$$,
  'anon can still submit the landing-page demo request'
);

SELECT throws_ok(
  $$SELECT count(*) FROM public.demo_requests$$,
  '42501',
  NULL,
  'anon cannot read demo_requests back'
);

SELECT lives_ok(
  $$SELECT count(*) FROM public.organizations_public_profile$$,
  'anon can read organizations_public_profile'
);

SELECT lives_ok(
  $$SELECT count(*) FROM public.baseball_teams_public_profile$$,
  'anon can read baseball_teams_public_profile'
);

SELECT lives_ok(
  $$SELECT count(*) FROM public.baseball_team_coach_staff_public$$,
  'anon can read baseball_team_coach_staff_public'
);

SELECT throws_ok(
  $$SELECT count(*) FROM public.golf_rounds$$,
  '42501',
  NULL,
  'anon can no longer touch golf_rounds'
);

SELECT throws_ok(
  $$SELECT count(*) FROM public.users$$,
  '42501',
  NULL,
  'anon can no longer touch users'
);

RESET ROLE;

-- ----------------------------------------------------------------------------
-- D. Nobody else lost anything
-- ----------------------------------------------------------------------------
SELECT ok(
  has_table_privilege('authenticated', 'public.golf_rounds', 'SELECT')
  AND has_table_privilege('authenticated', 'public.users', 'SELECT')
  AND has_table_privilege('service_role', 'public.golf_rounds', 'SELECT'),
  'authenticated and service_role keep their table grants'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.organizations_public_profile', 'SELECT'),
  'authenticated still reads the public profile view'
);

SELECT * FROM finish();
ROLLBACK;
