-- ============================================================================
-- BaseballHelm Phase 1 — consolidated RLS coverage roll-up.
--
-- This suite is the QA-gate guard (Wave 12, P12.3). It does NOT re-derive the
-- per-table contract logic (each table already has a dedicated, deeper suite —
-- see baseball_lifting_visibility.sql, baseball_practice_visibility.sql,
-- baseball_timeline_visibility.sql, baseball_event_acknowledgements.sql,
-- baseball_import_lineage.sql, baseball_staff_capabilities.sql,
-- baseball_staff_invite_accept.sql, baseball_coach_insights_attribution.sql,
-- baseball_stats_center.sql, baseball_import_center.sql,
-- baseball_recalc_body_guards.sql).
--
-- Instead it asserts, across EVERY Phase-1 table at once, the four invariants
-- that must never silently regress when a later migration touches the schema:
--
--   1. RLS is ENABLED on every Phase-1 table.
--   2. anon has NO table privilege (SELECT/INSERT/UPDATE/DELETE) on any of them.
--   3. NO policy on any Phase-1 table targets the anon role.
--   4. Every Phase-1 table has at least one SELECT policy (no implicit-deny gap
--      that would silently hide all rows from legitimate authenticated users)
--      AND a player-isolation gate exists: at least one player-readable table
--      branch is bound to the per-user identity helper get_my_baseball_player_id
--      / auth.uid (so a player can never read another player's private rows by
--      default), and the helper functions are NOT executable by anon.
--
-- Schema-light: asserts over pg_class / pg_policies / has_table_privilege /
-- pg_proc — no seeded integration data (matches the deferral note in
-- _helpers.sql). Read-only; wrapped in BEGIN/ROLLBACK; applies nothing.
--
-- 2026-07-04 graveyard update: baseball_lift_assignments, baseball_lift_results,
-- and baseball_readiness_checkins moved out of public into the graveyard schema
-- (20260704070000_graveyard_dead_liftlab_tables_phase2.sql — orphaned demo-seed
-- rows, zero readers post signals-bridge rewire; helm_lifting_* is the live
-- canonical successor, not yet covered by a dedicated RLS suite). Removed from
-- the Phase-1 table set and from the player-isolation-gate sentinel list below.
-- See docs/audits/DB_TABLE_AUDIT_2026-07-04.md.
-- ============================================================================

BEGIN;
\ir _helpers.sql

-- All Phase-1 tables created or hardened across the 20260624* migration set.
CREATE TEMP TABLE _bb_phase1_tables(t text) ON COMMIT DROP;
INSERT INTO _bb_phase1_tables(t) VALUES
  ('baseball_event_acknowledgements'),
  ('baseball_exercises'),
  ('baseball_import_runs'),
  ('baseball_player_external_ids'),
  ('baseball_player_timeline_events'),
  ('baseball_practice_attendance'),
  ('baseball_practice_blocks'),
  ('baseball_practices'),
  ('baseball_staff_invitations'),
  ('baseball_stat_uploads'),
  ('baseball_coach_insights');

-- Per-user identity / scope helpers that gate player isolation. These must
-- exist and must NOT be executable by anon.
CREATE TEMP TABLE _bb_phase1_funcs(f text) ON COMMIT DROP;
INSERT INTO _bb_phase1_funcs(f) VALUES
  ('get_my_baseball_player_id'),
  ('is_baseball_team_staff'),
  ('has_baseball_staff_capability'),
  ('can_view_baseball_player'),
  ('is_baseball_team_member'),
  ('can_manage_baseball_lift_group');

-- 11 tables × 6 assertions (RLS on, 4× anon-privilege, no-anon-policy) = 66
-- + 11 (>=1 SELECT policy) = 77
-- + 1 (every table referenced exists) = 78
-- + 6 funcs × 2 (exists + anon cannot execute) = 12 → 90
-- + 1 union player-identity gate present across the table set
SELECT plan(91);

-- ---------------------------------------------------------------------------
-- 0. Sanity: every Phase-1 table actually exists (catches a renamed/missing
--    table before the contract assertions vacuously "pass").
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT COUNT(*)::int FROM _bb_phase1_tables bt
     WHERE EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = bt.t AND c.relkind = 'r')),
  (SELECT COUNT(*)::int FROM _bb_phase1_tables),
  'all Phase-1 tables exist in public schema'
);

