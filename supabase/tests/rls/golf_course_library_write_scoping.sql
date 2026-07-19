-- BEHAVIORAL pgTAP contract for #36/#187 (course-library-write-scoping,
-- 20260719120000_course_library_role_scoping.sql).
--
-- golf_course_library.sql (Phase-1 suite) only asserts the WITH CHECK
-- expression TEXT of these policies via tests.policy_with_check_contains
-- (schema-light). That is NOT the same as proving the policy actually
-- rejects a player at the database layer — a regression that widened the
-- USING clause (or dropped the is_golf_coach() predicate entirely) while
-- keeping the same referenced identifiers in the expression text would still
-- ship green against that suite. This file closes that gap: it seeds a real
-- coach (has a golf_coaches row) and a real player (no golf_coaches row),
-- impersonates each via the authenticated role + JWT (SET LOCAL role +
-- request.jwt.claims — the pattern established in
-- baseball_recalc_body_guards.sql / golf_coach_insights_cross_tenant_select.sql),
-- and asserts the actual row-level outcome of an UPDATE/DELETE attempt.
--
-- Also note: the mocked Vitest suite for course-library.ts
-- (src/app/golf/actions/__tests__/course-library.test.ts) only proves the
-- APP-LAYER requireCoachActor gate rejects a non-coach caller — it mocks the
-- Supabase client, so it cannot detect an RLS-layer regression at all (e.g.
-- someone calling the PostgREST API directly with a player's JWT, bypassing
-- the server action entirely). This suite is the one that actually proves
-- the DB will reject that.
--
-- Scope: UPDATE on golf_courses / golf_course_tees, and UPDATE + DELETE on
-- golf_course_tee_holes (INSERT on all three cloud tables is intentionally
-- left open to any authenticated user — see the "INSERT stays open" note in
-- 20260719120000_course_library_role_scoping.sql and the equivalent note in
-- src/app/golf/actions/course-library.ts's requireCoachActor doc comment;
-- this is a deliberate, flagged deviation from a fully-literal reading of
-- "player cannot INSERT" and needs an explicit owner call, not a silent
-- reviewer-vs-implementer disagreement).

BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- ============================================================================
-- Seed a coach (HAS a golf_coaches row) and a player (does NOT) plus one
-- owned course / tee / tee-hole row for each write target.
-- ============================================================================
DO $$
DECLARE
  v_coach_user   uuid := '00000000-0000-0000-0000-0000000000c1';
  v_coach_id     uuid := '00000000-0000-0000-0000-0000000000c2';
  v_player_user  uuid := '00000000-0000-0000-0000-0000000000c3';
  v_course_id    uuid := '00000000-0000-0000-0000-0000000000c4';
  v_tee_id       uuid := '00000000-0000-0000-0000-0000000000c5';
  v_hole_upd_id  uuid := '00000000-0000-0000-0000-0000000000c6';
  v_hole_del_id  uuid := '00000000-0000-0000-0000-0000000000c7';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_coach_user,  'wscope-coach@helm.test',  'authenticated'),
    (v_player_user, 'wscope-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_coach_user,  'wscope-coach@helm.test',  'coach'),
    (v_player_user, 'wscope-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  -- Coach has a golf_coaches row; player deliberately does NOT.
  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (v_coach_id, v_coach_user)
  ON CONFLICT DO NOTHING;

  -- A team/user-owned course (created_by_user_id NOT NULL — the "any
  -- authenticated coach may edit" branch, not the library-row/super-admin-only
  -- branch from #913 part 2, which is a separate, already-covered contract).
  INSERT INTO public.golf_courses (id, name, normalized_name, created_by_user_id, last_edited_by_user_id)
    VALUES (v_course_id, 'WScope Test Course', 'wscope test course', v_coach_user, v_coach_user)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_course_tees
    (id, course_id, tee_name, normalized_tee_name, created_by_user_id, last_edited_by_user_id)
    VALUES (v_tee_id, v_course_id, 'Blue', 'blue', v_coach_user, v_coach_user)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_course_tee_holes (id, tee_id, hole_number, par, yardage) VALUES
    (v_hole_upd_id, v_tee_id, 1, 4, 400),
    (v_hole_del_id, v_tee_id, 2, 4, 410)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Sanity: is_golf_coach() itself resolves correctly for each seeded user.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
SELECT ok(public.is_golf_coach(), 'is_golf_coach() is TRUE for the seeded coach');
RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';
SELECT ok(NOT public.is_golf_coach(), 'is_golf_coach() is FALSE for the seeded player (no golf_coaches row)');
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- golf_courses UPDATE — player REJECTED, coach ALLOWED.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_courses
    SET name = 'PLAYER PWNED THIS'
    WHERE id = '00000000-0000-0000-0000-0000000000c4'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0,
  'player CANNOT UPDATE golf_courses (RLS rejects — #36/#187)');

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_courses
    SET name = 'Coach Renamed It'
    WHERE id = '00000000-0000-0000-0000-0000000000c4'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 1,
  'coach CAN UPDATE golf_courses (Decision-1 option A — coach-open)');

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- golf_course_tees UPDATE — player REJECTED, coach ALLOWED.
-- Coach's UPDATE must set last_edited_by_user_id = auth.uid() to satisfy the
-- (unchanged, pre-existing) attribution WITH CHECK.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_course_tees
    SET tee_name = 'PLAYER PWNED THIS', last_edited_by_user_id = '00000000-0000-0000-0000-0000000000c3'::uuid
    WHERE id = '00000000-0000-0000-0000-0000000000c5'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0,
  'player CANNOT UPDATE golf_course_tees (RLS rejects — #36/#187)');

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_course_tees
    SET tee_name = 'Coach Blue', last_edited_by_user_id = '00000000-0000-0000-0000-0000000000c1'::uuid
    WHERE id = '00000000-0000-0000-0000-0000000000c5'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 1,
  'coach CAN UPDATE golf_course_tees (Decision-1 option A — coach-open)');

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- golf_course_tee_holes UPDATE — player REJECTED, coach ALLOWED.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_course_tee_holes
    SET yardage = 500
    WHERE id = '00000000-0000-0000-0000-0000000000c6'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 0,
  'player CANNOT UPDATE golf_course_tee_holes (RLS rejects — #36/#187)');

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

WITH upd AS (
  UPDATE public.golf_course_tee_holes
    SET yardage = 405
    WHERE id = '00000000-0000-0000-0000-0000000000c6'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM upd), 1,
  'coach CAN UPDATE golf_course_tee_holes (Decision-1 option A — coach-open)');

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- golf_course_tee_holes DELETE — player REJECTED, coach ALLOWED.
-- Uses a SEPARATE seeded hole row from the UPDATE assertions above so the
-- coach's successful delete here doesn't remove a row an earlier assertion
-- still depends on.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';

WITH del AS (
  DELETE FROM public.golf_course_tee_holes
    WHERE id = '00000000-0000-0000-0000-0000000000c7'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM del), 0,
  'player CANNOT DELETE golf_course_tee_holes (RLS rejects — #36/#187)');

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

WITH del AS (
  DELETE FROM public.golf_course_tee_holes
    WHERE id = '00000000-0000-0000-0000-0000000000c7'::uuid
    RETURNING id
)
SELECT is((SELECT count(*)::int FROM del), 1,
  'coach CAN DELETE golf_course_tee_holes (Decision-1 option A — coach-open)');

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
