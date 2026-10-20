-- CoachHelm Slice 6a: golf_coachhelm_corrections
-- (20261020121000_golf_coachhelm_corrections.sql). The author reads their
-- own rows; a coach of the player's team reads the team's; super admins read
-- all. Inserts only as yourself (coach of the player's team, or the player on
-- their own read). No UPDATE or DELETE for authenticated; anon has nothing.

BEGIN;
\ir _helpers.sql

SELECT plan(11);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_corrections'::regclass),
  'RLS is enabled on golf_coachhelm_corrections'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_corrections') = 2,
  'exactly two policies (one SELECT, one INSERT)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_corrections'
      AND policyname = 'golf_coachhelm_corrections_select'
      AND cmd = 'SELECT'
      AND qual LIKE '%author_user_id%'
      AND qual LIKE '%is_golf_team_coach%'
      AND qual LIKE '%is_super_admin%'
  ),
  'SELECT admits the author, the team''s coaches and super admins'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_corrections'
      AND policyname = 'golf_coachhelm_corrections_insert_author'
      AND cmd = 'INSERT'
  ),
  'one INSERT policy'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_coachhelm_corrections',
    'golf_coachhelm_corrections_insert_author', 'auth.uid()'),
  'INSERT is only as yourself'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_coachhelm_corrections',
    'golf_coachhelm_corrections_insert_author', 'golf_coach_insights'),
  'INSERT requires the insight to belong to the player'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_coachhelm_corrections', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.golf_coachhelm_corrections', 'INSERT'),
  'anon cannot SELECT or INSERT'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_coachhelm_corrections', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_corrections', 'DELETE'),
  'authenticated cannot UPDATE or DELETE (append-only)'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.golf_coachhelm_corrections', 'INSERT')
  AND has_table_privilege('authenticated', 'public.golf_coachhelm_corrections', 'SELECT'),
  'authenticated can SELECT and INSERT (rows filtered by the policies)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_corrections'::regclass
      AND conname = 'golf_coachhelm_corrections_player_kinds'
      AND contype = 'c'
  ),
  'a player may only record not_this or confirm'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_corrections'::regclass
      AND conname = 'golf_coachhelm_corrections_reason_only_on_not_this'
      AND contype = 'c'
  ),
  'a reason chip only goes with not_this'
);

SELECT * FROM finish();
ROLLBACK;
