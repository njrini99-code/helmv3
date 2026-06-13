-- pgTAP contracts for the Cloud Course Library Phase 1 backend
-- (migrations 20260613160000_course_library_phase1 + 20260613160100_normalize_fix).
--
-- Schema-light assertions (no seeded data) over pg_class / pg_policies /
-- pg_attribute / information_schema, plus golf_normalize_name() behavior.
--
-- If any of these fail, a later migration has weakened the library's security
-- contract (anon exposure, missing RLS, lost attribution) or broken the dedup
-- key the whole library depends on. Treat anon/RLS regressions as P1.

BEGIN;
\ir _helpers.sql

SELECT plan(37);

-- ============================================================================
-- A. RLS enabled on every new table (5)
-- ============================================================================
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_course_tees'::regclass),
  'RLS enabled on golf_course_tees');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_course_tee_holes'::regclass),
  'RLS enabled on golf_course_tee_holes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_team_saved_courses'::regclass),
  'RLS enabled on golf_team_saved_courses');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_course_edit_history'::regclass),
  'RLS enabled on golf_course_edit_history');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_course_tee_edit_history'::regclass),
  'RLS enabled on golf_course_tee_edit_history');

-- ============================================================================
-- B. anon has NO table privileges (REVOKE ALL FROM anon) (5)
-- ============================================================================
SELECT isnt(has_table_privilege('anon', 'public.golf_course_tees', 'SELECT'), true,
  'anon cannot SELECT golf_course_tees');
SELECT isnt(has_table_privilege('anon', 'public.golf_course_tee_holes', 'SELECT'), true,
  'anon cannot SELECT golf_course_tee_holes');
SELECT isnt(has_table_privilege('anon', 'public.golf_team_saved_courses', 'SELECT'), true,
  'anon cannot SELECT golf_team_saved_courses');
SELECT isnt(has_table_privilege('anon', 'public.golf_course_edit_history', 'SELECT'), true,
  'anon cannot SELECT golf_course_edit_history');
SELECT isnt(has_table_privilege('anon', 'public.golf_course_tee_edit_history', 'SELECT'), true,
  'anon cannot SELECT golf_course_tee_edit_history');

-- ============================================================================
-- C. authenticated CAN SELECT the library tables (grant exists; RLS gates rows) (5)
-- ============================================================================
SELECT ok(has_table_privilege('authenticated', 'public.golf_course_tees', 'SELECT'),
  'authenticated has SELECT grant on golf_course_tees');
SELECT ok(has_table_privilege('authenticated', 'public.golf_course_tee_holes', 'SELECT'),
  'authenticated has SELECT grant on golf_course_tee_holes');
SELECT ok(has_table_privilege('authenticated', 'public.golf_team_saved_courses', 'SELECT'),
  'authenticated has SELECT grant on golf_team_saved_courses');
SELECT ok(has_table_privilege('authenticated', 'public.golf_course_edit_history', 'SELECT'),
  'authenticated has SELECT grant on golf_course_edit_history');
SELECT ok(has_table_privilege('authenticated', 'public.golf_course_tee_edit_history', 'SELECT'),
  'authenticated has SELECT grant on golf_course_tee_edit_history');

-- ============================================================================
-- D. golf_normalize_name execute privileges (3)
-- ============================================================================
SELECT isnt(has_function_privilege('anon', 'public.golf_normalize_name(text)', 'EXECUTE'), true,
  'anon cannot execute golf_normalize_name');
SELECT ok(has_function_privilege('authenticated', 'public.golf_normalize_name(text)', 'EXECUTE'),
  'authenticated can execute golf_normalize_name');
SELECT ok(has_function_privilege('service_role', 'public.golf_normalize_name(text)', 'EXECUTE'),
  'service_role can execute golf_normalize_name');

-- ============================================================================
-- E. golf_normalize_name dedup behavior — the key the library depends on (7)
--    All "Pinehurst N" spellings collapse to one key; real words keep "No".
-- ============================================================================
SELECT is(public.golf_normalize_name('Pinehurst No. 2'), 'pinehurst 2',
  'normalize: "No. 2" (dot + space) collapses');
SELECT is(public.golf_normalize_name('Pinehurst #2'), 'pinehurst 2',
  'normalize: "#2" collapses');
SELECT is(public.golf_normalize_name('Pinehurst Number 2'), 'pinehurst 2',
  'normalize: "Number 2" collapses');
SELECT is(public.golf_normalize_name('Pinehurst 2'), 'pinehurst 2',
  'normalize: bare "2" is the canonical key');
SELECT is(public.golf_normalize_name('  PINEHURST   No.  2  '), 'pinehurst 2',
  'normalize: case + extra whitespace + "No." all normalize');
SELECT is(public.golf_normalize_name('Northwood Country Club'), 'northwood country club',
  'normalize: "No" inside "Northwood" is NOT stripped');
SELECT is(public.golf_normalize_name('Mauna Kea No 1'), 'mauna kea 1',
  'normalize: bare word "No" (no dot) is stripped');

-- ============================================================================
-- F. Open-contribution attribution is enforced in WITH CHECK (5)
-- ============================================================================
SELECT ok(tests.policy_with_check_contains('public','golf_course_tees','golf_course_tees_insert','created_by_user_id'),
  'tees insert WITH CHECK references created_by_user_id');
SELECT ok(tests.policy_with_check_contains('public','golf_course_tees','golf_course_tees_insert','auth.uid()'),
  'tees insert WITH CHECK pins created_by_user_id to auth.uid()');
SELECT ok(tests.policy_with_check_contains('public','golf_course_tees','golf_course_tees_update','last_edited_by_user_id'),
  'tees update WITH CHECK references last_edited_by_user_id');
SELECT ok(tests.policy_with_check_contains('public','golf_course_edit_history','golf_course_edit_history_insert','edited_by_user_id'),
  'course edit-history insert WITH CHECK pins edited_by_user_id');
SELECT ok(tests.policy_with_check_contains('public','golf_course_tee_edit_history','golf_course_tee_edit_history_insert','edited_by_user_id'),
  'tee edit-history insert WITH CHECK pins edited_by_user_id');

-- ============================================================================
-- G. Soft-delete + append-only: no destructive policies (3)
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='golf_course_tees' AND cmd='DELETE'), 0,
  'golf_course_tees has NO DELETE policy (soft-delete via deleted_at only)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='golf_course_edit_history' AND cmd IN ('UPDATE','DELETE')), 0,
  'course edit-history is append-only (no UPDATE/DELETE policy)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='golf_course_tee_edit_history' AND cmd IN ('UPDATE','DELETE')), 0,
  'tee edit-history is append-only (no UPDATE/DELETE policy)');

-- ============================================================================
-- H. Team-saved is team-scoped via the coach helper (1)
-- ============================================================================
SELECT ok(tests.policy_with_check_contains('public','golf_team_saved_courses','golf_team_saved_courses_write','is_golf_team_coach'),
  'team-saved write WITH CHECK is gated by is_golf_team_coach(team_id)');

-- ============================================================================
-- I. Schema spine: round linkage + dedup unique guards (3)
-- ============================================================================
SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='golf_rounds' AND column_name='tee_id'),
  'golf_rounds.tee_id column exists (rounds can reference a tee for defaults)');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
            WHERE schemaname='public' AND indexname='golf_course_tees_course_norm_uidx'),
  'unique index on (course_id, normalized_tee_name) exists for active tees');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
            WHERE schemaname='public' AND indexname='golf_team_saved_courses_team_course_uidx'),
  'unique index on (team_id, course_id) prevents duplicate team saves');

SELECT * FROM finish();
ROLLBACK;
