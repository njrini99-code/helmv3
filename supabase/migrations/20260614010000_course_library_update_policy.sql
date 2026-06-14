-- ============================================================================
-- Course Library — restore the missing UPDATE RLS policy on golf_courses
-- ----------------------------------------------------------------------------
-- BUG (confirmed on prod 2026-06-14): RLS is ENABLED on public.golf_courses, but
-- the only policies are INSERT (golf_courses_insert_authenticated) and SELECT
-- (golf_courses_select_all). Under Postgres RLS a command with NO matching policy
-- is denied, so every UPDATE by the `authenticated` role matches ZERO rows —
-- silently. That breaks all course-edit write paths in
-- src/app/golf/actions/course-library.ts:
--   • updateCourse(...)          → .update().select().single() → "no rows" error
--   • setCourseImageUrl/remove   → route through updateCourse → always error
--   • softDeleteCourse/restore   → .update(deleted_at) → 0 rows, returns success,
--                                  but nothing is actually tombstoned/restored
-- (INSERT/createCourse works, so courses can be created but never edited/deleted.)
--
-- FIX: add the missing UPDATE policy, mirroring the existing INSERT gate
-- (auth.uid() IS NOT NULL) — the shared-library model where any authenticated
-- user may contribute to and curate the catalog. The action layer already does
-- its own auth.getUser() check. We do NOT add a hard-DELETE policy: golf_courses
-- uses a soft-delete model (deleted_at via UPDATE), so UPDATE coverage is enough
-- and a DELETE policy would only matter for the deprecated legacy hard-delete path.
--
-- Idempotent: safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS golf_courses_update_authenticated ON public.golf_courses;

CREATE POLICY golf_courses_update_authenticated
  ON public.golf_courses
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
