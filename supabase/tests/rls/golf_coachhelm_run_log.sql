-- CoachHelm Slice 1: golf_coachhelm_run_log is admin-only
-- (20261020114500_golf_coachhelm_run_log.sql). The engine writes through
-- service_role; super admins may read; coaches, players and anon read and
-- write nothing.

BEGIN;
\ir _helpers.sql

SELECT plan(7);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_run_log'::regclass),
  'RLS is enabled on golf_coachhelm_run_log'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_run_log') = 1,
  'exactly one policy on golf_coachhelm_run_log'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_run_log'
      AND policyname = 'golf_coachhelm_run_log_select_super_admin'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_super_admin%'
  ),
  'the one policy is a SELECT gated on is_super_admin()'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_coachhelm_run_log', 'SELECT'),
  'anon cannot SELECT'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_coachhelm_run_log', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_run_log', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_run_log', 'DELETE'),
  'authenticated cannot INSERT, UPDATE or DELETE'
);

SELECT ok(
  has_table_privilege('service_role', 'public.golf_coachhelm_run_log', 'INSERT'),
  'service_role can INSERT (the engine writer)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_run_log'::regclass
      AND conname = 'golf_coachhelm_run_log_counts_ordered'
      AND contype = 'c'
  ),
  'counts must be ordered (testable <= candidates, supported <= testable)'
);

SELECT * FROM finish();
ROLLBACK;
