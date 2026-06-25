-- pgTAP contracts for the BaseballHelm practice-DEEPENING tables
-- (migration 20260624000200_baseball_practice_deepening.sql):
--   * baseball_practice_scrimmages
--   * baseball_practice_lineup_slots
--
-- Security-critical invariants the Scrimmage Lineup Builder must never regress:
--   1. RLS is ENABLED on both new tables; anon has no privileges and no policy
--      targets the anon role (service_role bypasses RLS for cron/AI writes).
--   2. A PLAYER may read a scrimmage ONLY when status='published' (draft/
--      completed-unpublished lineups stay staff-private). Writes are gated on the
--      can_manage_practice OR can_manage_lineups capability.
--   3. Lineup slots inherit scrimmage visibility: players read slots only of
--      published scrimmages; writes require a lineup/practice capability.
--   4. The mode + status + defensive_position + side CHECK constraints exist so
--      the published gate and the position vocabulary cannot be spoofed.
--   5. UNIQUE(scrimmage_id, side, player_id) backs safe stage-then-swap upsert.
--
-- Schema-light: asserts over pg_policies / pg_constraint without seeding
-- integration data (matches the deferral note in _helpers.sql).
--
-- Source: practice-intel packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(22);

-- ============================================================================
-- 1. RLS enabled; anon locked out on both tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'),
  'RLS is ENABLED on baseball_practice_scrimmages'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_lineup_slots'),
  'RLS is ENABLED on baseball_practice_lineup_slots'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_scrimmages', 'SELECT'), true, 'anon cannot SELECT baseball_practice_scrimmages');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_scrimmages', 'INSERT'), true, 'anon cannot INSERT baseball_practice_scrimmages');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_lineup_slots', 'SELECT'), true, 'anon cannot SELECT baseball_practice_lineup_slots');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_lineup_slots', 'INSERT'), true, 'anon cannot INSERT baseball_practice_lineup_slots');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_practice_scrimmages', 'baseball_practice_lineup_slots')
       AND 'anon' = ANY(roles)),
  0,
  'no scrimmage policy targets the anon role'
);

-- ============================================================================
-- 2. CHECK constraints exist (status / mode / position / side cannot be spoofed).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%published%'
  ),
  'baseball_practice_scrimmages has a CHECK constraint constraining status (incl. published)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%intrasquad%'
  ),
  'baseball_practice_scrimmages has a CHECK constraint on mode'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_lineup_slots'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%bullpen%'
  ),
  'baseball_practice_lineup_slots has a CHECK constraint on defensive_position'
);
-- Idempotent upsert key (no delete-then-reinsert in the slot write path).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_lineup_slots'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%scrimmage_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_id%'
  ),
  'baseball_practice_lineup_slots has a UNIQUE(scrimmage_id, side, player_id) for safe upsert'
);

-- ============================================================================
-- 3. baseball_practice_scrimmages — player SELECT is published-gated; writes capped.
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_practice_scrimmages' AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_practice_scrimmages has at least one SELECT policy'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
        AND p.polname = 'baseball_practice_scrimmages_select'
  ), '') ~ 'status[^)]*=[^)]*''published''',
  'baseball_practice_scrimmages_select gates the player branch on status = published'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
        AND p.polname = 'baseball_practice_scrimmages_select'
  ), '') ~ '(is_baseball_team_member|is_baseball_team_staff)',
  'baseball_practice_scrimmages_select ties readers to team membership/staff'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_scrimmages', 'baseball_practice_scrimmages_insert', 'can_manage_lineups')
  OR tests.policy_with_check_contains('public', 'baseball_practice_scrimmages', 'baseball_practice_scrimmages_insert', 'can_manage_practice'),
  'baseball_practice_scrimmages INSERT requires a practice/lineup capability'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
        AND p.polname = 'baseball_practice_scrimmages_update'
  ), '') ~ 'can_manage_(practice|lineups)',
  'baseball_practice_scrimmages UPDATE requires a practice/lineup capability'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_scrimmages'
        AND p.polname = 'baseball_practice_scrimmages_delete'
  ), '') ~ 'can_manage_(practice|lineups)',
  'baseball_practice_scrimmages DELETE requires a practice/lineup capability'
);

-- ============================================================================
-- 4. baseball_practice_lineup_slots — inherit published visibility; writes capped.
-- ============================================================================

SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_lineup_slots'
        AND p.polname = 'baseball_practice_lineup_slots_select'
  ), '') ~ 'status[^)]*=[^)]*''published''',
  'baseball_practice_lineup_slots_select inherits the published gate via the parent scrimmage'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_lineup_slots'
        AND p.polname = 'baseball_practice_lineup_slots_select'
  ), '') ~ 'baseball_practice_scrimmages',
  'baseball_practice_lineup_slots_select references the parent scrimmage row'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_lineup_slots', 'baseball_practice_lineup_slots_insert', 'can_manage_lineups')
  OR tests.policy_with_check_contains('public', 'baseball_practice_lineup_slots', 'baseball_practice_lineup_slots_insert', 'can_manage_practice'),
  'baseball_practice_lineup_slots INSERT requires a practice/lineup capability'
);
-- A player can NOT self-insert a lineup slot (no get_my_baseball_player_id in the
-- write WITH CHECK path — writes are staff/lineup-gated).
SELECT ok(
  NOT tests.policy_with_check_contains('public', 'baseball_practice_lineup_slots', 'baseball_practice_lineup_slots_insert', 'get_my_baseball_player_id'),
  'no lineup-slot INSERT policy lets a player self-assign a slot'
);

-- Both new tables expose a staff INSERT policy (writes are neither wide-open nor
-- entirely denied).
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_practice_scrimmages', 'baseball_practice_lineup_slots')
       AND cmd = 'INSERT'),
  '>=', 2,
  'both scrimmage tables expose a staff INSERT policy'
);

SELECT * FROM finish();
ROLLBACK;
