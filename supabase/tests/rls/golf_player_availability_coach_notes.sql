-- Clubhouse roster availability, the coach-only note
-- (20261022090000_golf_player_availability_coach_notes.sql). Policy-shape and
-- privilege contracts: RLS on; four policies, all for authenticated and all
-- gated on is_golf_team_coach(team_id); a note is only written as yourself for
-- a member of the team; anon and PUBLIC hold nothing. WRITTEN, NOT RUN where
-- it was authored (no Docker).

BEGIN;
\ir _helpers.sql

SELECT plan(12);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.golf_player_availability_coach_notes'::regclass),
  'RLS is enabled on golf_player_availability_coach_notes'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_player_availability_coach_notes'),
  4,
  'four policies: select, insert, update, delete'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_player_availability_coach_notes'
      AND roles = '{authenticated}'),
  4,
  'every policy is for authenticated only'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_player_availability_coach_notes'
      AND coalesce(qual, with_check) LIKE '%is_golf_team_coach%'),
  4,
  'every policy is gated on is_golf_team_coach'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_player_availability_coach_notes'
      AND policyname = 'golf_player_availability_coach_notes_select'
      AND cmd = 'SELECT'
      AND qual NOT LIKE '%is_team_player%'
  ),
  'SELECT admits coaches only (no teammate branch)'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_player_availability_coach_notes',
    'golf_player_availability_coach_notes_insert', 'auth.uid()'),
  'INSERT is only as yourself'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_player_availability_coach_notes',
    'golf_player_availability_coach_notes_insert', 'golf_team_members'),
  'INSERT is only for a member of the team'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_player_availability_coach_notes',
    'golf_player_availability_coach_notes_update', 'auth.uid()'),
  'UPDATE is only as yourself'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_player_availability_coach_notes', 'SELECT'),
  'anon cannot select'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_player_availability_coach_notes', 'INSERT'),
  'anon cannot insert'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.golf_player_availability_coach_notes', 'SELECT')
  AND has_table_privilege('authenticated', 'public.golf_player_availability_coach_notes', 'INSERT'),
  'authenticated holds the table grants the policies narrow'
);

SELECT ok(
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.golf_player_availability_coach_notes'::regclass
      AND conname = 'golf_player_availability_coach_notes_length') = 1,
  'the note is 1 to 280 characters'
);

SELECT * FROM finish();
ROLLBACK;
