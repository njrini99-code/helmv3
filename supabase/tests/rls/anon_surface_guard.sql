-- pgTAP guard for the anonymous (publishable key) surface, written with
-- 20261023100000_graveyard_grants_and_function_default_anon.sql.
--
-- Helm-Production on 2026-10-23: anon can execute zero SECURITY DEFINER
-- functions in public (20260905100000 and the per-function REVOKE rule in
-- .claude/rules/database.md got it there). New functions still inherit
-- Postgres's built-in PUBLIC EXECUTE, so the only thing that keeps the count
-- at zero is each migration remembering its REVOKE. This suite fails the
-- moment one forgets. It also pins the two grant cleanups of 20261023100000.

BEGIN;
\ir _helpers.sql

SELECT plan(3);

SELECT is(
  ARRAY(
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'anon cannot execute any SECURITY DEFINER function in public (REVOKE EXECUTE ... FROM PUBLIC, anon in the migration that creates it)'
);

SELECT is(
  ARRAY(
    SELECT DISTINCT c.relname::text || ' -> ' || r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE c.relnamespace = to_regnamespace('graveyard')
      AND r.rolname IN ('anon', 'authenticated')
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'no graveyard relation carries a grant to anon or authenticated'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype = 'f'
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
  ),
  'new functions postgres creates in public are not granted to anon by default'
);

SELECT * FROM finish();
ROLLBACK;