-- ---------------------------------------------------------------------------
-- 1. RLS ENABLED on every Phase-1 table (set-driven; one TAP row per table).
--    NOTE: every assertion is a top-level SELECT (not wrapped in a DO/PL block)
--    because pgTAP only counts rows emitted into the result stream — a SELECT
--    ok() executed inside a DO block would advance the internal counter without
--    emitting a TAP line, desyncing the plan.
-- ---------------------------------------------------------------------------
-- RLS enabled (11)
SELECT ok((SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=bt.t), 'RLS ENABLED on '||bt.t)
FROM _bb_phase1_tables bt ORDER BY bt.t;

-- ---------------------------------------------------------------------------
-- 2. anon has NO table privilege on any Phase-1 table (4 × 11 = 44).
-- ---------------------------------------------------------------------------
SELECT isnt(has_table_privilege('anon', ('public.'||bt.t)::regclass, 'SELECT'), true, 'anon cannot SELECT '||bt.t)
FROM _bb_phase1_tables bt ORDER BY bt.t;
SELECT isnt(has_table_privilege('anon', ('public.'||bt.t)::regclass, 'INSERT'), true, 'anon cannot INSERT '||bt.t)
FROM _bb_phase1_tables bt ORDER BY bt.t;
SELECT isnt(has_table_privilege('anon', ('public.'||bt.t)::regclass, 'UPDATE'), true, 'anon cannot UPDATE '||bt.t)
FROM _bb_phase1_tables bt ORDER BY bt.t;
SELECT isnt(has_table_privilege('anon', ('public.'||bt.t)::regclass, 'DELETE'), true, 'anon cannot DELETE '||bt.t)
FROM _bb_phase1_tables bt ORDER BY bt.t;

-- ---------------------------------------------------------------------------
-- 3. NO policy on any Phase-1 table targets the anon role (11).
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename=bt.t AND 'anon' = ANY(p.roles)),
  0,
  'no policy on '||bt.t||' targets the anon role'
)
FROM _bb_phase1_tables bt ORDER BY bt.t;

-- ---------------------------------------------------------------------------
-- 4a. Every Phase-1 table has at least one SELECT policy (11).
-- ---------------------------------------------------------------------------
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename=bt.t AND p.cmd IN ('SELECT','ALL')),
  '>=', 1,
  bt.t||' has at least one SELECT (or ALL) policy'
)
FROM _bb_phase1_tables bt ORDER BY bt.t;

-- ---------------------------------------------------------------------------
-- 4b. Player-isolation gate present: at least one player-private table binds a
--     readable branch to the per-user identity helper. (Sentinel: attendance,
--     external_ids, acks — lift_results/readiness dropped 2026-07-04, see
--     header; their helm_lifting_* successors are not yet a sentinel here.)
--     We assert the union: across the player-private tables, every one binds
--     reads to get_my_baseball_player_id / auth.uid (no global player read).
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT COUNT(*)::int
     FROM (VALUES
       ('baseball_practice_attendance'),
       ('baseball_player_external_ids'),
       ('baseball_event_acknowledgements')
     ) AS s(t)
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname = s.t
         AND pol.polcmd IN ('r','*')  -- SELECT or ALL
         AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'')
             ~ '(get_my_baseball_player_id|auth\.uid)'
     )),
  0,
  'every player-private Phase-1 table binds a read branch to the per-user identity (no cross-player read)'
);

-- ---------------------------------------------------------------------------
-- 5. RLS helper functions exist and are NOT executable by anon (6 × 2 = 12).
-- ---------------------------------------------------------------------------
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname = bf.f),
  '>=', 1,
  'helper '||bf.f||'() exists'
)
FROM _bb_phase1_funcs bf ORDER BY bf.f;

-- anon must not be able to EXECUTE any of the gate helpers (else a player could
-- escalate by calling them directly). has_function_privilege over every
-- overload of each helper name must be false for anon.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname = bf.f
       AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon cannot EXECUTE '||bf.f||'() (any overload)'
)
FROM _bb_phase1_funcs bf ORDER BY bf.f;

SELECT * FROM finish();
ROLLBACK;
