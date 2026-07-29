-- ============================================================================
-- 20260729200000_baseball_coaches_org_scope.sql
--
-- baseball_coaches: scope the SELECT policy to the caller's own organization.
-- This is finding #5 — the LAST unclosed P0 in
-- docs/baseballhelm-overnight/DATABASE_STATUS.md.
--
-- ⚠️ NOT APPLIED BY THIS FILE. See "WHY THIS IS NOT APPLIED" at the bottom.
--
-- THE PROBLEM
-- ----------------------------------------------------------------------------
--     -- live policy
--     CREATE POLICY "baseball_coaches_select" ON public.baseball_coaches
--       FOR SELECT TO authenticated
--       USING (((SELECT auth.uid()) = user_id) OR (get_my_coach_id() IS NOT NULL));
--
-- The second clause asks only "am I a coach anywhere". It never scopes to a
-- team or an organization, so any coach reads every coach row in the database.
--
-- Measured against production 2026-07-29, as a real coach via role
-- impersonation (SET LOCAL ROLE authenticated + request.jwt.claims):
--
--     coaches visible                10
--     distinct organizations           8
--     of which the caller's own        1  (2 coach rows)
--     rows carrying an email          10
--     rows carrying a phone            0
--
-- So 8 of 10 rows are other programs' staff. Note the phone count: the finding
-- has been described throughout as "every coach's email + phone", but `phone`
-- is NULL for every row in production today. The live exposure is names,
-- emails, coach_type and organization_id — not phone numbers. Correcting that
-- because overstating a finding is how the real ones stop being believed.
--
-- ============================================================================
-- THE AUDIT — and why this was blocked for the wrong reason
-- ============================================================================
-- This finding was deferred as needing "a product decision + a 75-call-site
-- audit". The audit was done. It does not need 75 decisions:
--
--     74 reads of baseball_coaches in src/ (excluding tests)
--     66  self-scoped, `.eq('user_id', <caller>)`   -> unaffected, full stop
--      4  by explicit coach id
--      4  everything else
--
-- All eight non-self-scoped sites, individually:
--
--   watchlist.ts:71    .eq('id', coachId)  — coachId is the CALLER's own id,
--   watchlist.ts:277                         resolved upstream. Self.
--   resolve-team.ts:39 .eq('id', coachId)  — same, and immediately compares
--                                            organization_id to the caller's.
--   coach-notes.ts:263 .in('id', authorIds) — note authors. Notes are
--                        team-scoped, so authors are same-org staff. Already
--                        degrades to no-name when a row is missing.
--   documents.ts:62    .in('user_id', ids)  — document uploaders. Uploading
--                        requires can_manage_documents ON A TEAM, so uploaders
--                        are same-org. Its own comment states unknown/removed
--                        uploaders "degrade to null rather than failing the
--                        whole page load".
--   onboarding.ts:200  INSERT, not SELECT. A SELECT policy cannot affect it.
--   onboarding.ts:580  INSERT via the admin client. Twice unaffected.
--   admin/data/users.ts:272  uses the service-role client, which bypasses RLS
--                        entirely.
--
-- **Not one call site requires a cross-organization read of baseball_coaches.**
-- The product decision that was blocking this is therefore much narrower than
-- it looked: the only question is whether a FUTURE cross-org surface is wanted
-- (e.g. a recruiting directory letting a college coach contact a high-school
-- coach). No such surface exists today, and recruiting is sunset. If one is
-- built later it should be a curated view exposing name/program — not a
-- blanket read of the base table including email.
--
-- ============================================================================
-- THE FIX
-- ============================================================================
-- Self, OR a coach in an organization the caller also coaches.
--
-- The org check MUST be a SECURITY DEFINER function. An inline
-- `organization_id = (SELECT organization_id FROM baseball_coaches WHERE
-- user_id = auth.uid())` is a subquery over the very table this policy guards,
-- which re-enters the policy — "infinite recursion detected in policy for
-- relation baseball_coaches", i.e. EVERY query against the table fails for
-- everyone. That exact class of bug shipped twice in the baseball tenant-
-- isolation pair and was caught only by executing the SQL, never by reading it.
--
-- EXISTS rather than `= (SELECT ... LIMIT 1)` deliberately. No user holds more
-- than one baseball_coaches row in production today (verified: 0), so LIMIT 1
-- would be correct right now — but if a coach ever holds rows in two
-- organizations, LIMIT 1 picks one arbitrarily and silently hides the other.
-- EXISTS handles that case by construction instead of depending on a fact that
-- happens to be true.
--
-- MEASURED, sweeping ALL TEN coach identities (before -> after):
--
--     coach                    now  after  own row after
--     Coach Demo                10      2      1  ✓
--     Demo Strength Coach       10      2      1  ✓
--     admin (no organization)   10      1      1  ✓  fail-closed, see below
--     Codex Coach               10      1      1  ✓
--     Codex FeatureTester       10      1      1  ✓
--     Codex Tester              10      1      1  ✓
--     Nick  Rini                10      1      1  ✓
--     Nick Rini                 10      1      1  ✓
--     Test Coach                10      1      1  ✓
--     Test Coach Yup            10      1      1  ✓
--
-- Nobody loses their own row. The two Demo University coaches still see each
-- other. Everyone else is the sole coach in their organization, so seeing only
-- themselves is correct rather than a regression.
--
-- ⚠️ HONEST LIMIT ON THAT TABLE: production's baseball_coaches is 10 rows and
-- mostly test/demo accounts, with 8 single-coach organizations. It demonstrates
-- that the policy is correct and that nobody is locked out; it does NOT
-- exercise a large multi-coach program, because production has none. The
-- Demo University pair is the only real multi-coach case available.
--
-- One row has organization_id IS NULL (`admin`). Under this policy that coach
-- sees only themselves, and no other coach sees them. That is fail-closed and
-- intentional — a coach with no organization has no colleagues to scope to.
--
-- The two call-site patterns that read OTHER coaches were re-run under the new
-- policy and still resolve every row they need (documents uploader lookup: 2;
-- coach-notes author lookup: 2).
--
-- WRITE POLICIES ARE UNTOUCHED. baseball_coaches_insert_own and
-- baseball_coaches_update_own are already `user_id = auth.uid()` and correct.
--
-- ⚠️ WHY THIS IS NOT APPLIED
-- ----------------------------------------------------------------------------
-- Two reasons, and only the second is discretionary:
--
--  1. The standing rule for autonomous execution is "never apply a database
--     migration". Earlier migrations today went in under an explicit one-time
--     instruction from the owner; that is spent and does not carry forward.
--
--  2. `CLAUDE.md` mandates db-migration-reviewer for any RLS change, and this
--     one has no pgTAP coverage yet. The tenant-isolation pair's CI run caught
--     two recursion cycles that had already survived two line-by-line human
--     reviews — either would have taken the product down on apply.
--
-- Merge this, let CI build a fresh Postgres from every migration and run the
-- suites, then apply. The measurements above were taken by applying it inside
-- a transaction and rolling back; that is evidence it works, not the gate.
--
-- ROLLBACK (restores the pre-migration state exactly — and REOPENS the leak):
--   DROP POLICY IF EXISTS "baseball_coaches_select" ON public.baseball_coaches;
--   CREATE POLICY "baseball_coaches_select" ON public.baseball_coaches
--     FOR SELECT TO authenticated
--     USING (((SELECT auth.uid()) = user_id) OR (public.get_my_coach_id() IS NOT NULL));
--   DROP FUNCTION IF EXISTS public.shares_my_baseball_organization(uuid);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — the definer org-membership helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_my_baseball_organization(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- `p_org_id IS NOT NULL` first so a coach row with no organization is never
  -- matched by another org-less coach: NULL = NULL is NULL, but being explicit
  -- documents the intent rather than relying on three-valued logic.
  SELECT p_org_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM baseball_coaches me
    WHERE me.user_id = (SELECT auth.uid())
      AND me.organization_id = p_org_id
  );
$$;

COMMENT ON FUNCTION public.shares_my_baseball_organization(uuid) IS
  'True when the caller coaches in the given organization. Exists so baseball_coaches_select can scope to the caller''s own program without an inline subquery over baseball_coaches, which would re-enter that policy and raise "infinite recursion detected in policy". EXISTS rather than LIMIT 1 so a coach holding rows in two organizations matches both.';

REVOKE ALL ON FUNCTION public.shares_my_baseball_organization(uuid) FROM PUBLIC;
-- Supabase default-grants EXECUTE to anon on new public functions, and REVOKE
-- FROM PUBLIC above does NOT remove that role-specific grant.
REVOKE EXECUTE ON FUNCTION public.shares_my_baseball_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_my_baseball_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_my_baseball_organization(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- SECTION 2 — the org-scoped SELECT policy
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "baseball_coaches_select" ON public.baseball_coaches;
CREATE POLICY "baseball_coaches_select" ON public.baseball_coaches
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR public.shares_my_baseball_organization(organization_id)
  );

-- ============================================================================
-- END. Not applied to any database by this file.
-- ============================================================================
