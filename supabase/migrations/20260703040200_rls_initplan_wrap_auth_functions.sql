-- ============================================================================
-- auth_rls_initplan remediation (advisors: 370 findings / 141 tables).
-- Policies calling auth.uid()/auth.jwt()/auth.role() bare are re-evaluated
-- PER ROW; wrapping in (select ...) makes Postgres evaluate them once per
-- query as an initplan. Pure performance rewrite — expression results are
-- identical, so policy semantics cannot change.
--
-- Mechanical + idempotent: for every public policy whose stored qual /
-- with_check still contains a bare call (already-wrapped calls are stored as
-- 'SELECT auth.uid() AS uid' and are masked out before detection), re-issue
-- ALTER POLICY with the wrapped expression text. Re-running is a no-op.
--
-- APPLIED TO PROD 2026-07-03 via MCP (rls_initplan_wrap_auth_functions)
-- before this file merged; kept in-repo as source of truth. Post-apply:
-- bare-call policy count -> 0, advisors auth_rls_initplan 370 -> 0,
-- authenticated REST smoke green across baseball_/golf_/helm_lifting_.
-- ============================================================================
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  stmt text;
  n int := 0;
  has_bare boolean;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ 'auth\.(uid|jwt|role)\(\)' OR with_check ~ 'auth\.(uid|jwt|role)\(\)')
  LOOP
    has_bare := (
      replace(replace(replace(COALESCE(r.qual,'') || ' ' || COALESCE(r.with_check,''),
        'SELECT auth.uid() AS uid', ''),
        'SELECT auth.jwt() AS jwt', ''),
        'SELECT auth.role() AS role', '')
      ~ 'auth\.(uid|jwt|role)\(\)'
    );
    IF NOT has_bare THEN CONTINUE; END IF;

    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'SELECT auth.uid() AS uid', '@@WUID@@');
      new_qual := replace(new_qual, 'SELECT auth.jwt() AS jwt', '@@WJWT@@');
      new_qual := replace(new_qual, 'SELECT auth.role() AS role', '@@WROLE@@');
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, '@@WUID@@', 'SELECT auth.uid() AS uid');
      new_qual := replace(new_qual, '@@WJWT@@', 'SELECT auth.jwt() AS jwt');
      new_qual := replace(new_qual, '@@WROLE@@', 'SELECT auth.role() AS role');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'SELECT auth.uid() AS uid', '@@WUID@@');
      new_check := replace(new_check, 'SELECT auth.jwt() AS jwt', '@@WJWT@@');
      new_check := replace(new_check, 'SELECT auth.role() AS role', '@@WROLE@@');
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'auth.jwt()', '(select auth.jwt())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, '@@WUID@@', 'SELECT auth.uid() AS uid');
      new_check := replace(new_check, '@@WJWT@@', 'SELECT auth.jwt() AS jwt');
      new_check := replace(new_check, '@@WROLE@@', 'SELECT auth.role() AS role');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE stmt;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rewrote % policies to initplan form', n;
END $$;
