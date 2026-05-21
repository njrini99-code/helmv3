-- S-CRIT-2 regression: players must not have UPDATE on the content/evidence/
-- lifecycle/coach_id columns of their own golf_coach_insights rows.
--
-- The bug at supabase/migrations/20260427210000_canonical_rls_snapshot.sql:1746-1753
-- granted players UPDATE on ALL columns of their own insight rows.
--
-- The fix in 20260517000000_fix_critical_rls_policies.sql uses column-level
-- REVOKE + GRANT so the `authenticated` role only has UPDATE on
-- `acknowledged_at` and `dismissed_at` (the legitimate user-facing columns).

BEGIN;
\i supabase/tests/rls/_helpers.sql

SELECT plan(4);

-- Test 1: column-level UPDATE grants are limited to acknowledged_at + dismissed_at.
SELECT ok(
  tests.authenticated_can_update_only(
    'public',
    'golf_coach_insights',
    ARRAY['acknowledged_at', 'dismissed_at']
  ),
  'authenticated role has column-level UPDATE only on acknowledged_at + dismissed_at'
);

-- Test 2: the policy still exists (so service_role + admin paths still work).
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'golf_coach_insights'
      AND p.polname = 'coach_insights_update_player_own'
  ),
  'coach_insights_update_player_own policy is still defined'
);

-- Test 3: service_role retains full UPDATE (the engine writes content/evidence as admin).
SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'service_role'
      AND table_schema = 'public'
      AND table_name = 'golf_coach_insights'
      AND privilege_type = 'UPDATE'
  ),
  'service_role retains UPDATE on golf_coach_insights (engine still writes)'
);

-- Test 4: authenticated does NOT have a table-level UPDATE grant on golf_coach_insights.
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'golf_coach_insights'
      AND privilege_type = 'UPDATE'
  ),
  'authenticated has no table-level UPDATE grant (only column-level on safe cols)'
);

SELECT * FROM finish();
ROLLBACK;
