-- ============================================================================
-- Course Library — gate shared LIBRARY-owned courses behind super admin
-- ----------------------------------------------------------------------------
-- Fixes #913 part 2 (RLS half). The app-layer guard (updateCourse /
-- softDeleteCourse in src/app/golf/actions/course-library.ts) already blocks
-- a non-admin coach from editing or removing a course with no human creator
-- (created_by_user_id IS NULL — the signal for "shipped with the shared
-- library, nobody on any team owns this row"). But the RLS policy underneath
-- it — golf_courses_update_authenticated, from
-- 20260614010000_course_library_update_policy.sql — still allows ANY
-- authenticated user to UPDATE ANY golf_courses row (including
-- soft-deleting one via `deleted_at`), so a caller that talks to
-- PostgREST/Supabase directly (bypassing the Next.js server action) could
-- still rename or remove a shared library course. This migration closes
-- that gap at the DB layer so the two enforcement points can't drift.
--
-- New rule: an authenticated user may UPDATE a golf_courses row when EITHER
--   (a) it already has a human creator (created_by_user_id IS NOT NULL —
--       a team/coach's own contribution, unaffected: open contribution as
--       designed in 20260613160000_course_library_phase1.sql), OR
--   (b) the caller is a super admin (public.is_super_admin(), from
--       20260701110000_admin_allowlist_is_super_admin.sql).
--
-- created_by_user_id is never itself mutated by updateCourse, so USING
-- (pre-update row) and WITH CHECK (post-update row) evaluate the same
-- condition here — both are included per Postgres RLS convention for UPDATE.
--
-- THIS MIGRATION IS COMMITTED FOR REVIEW as part of the #913 PR. It has NOT
-- been applied to any live environment by the agent that wrote it — CI's
-- `supabase start` + `supabase db lint` + pgTAP suite (see
-- supabase/tests/rls/golf_course_library.sql) will run it against an
-- ephemeral local stack, but a human must review and apply it (via the
-- normal deploy process) before it takes effect on staging/prod.
--
-- Idempotent: safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS golf_courses_update_authenticated ON public.golf_courses;

CREATE POLICY golf_courses_update_authenticated
  ON public.golf_courses
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (created_by_user_id IS NOT NULL OR public.is_super_admin())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by_user_id IS NOT NULL OR public.is_super_admin())
  );

COMMENT ON POLICY golf_courses_update_authenticated ON public.golf_courses IS
  'Open contribution for team/user-owned courses (created_by_user_id set); shared LIBRARY rows (created_by_user_id NULL — no human creator) require public.is_super_admin(). Mirrors the app-layer guard in updateCourse/softDeleteCourse (src/app/golf/actions/course-library.ts) — #913 part 2.';
