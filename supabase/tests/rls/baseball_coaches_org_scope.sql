-- pgTAP contracts for baseball_coaches — finding #5, the LAST of the six
-- cross-tenant exposures found in the 2026-05-27 baseline, and the only one
-- that outlived the tenant-isolation pair.
--
-- THE BUG.
--
--     -- live until 20260729200000
--     CREATE POLICY "baseball_coaches_select" ON public.baseball_coaches
--       FOR SELECT TO authenticated
--       USING (((SELECT auth.uid()) = user_id) OR (get_my_coach_id() IS NOT NULL));
--
-- The second clause asks only "am I a coach anywhere". It never scopes to a
-- team or an organization, so any coach read every coach row in the database.
-- Measured against production 2026-07-29: 10 coaches across 8 organizations,
-- 10 carrying an email, of which 1 organization was the caller's own.
--
-- Note what is NOT leaked, because the finding was overstated in four separate
-- documents before anyone checked: `phone` is NULL for every coach row in
-- production. The exposure is names, emails, coach_type and organization_id.
--
-- WHY IT SAT OPEN LONGEST. It was deferred as needing "a product decision + a
-- 75-call-site audit". The audit was eventually done and collapsed to nothing:
-- of 74 reads of this table in src/, 66 are self-scoped (`.eq('user_id', …)`),
-- 2 are INSERTs a SELECT policy cannot reach, 1 uses the service-role client
-- which bypasses RLS, and the remaining 5 are same-org by construction. Not one
-- required a cross-organization read. The blocker was real; its stated size was
-- not.
--
-- ASSERTS THE POST-20260729200000 STATE. Against a database without that
-- migration, GROUP 1 and GROUP 2 fail — correctly, not spuriously.
--
-- Plan arithmetic, per group: 5 (policy shape) + 3 (the helper) + 2 (writes
-- untouched) = 10. Counted rather than eyeballed — a miscounted plan aborts the
-- runner's `set -euo pipefail` loop and SILENTLY SKIPS every alphabetically
-- later suite, so an off-by-one here quietly disables a third of the directory.
--
-- HOW THIS SUITE WAS VERIFIED, both directions, before being committed:
--   * With 20260729200000 applied inside a rolled-back transaction against
--     production: all 10 predicates evaluate TRUE.
--   * Against production as it is (migration NOT applied): assertions 2, 3 and 6
--     evaluate FALSE — so the suite genuinely fails on an unmigrated database
--     rather than passing on anything.
--   * Assertion 4 (no inline ` FROM `) passes BOTH ways and is therefore a
--     forward guard only, not a detector of this migration's bug. Called out at
--     the assertion itself rather than left to be assumed.

BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- ============================================================================
-- GROUP 1 — policy shape. 5 assertions.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_coaches'
      AND p.polname = 'baseball_coaches_select'
      AND p.polcmd = 'r'
  ),
  'baseball_coaches_select exists as a SELECT policy'
);

-- The actual regression guard. `get_my_coach_id() IS NOT NULL` is the clause
-- that meant "any coach sees every coach", and it is the thing that must never
-- come back. Asserting its ABSENCE rather than the new clause's presence is
-- deliberate: someone could add correct org scoping with an OR next to this and
-- change nothing, because permissive clauses widen.
SELECT ok(
  position('get_my_coach_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
        AND p.polname = 'baseball_coaches_select'
  ), '')) = 0,
  'the "am I a coach anywhere" clause (get_my_coach_id) is GONE from the policy'
);

SELECT ok(
  position('shares_my_baseball_organization' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
        AND p.polname = 'baseball_coaches_select'
  ), '')) > 0,
  'baseball_coaches_select scopes through shares_my_baseball_organization()'
);

-- THE RECURSION INVARIANT, and the reason this suite exists at all.
--
-- The obvious way to write this policy is
--   organization_id = (SELECT organization_id FROM baseball_coaches
--                        WHERE user_id = auth.uid())
-- which is a subquery over the very table the policy guards. It re-enters the
-- policy, and Postgres rejects EVERY query against baseball_coaches with
-- "infinite recursion detected in policy for relation baseball_coaches" — not
-- just the org branch, and not just for one user. The whole table dies for
-- everyone.
--
-- That exact class of bug shipped TWICE in the tenant-isolation pair and was
-- caught neither time by reading — two independent line-by-line reviews against
-- the real schema missed both. Only executing the SQL found them. This is the
-- cheap way to keep them found.
--
-- ⚠️ HONEST NOTE ON THIS ONE ASSERTION: unlike the four around it, it passes
-- against the PRE-migration database too, because the old
-- `get_my_coach_id() IS NOT NULL` clause also contains no inline read. Verified
-- both ways. So it is a FORWARD guard — it stops the recursive rewrite from
-- being introduced later — not a detector of the bug this migration fixes. The
-- other four assertions in this group are what fail on an unmigrated database.
SELECT ok(
  position(' FROM ' IN upper(COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
        AND p.polname = 'baseball_coaches_select'
  ), ''))) = 0,
  'baseball_coaches_select contains NO inline table read — definer predicates only'
);

-- Exactly one SELECT policy. Permissive policies for the same command are
-- combined with OR, so a leftover second SELECT policy would silently restore
-- the leak while every assertion above still passed. That is precisely how the
-- baseball_messages typo survived: the CORRECT policy sat twenty lines below
-- the broken one and did not help.
SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
       AND p.polcmd = 'r'),
  1,
  'exactly ONE SELECT policy on baseball_coaches — a second permissive one would OR the leak back'
);

-- ============================================================================
-- GROUP 2 — the definer helper. 3 assertions.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'shares_my_baseball_organization'
      AND p.prosecdef
  ),
  'shares_my_baseball_organization exists and is SECURITY DEFINER'
);

-- A definer function without a pinned search_path is a privilege-escalation
-- primitive: the caller controls resolution and can shadow `baseball_coaches`
-- with their own relation in a schema they own.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'shares_my_baseball_organization'
      AND p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ),
  'shares_my_baseball_organization pins its search path'
);

-- Supabase DEFAULT-GRANTS EXECUTE to anon on every new function in `public`,
-- and `REVOKE ... FROM PUBLIC` does NOT remove that role-specific grant. Five
-- functions in the tenant-isolation pair shipped anon-callable for exactly this
-- reason and it took two CI rounds to find. Pinned rather than remembered.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'shares_my_baseball_organization'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon CANNOT execute shares_my_baseball_organization'
);

-- ============================================================================
-- GROUP 3 — the write policies must be untouched. 2 assertions.
-- ============================================================================
-- 20260729200000 changes reads only. If it ever grows a write clause, that is a
-- separate decision and should fail here first.

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
      AND p.polname = 'baseball_coaches_update_own'
      AND position('user_id' IN COALESCE(pg_get_expr(p.polqual, p.polrelid), '')) > 0
  ),
  'baseball_coaches_update_own survives and is still user_id-scoped'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_coaches'
      AND p.polname = 'baseball_coaches_insert_own'
  ),
  'baseball_coaches_insert_own survives'
);

SELECT * FROM finish();
ROLLBACK;
