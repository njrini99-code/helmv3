-- pgTAP contract for the BaseballHelm program-identity columns added to
-- baseball_teams by migration 20260624000091_baseball_program_identity.sql
-- (public_profile_mode, player_account_policy, default_team_id).
--
-- No NEW table is created by that migration (columns are added to the existing,
-- already-RLS-protected baseball_teams), so these are SCHEMA contracts plus a
-- re-assertion that baseball_teams RLS is still enabled — i.e. the new identity
-- columns inherit the existing capability-gated baseball_teams write policy and
-- are never exposed via a fresh, unguarded surface.
--
-- Invariants:
--   1. RLS remains ENABLED on baseball_teams (identity writes stay gated).
--   2. The three new identity columns exist.
--   3. CHECK constraints exist on public_profile_mode + player_account_policy so
--      the enumerated controls cannot be spoofed to arbitrary values.
--   4. Safe defaults: public_profile_mode='private', player_account_policy=
--      'invite_only' (branding/exposure never opens without an explicit opt-in).
--   5. default_team_id is a self-FK with ON DELETE SET NULL (removing a team
--      never orphans the pointer).
--
-- Schema-light: asserts the contract over the catalog without seeding rows,
-- matching the deferral note in the other baseball RLS suites.
--
-- Source: Wave 4 settings-os packet (program-identity completeness follow-up).

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- 1. RLS still enabled on baseball_teams.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_teams'),
  'RLS is ENABLED on baseball_teams'
);

-- ============================================================================
-- 2. New identity columns exist.
-- ============================================================================

SELECT has_column('public', 'baseball_teams', 'public_profile_mode',
  'baseball_teams.public_profile_mode exists');
SELECT has_column('public', 'baseball_teams', 'player_account_policy',
  'baseball_teams.player_account_policy exists');
SELECT has_column('public', 'baseball_teams', 'default_team_id',
  'baseball_teams.default_team_id exists');

-- ============================================================================
-- 3. CHECK constraints on the enumerated identity columns.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_teams'
      AND con.contype='c'
      AND pg_get_constraintdef(con.oid) LIKE '%public_profile_mode%'
  ),
  'baseball_teams has a CHECK on public_profile_mode'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_teams'
      AND con.contype='c'
      AND pg_get_constraintdef(con.oid) LIKE '%player_account_policy%'
  ),
  'baseball_teams has a CHECK on player_account_policy'
);

-- ============================================================================
-- 4. Safe defaults.
-- ============================================================================

SELECT ok(
  (SELECT pg_get_expr(d.adbin, d.adrelid)
     FROM pg_attrdef d
     JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     JOIN pg_class c ON c.oid = d.adrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_teams'
       AND a.attname='public_profile_mode') LIKE '%private%',
  'baseball_teams.public_profile_mode defaults to private'
);
SELECT ok(
  (SELECT pg_get_expr(d.adbin, d.adrelid)
     FROM pg_attrdef d
     JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     JOIN pg_class c ON c.oid = d.adrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_teams'
       AND a.attname='player_account_policy') LIKE '%invite_only%',
  'baseball_teams.player_account_policy defaults to invite_only'
);

-- ============================================================================
-- 5. default_team_id is a self-FK with ON DELETE SET NULL.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class rc ON rc.oid = con.confrelid
    WHERE con.contype='f'
      AND c.relname='baseball_teams'
      AND rc.relname='baseball_teams'
      AND con.confdeltype='n'  -- 'n' = SET NULL
      AND pg_get_constraintdef(con.oid) LIKE '%default_team_id%'
  ),
  'baseball_teams.default_team_id is a self-FK ON DELETE SET NULL'
);

SELECT * FROM finish();
ROLLBACK;
