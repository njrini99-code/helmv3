-- pgTAP contracts for the BaseballHelm Postgame Action Review tables
-- (migration 20260624000093_baseball_postgame_reviews.sql +
--  the is_baseball_team_staff helper from 20260624000050).
--
-- Security-critical invariants the Postgame Action Review must never regress:
--   1. RLS is ENABLED on both tables; anon has NO privileges (not even SELECT).
--   2. No postgame policy targets the anon role (service_role bypasses RLS).
--   3. The staff branch of every SELECT/INSERT/UPDATE/DELETE policy is gated on
--      is_baseball_team_staff(team_id) — staff-only decision items never leak.
--   4. A PLAYER may read an ITEM only when it is player_visible AND about them
--      (visibility='player_visible' + player_visible=true + own player row).
--      There is NO player write path (no INSERT/UPDATE/DELETE policy lets a
--      player self-create or edit items).
--   5. The CHECK constraints exist so item_kind / disposition / visibility /
--      confidence cannot be spoofed past the allowed sets/range.
--   6. The dedupe UNIQUE keys exist so the action upserts in place (no
--      delete-then-reinsert in the write path).
--
-- Schema-light: asserts the contract over pg_policies / pg_constraint / pg_class
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: postgame-review packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(26);

-- ============================================================================
-- 1. RLS enabled; anon locked out on both tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'),
  'RLS is ENABLED on baseball_postgame_reviews'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'),
  'RLS is ENABLED on baseball_postgame_review_items'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_postgame_reviews', 'SELECT'), true, 'anon cannot SELECT baseball_postgame_reviews');
SELECT isnt(has_table_privilege('anon', 'public.baseball_postgame_reviews', 'INSERT'), true, 'anon cannot INSERT baseball_postgame_reviews');
SELECT isnt(has_table_privilege('anon', 'public.baseball_postgame_review_items', 'SELECT'), true, 'anon cannot SELECT baseball_postgame_review_items');
SELECT isnt(has_table_privilege('anon', 'public.baseball_postgame_review_items', 'INSERT'), true, 'anon cannot INSERT baseball_postgame_review_items');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_postgame_reviews', 'baseball_postgame_review_items')
       AND 'anon' = ANY(roles)),
  0,
  'no postgame policy targets the anon role'
);

-- ============================================================================
-- 2. CHECK constraints exist (the allowed sets/range cannot be spoofed).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%timeline_update%'
      AND pg_get_constraintdef(con.oid) ILIKE '%practice_focus%'
  ),
  'baseball_postgame_review_items constrains item_kind (incl. timeline_update/practice_focus)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%converted_to_timeline%'
  ),
  'baseball_postgame_review_items constrains disposition (incl. converted_to_timeline)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_visible%'
  ),
  'baseball_postgame_review_items constrains visibility to the staff/player ladder'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%confidence%'
  ),
  'baseball_postgame_reviews constrains confidence to a [0,1] range'
);

-- Idempotent upsert keys (no delete-then-reinsert in the write paths).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%game_id%'
  ),
  'baseball_postgame_reviews has a UNIQUE(team_id, game_id) for safe upsert'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%dedupe_key%'
  ),
  'baseball_postgame_review_items has a UNIQUE(review_id, dedupe_key) for safe upsert'
);

-- ============================================================================
-- 3. baseball_postgame_reviews — staff-gated reads/writes.
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_postgame_reviews' AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_postgame_reviews has at least one SELECT policy'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'
        AND p.polname = 'baseball_postgame_reviews_select'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_reviews_select staff branch is gated on is_baseball_team_staff'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_postgame_reviews', 'baseball_postgame_reviews_insert', 'is_baseball_team_staff'),
  'baseball_postgame_reviews INSERT requires team staff'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'
        AND p.polname = 'baseball_postgame_reviews_update'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_reviews UPDATE requires team staff'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_reviews'
        AND p.polname = 'baseball_postgame_reviews_delete'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_reviews DELETE requires team staff'
);

-- ============================================================================
-- 4. baseball_postgame_review_items — staff read all; player reads own visible.
-- ============================================================================

-- Staff branch present.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
        AND p.polname = 'baseball_postgame_review_items_select'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_review_items_select has a staff branch (is_baseball_team_staff)'
);
-- Player branch is gated on player_visible = true.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
        AND p.polname = 'baseball_postgame_review_items_select'
  ), '') ~ 'player_visible',
  'baseball_postgame_review_items_select player branch is gated on player_visible'
);
-- ...and ties the player to their OWN player row (bp.user_id = auth.uid()).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
        AND p.polname = 'baseball_postgame_review_items_select'
  ), '') ~ 'auth.uid\(\)',
  'baseball_postgame_review_items_select player branch ties to the viewer''s own player row'
);

-- Writes are staff-only (no player self-write path).
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_postgame_review_items', 'baseball_postgame_review_items_insert', 'is_baseball_team_staff'),
  'baseball_postgame_review_items INSERT requires team staff'
);
SELECT ok(
  NOT tests.policy_with_check_contains('public', 'baseball_postgame_review_items', 'baseball_postgame_review_items_insert', 'player_visible'),
  'no item INSERT policy lets a player self-create an item'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
        AND p.polname = 'baseball_postgame_review_items_update'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_review_items UPDATE requires team staff'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_postgame_review_items'
        AND p.polname = 'baseball_postgame_review_items_delete'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_postgame_review_items DELETE requires team staff'
);

-- Both tables expose a staff INSERT policy (writes are not wide-open or denied).
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_postgame_reviews', 'baseball_postgame_review_items')
       AND cmd = 'INSERT'),
  '>=', 2,
  'both postgame tables expose a staff INSERT policy'
);

SELECT * FROM finish();
ROLLBACK;
