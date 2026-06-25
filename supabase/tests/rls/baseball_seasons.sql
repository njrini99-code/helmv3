-- pgTAP contracts for the BaseballHelm Team + Season settings tables
-- (migration 20260624000095_baseball_team_and_season_settings.sql).
--
-- Security-critical invariants the Season settings surface must never regress:
--   1. RLS is ENABLED on baseball_seasons; anon has no privileges and no policy
--      targets the anon role.
--   2. WRITE policies are capability-gated on can_manage_settings (INSERT/UPDATE),
--      DELETE is primary-coach only; READ admits team staff OR team member (a
--      player can see the current season + what it runs, but never write).
--   3. Enumerated controls cannot be spoofed: CHECK constraints exist on phase
--      and status.
--   4. Exactly one current season per team is enforced (partial unique index on
--      is_current = true).
--   5. The team join-policy columns added to baseball_teams have a CHECK on
--      invite_policy and secure defaults (require_coach_approval defaults true,
--      allow_player_self_join defaults false).
--
-- Schema-light: asserts the contract over pg_policies / pg_constraint /
-- pg_index / pg_attrdef without seeding integration data (matches the deferral
-- note in the other baseball RLS suites).
--
-- Source: Wave 4 qa-screens packet (BaseballHelm settings routes coverage).

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- 1. RLS enabled on baseball_seasons.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_seasons'),
  'RLS is ENABLED on baseball_seasons'
);

-- ============================================================================
-- 2. anon locked out — no table privileges, no policy targets anon.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_seasons', 'SELECT'), true, 'anon cannot SELECT baseball_seasons');
SELECT isnt(has_table_privilege('anon', 'public.baseball_seasons', 'INSERT'), true, 'anon cannot INSERT baseball_seasons');
SELECT isnt(has_table_privilege('anon', 'public.baseball_seasons', 'UPDATE'), true, 'anon cannot UPDATE baseball_seasons');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_seasons'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_seasons policy targets the anon role'
);

-- ============================================================================
-- 3. Write policies capability-gated; read admits staff OR member.
-- ============================================================================

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_seasons' AND cmd='INSERT' AND with_check LIKE '%can_manage_settings%'),
  'baseball_seasons INSERT is gated on can_manage_settings'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_seasons' AND cmd='UPDATE' AND qual LIKE '%can_manage_settings%'),
  'baseball_seasons UPDATE is gated on can_manage_settings'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_seasons' AND cmd='DELETE' AND qual LIKE '%is_baseball_primary_coach%'),
  'baseball_seasons DELETE is primary-coach only'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_seasons'
      AND cmd='SELECT'
      AND qual LIKE '%is_baseball_team_staff%'
      AND qual LIKE '%is_baseball_team_member%'
  ),
  'baseball_seasons SELECT admits both team staff and team members'
);

-- ============================================================================
-- 4. Enumerated controls cannot be spoofed (CHECK on phase + status).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_seasons'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%phase%'
  ),
  'baseball_seasons has a CHECK constraint on phase'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_seasons'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%status%'
  ),
  'baseball_seasons has a CHECK constraint on status'
);

-- ============================================================================
-- 5. Exactly one current season per team (partial unique index).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='baseball_seasons'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%is_current%'
  ),
  'baseball_seasons has a partial UNIQUE index enforcing one current season per team'
);

-- ============================================================================
-- 6. Team join-policy columns: CHECK on invite_policy + secure defaults.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_teams'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%invite_policy%'
  ),
  'baseball_teams has a CHECK constraint on invite_policy'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%true%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_teams'
       AND a.attname='require_coach_approval'),
  'require_coach_approval DEFAULT is true (secure-by-default)'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%false%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_teams'
       AND a.attname='allow_player_self_join'),
  'allow_player_self_join DEFAULT is false (secure-by-default)'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%invite_only%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_teams'
       AND a.attname='invite_policy'),
  'invite_policy DEFAULT is invite_only (safest)'
);

-- ============================================================================
-- 7. Season-specific module toggles exist.
-- ============================================================================

SELECT has_column('public', 'baseball_seasons', 'roster_enabled', 'baseball_seasons.roster_enabled exists');
SELECT has_column('public', 'baseball_seasons', 'performance_baselines_enabled', 'baseball_seasons.performance_baselines_enabled exists');

SELECT * FROM finish();
ROLLBACK;
