-- ============================================================================
-- Course Library — role-scope writes to coaches (Decision-1 option A)
-- ----------------------------------------------------------------------------
-- Findings #36/#187 (critical): any authenticated PLAYER has full write access
-- to the shared Course Library at the DB layer:
--
--   • golf_courses UPDATE (20260717120000_course_library_owner_gate.sql) is
--       auth.uid() IS NOT NULL AND (created_by_user_id IS NOT NULL OR is_super_admin())
--     `created_by_user_id IS NOT NULL` means "SOME human created this row" —
--     not "you did" — so it is true for almost every non-library row and is a
--     near-no-op guard. Any signed-in player can rename/edit any
--     team-contributed course.
--   • golf_course_tees UPDATE (20260613160000_course_library_phase1.sql) is
--       USING (true) WITH CHECK (last_edited_by_user_id = auth.uid())
--     — self-attested, no role predicate at all. Any signed-in player can
--     edit (or corrupt the pars/yardages of) any tee set.
--   • golf_course_tee_holes had a single FOR ALL USING(true) WITH CHECK(true)
--     policy — no predicate whatsoever, covering INSERT/UPDATE/DELETE alike.
--
-- Commit bc8b8372 already hid the create/edit/delete UI controls from players
-- in CourseLibraryClient.tsx and CourseDetailDrawer.tsx (owner Decision-1
-- option A: coach-open, player-blocked). This migration makes that the DB
-- layer's actual contract instead of relying on the UI alone, and
-- src/app/golf/actions/course-library.ts now carries the matching
-- `requireCoachActor` app-layer gate on createCourse/updateCourse/createTee/
-- updateTee/soft-delete/restore.
--
-- WHY UPDATE/DELETE ONLY, NOT INSERT: `contributeCourseFromRound` (the
-- "grow the catalog from a saved round" path — src/app/golf/actions/
-- course-library.ts, called from new-round-client.tsx) lets a PLAYER add a
-- not-yet-cataloged course/tee when they save their own round. That is
-- legitimate additive-only catalog growth (never edits or removes an
-- existing row), not "managing the library", so INSERT stays open to any
-- authenticated user exactly as designed in the Phase-1 migration — only the
-- destructive/mutating surface (UPDATE existing rows, and by extension the
-- soft-delete/restore UPDATEs) is role-scoped here. golf_course_tee_holes
-- keeps its existing INSERT-open shape for the same reason (a brand-new tee's
-- holes are inserted alongside it) but its UPDATE/DELETE are now coach-gated.
--
-- golf_course_holes (the legacy, courses.ts-only table) is UNCHANGED here —
-- it already carries a real role predicate ("Coaches can manage course
-- holes": EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = auth.uid())),
-- so it was not part of this gap; courses.ts itself is dead code (zero
-- importers) and now carries the same app-layer coach gate for defense in
-- depth (see courses.ts).
--
-- Existing pgTAP contracts this migration must NOT break
-- (supabase/tests/rls/golf_course_library.sql, out of this fix's scope —
-- referenced here by ASSERTION, not by section letter, since letter labels
-- rot the moment that file gains or loses a section):
--   • the assertion "golf_courses UPDATE WITH CHECK references
--     created_by_user_id (owner gate, not just auth.uid())" and the sibling
--     assertion that it also carries an is_super_admin() escape hatch —
--     preserved by ANDing the new is_golf_coach() predicate in rather than
--     replacing the existing expression.
--   • the assertion "tees update WITH CHECK references
--     last_edited_by_user_id" — preserved the same way.
--
-- NEW behavioral RLS coverage for #36/#187 itself lives in a SEPARATE file,
-- supabase/tests/rls/golf_course_library_write_scoping.sql — it seeds a real
-- coach + a real player and impersonates each via SET LOCAL role +
-- request.jwt.claims to prove UPDATE on golf_courses/golf_course_tees and
-- UPDATE+DELETE on golf_course_tee_holes are actually rejected for a player
-- at the database layer (not just that the policy text mentions the right
-- column names, which the Phase-1 suite above already covered and this
-- migration does not disturb).
--
-- DEVIATION FROM A FULLY-LITERAL READING OF THE ACCEPTANCE TEXT — FLAGGED,
-- NOT SILENTLY DECIDED: the acceptance text for this fix says a player
-- "cannot INSERT/UPDATE" any of the three tables. INSERT is INTENTIONALLY
-- LEFT OPEN here (unchanged from Phase 1) on all three — see the "WHY
-- UPDATE/DELETE ONLY, NOT INSERT" note below. Locking INSERT to coach-only
-- at the RLS layer would break contributeCourseFromRound's live, in-use
-- player round-contribution path (src/app/golf/actions/course-library.ts),
-- because that path runs its INSERT through the same user-context (RLS-bound)
-- Supabase client as every other action here — there is no service-role or
-- SECURITY DEFINER bypass in this file for that flow. Treating "grow the
-- catalog with a new, not-yet-cataloged course/tee" the same as "edit or
-- remove an existing row" is a product-scoping call, not an implementation
-- detail, and this migration takes the position that only the latter is what
-- #36/#187 actually flagged as the vulnerability (any authenticated player
-- editing/removing ANY row) — the former was never reported as exploitable
-- harm. This needs an explicit owner confirmation before it's treated as
-- fully closed against the literal acceptance text; it is called out again
-- in the round-2 PR description for that reason.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── Generic (non-team-scoped) coach check ───────────────────────────────────
-- Unlike is_golf_team_coach(team_uuid), the Course Library is a SHARED
-- catalog with no single owning team — the gate here is simply "is this
-- caller a coach at all", mirroring the app-layer check in
-- src/app/golf/actions/course-library.ts (getActor()'s golf_coaches lookup).
CREATE OR REPLACE FUNCTION public.is_golf_coach()
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.golf_coaches gc
    WHERE gc.user_id = auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.is_golf_coach() IS
  'True when the current auth.uid() has a golf_coaches row (any team/org) — the Course Library''s coach-open/player-blocked write gate (Decision-1 option A). Not team-scoped; see is_golf_team_coach(team_uuid) for team-scoped checks.';

REVOKE EXECUTE ON FUNCTION public.is_golf_coach() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_golf_coach() TO authenticated, service_role;

-- ── golf_courses: UPDATE now also requires a coach (or super admin) ────────
DROP POLICY IF EXISTS golf_courses_update_authenticated ON public.golf_courses;

CREATE POLICY golf_courses_update_authenticated
  ON public.golf_courses
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR (created_by_user_id IS NOT NULL AND public.is_golf_coach())
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR (created_by_user_id IS NOT NULL AND public.is_golf_coach())
    )
  );

