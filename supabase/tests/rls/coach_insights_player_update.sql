-- S-CRIT-2 regression: players must not have UPDATE on the content/evidence/
-- coach_id columns of their own golf_coach_insights rows.
--
-- The bug at supabase/migrations/20260427210000_canonical_rls_snapshot.sql:1746-1753
-- granted players UPDATE on ALL columns of their own insight rows.
--
-- Production fixed it with column-level REVOKE + GRANT. `authenticated` may
-- update only the seven columns a player or coach changes from the app
-- (acknowledge, dismiss, resolve, reactivate): status, acknowledged_at,
-- dismissed, dismissed_at, resolved_at, metadata, lifecycle_state.
-- 20261028140400_capture_coach_insights_update_grants.sql makes a replay
-- match that (the OBSOLETE 20260528011000 kept only two of them, which broke
-- those app writes). supabase/schemas/golf/95_grants.sql declares the same
-- seven.

BEGIN;
\ir _helpers.sql

SELECT plan(4);

-- Test 1: column-level UPDATE grants are limited to production's seven columns.
SELECT ok(
    tests.authenticated_can_update_only(
        'public',
        'golf_coach_insights',
        ARRAY[
            'acknowledged_at', 'dismissed', 'dismissed_at', 'lifecycle_state',
            'metadata', 'resolved_at', 'status'
        ]
    ),
    'authenticated role has column-level UPDATE only on the seven app-written columns'
);

-- Test 2: the policy still exists (so service_role + admin paths still work).
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        WHERE
            c.relname = 'golf_coach_insights'
            AND p.polname = 'coach_insights_update_player_own'
    ),
    'coach_insights_update_player_own policy is still defined'
);

-- Test 3: service_role retains full UPDATE (the engine writes content/evidence as admin).
SELECT ok(
    EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants
        WHERE
            grantee = 'service_role'
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
        WHERE
            grantee = 'authenticated'
            AND table_schema = 'public'
            AND table_name = 'golf_coach_insights'
            AND privilege_type = 'UPDATE'
    ),
    'authenticated has no table-level UPDATE grant (only column-level on safe cols)'
);

SELECT * FROM finish();
ROLLBACK;