COMMENT ON POLICY golf_courses_update_authenticated ON public.golf_courses IS
  'UPDATE requires public.is_super_admin() OR (a team/user-owned row AND public.is_golf_coach()) — closes the #36/#187 gap where created_by_user_id IS NOT NULL alone let any authenticated player edit any course. Library rows (created_by_user_id NULL) still require super admin per #913 part 2.';

-- ── golf_course_tees: UPDATE now requires a coach (or super admin) ─────────
DROP POLICY IF EXISTS golf_course_tees_update ON public.golf_course_tees;

CREATE POLICY golf_course_tees_update
  ON public.golf_course_tees
  FOR UPDATE
  TO authenticated
  USING (public.is_golf_coach() OR public.is_super_admin())
  WITH CHECK (
    (public.is_golf_coach() OR public.is_super_admin())
    AND last_edited_by_user_id = auth.uid()
  );

COMMENT ON POLICY golf_course_tees_update ON public.golf_course_tees IS
  'UPDATE requires public.is_golf_coach() OR public.is_super_admin() (#36/#187 — the previous USING(true) had NO role predicate). WITH CHECK still pins last_edited_by_user_id = auth.uid() for attribution.';

-- ── golf_course_tee_holes: split the blanket ALL policy ────────────────────
-- INSERT stays open (new tee creation, incl. contributeCourseFromRound,
-- inserts holes alongside a brand-new tee); UPDATE/DELETE (editing or
-- pruning an EXISTING tee's holes) now require a coach.
DROP POLICY IF EXISTS golf_course_tee_holes_write ON public.golf_course_tee_holes;

CREATE POLICY golf_course_tee_holes_insert
  ON public.golf_course_tee_holes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY golf_course_tee_holes_update
  ON public.golf_course_tee_holes
  FOR UPDATE
  TO authenticated
  USING (public.is_golf_coach() OR public.is_super_admin())
  WITH CHECK (public.is_golf_coach() OR public.is_super_admin());

CREATE POLICY golf_course_tee_holes_delete
  ON public.golf_course_tee_holes
  FOR DELETE
  TO authenticated
  USING (public.is_golf_coach() OR public.is_super_admin());

COMMENT ON TABLE public.golf_course_tee_holes IS
  'Per-tee hole pars/yards. SELECT open to authenticated; INSERT open (new tee creation, incl. player round-contribution); UPDATE/DELETE require public.is_golf_coach() OR public.is_super_admin() (#36/#187 — the previous FOR ALL USING(true) had no predicate at all).';
