-- pgTAP contracts for the BaseballHelm video-classes packet
-- (migration 20260624000221_baseball_video_links_and_class_conflicts.sql).
--
-- Two security-critical contracts:
--
--   (A) baseball_class_conflicts — academic-adjacent. A PLAYER must never read a
--       staff_only conflict, and a NON-ACADEMIC staffer must never read class
--       detail. So:
--         * RLS enabled; anon has no privileges.
--         * visibility + severity + disposition CHECK constraints exist.
--         * The SELECT policy's player branch is bound to BOTH a visibility
--           predicate that excludes staff_only AND a player-identity predicate.
--         * The SELECT/INSERT/UPDATE staff branch references can_view_academics
--           (class detail is gated on the academic capability, not bare staff).
--         * Writes are staff-gated (no player self-write path).
--
--   (B) baseball_video_events — the 0220 columns must NOT have widened access.
--       The elite-stat model installed per-player RLS on this table; we assert
--       RLS is still enabled, anon is still locked out, and the new
--       reviewed_by_player_at / players_tagged / source_refs columns exist.
--
-- Schema-light: asserts over pg_policy / pg_constraint / pg_attribute without
-- seeding integration data (matches the deferral note in _helpers.sql).

BEGIN;
\ir _helpers.sql

SELECT plan(24);

-- ============================================================================
-- (A) baseball_class_conflicts
-- ============================================================================

-- 1. RLS enabled; anon locked out.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'),
  'RLS is ENABLED on baseball_class_conflicts'
);
SELECT isnt(has_table_privilege('anon', 'public.baseball_class_conflicts', 'SELECT'), true, 'anon cannot SELECT baseball_class_conflicts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_class_conflicts', 'INSERT'), true, 'anon cannot INSERT baseball_class_conflicts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_class_conflicts', 'UPDATE'), true, 'anon cannot UPDATE baseball_class_conflicts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_class_conflicts', 'DELETE'), true, 'anon cannot DELETE baseball_class_conflicts');

-- 2. CHECK constraints exist (visibility / severity / disposition).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility%'
  ),
  'baseball_class_conflicts has a CHECK on visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%severity%'
  ),
  'baseball_class_conflicts has a CHECK on severity'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%disposition%'
  ),
  'baseball_class_conflicts has a CHECK on disposition'
);

-- 3. At least one SELECT policy, and the player branch excludes staff_only.
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_class_conflicts'
       AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_class_conflicts has at least one SELECT policy'
);

-- The SELECT policy's player branch must reference visibility <> staff_only.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
        AND p.polname = 'baseball_class_conflicts_select'
  ), '') ~ 'visibility[^)]*<>[^)]*''staff_only''',
  'class_conflicts SELECT gates the player branch with visibility <> staff_only'
);

-- The SELECT policy ties the player branch to the player''s own identity.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
        AND p.polname = 'baseball_class_conflicts_select'
  ), '') ~ 'get_my_baseball_player_id',
  'class_conflicts SELECT ties the player branch to the player''s own identity'
);

-- 4. Class detail (the staff branch) is gated on can_view_academics, not bare
--    staff. SELECT, INSERT, and UPDATE all reference the academic capability.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
        AND p.polname = 'baseball_class_conflicts_select'
  ), '') ~ 'can_view_academics',
  'class_conflicts SELECT staff branch requires can_view_academics'
);
SELECT ok(
  tests.policy_with_check_contains(
    'public', 'baseball_class_conflicts',
    'baseball_class_conflicts_insert', 'can_view_academics'
  ),
  'class_conflicts INSERT requires can_view_academics'
);
SELECT ok(
  tests.policy_with_check_contains(
    'public', 'baseball_class_conflicts',
    'baseball_class_conflicts_update', 'can_view_academics'
  ),
  'class_conflicts UPDATE requires can_view_academics'
);

-- 5. No write policy lets a player self-insert/update a conflict.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'no INSERT policy lets a player self-insert a class conflict'
);

-- 6. DELETE is primary-coach gated.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_class_conflicts'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_primary_coach'
  ),
  'class_conflicts DELETE is gated on is_baseball_primary_coach'
);

-- 7. No policy targets the anon role.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_class_conflicts'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_class_conflicts policy targets the anon role'
);

-- 8. Partial-unique dedupe index on OPEN rows exists (re-derivation UPSERTs).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'baseball_class_conflicts'
      AND indexname = 'baseball_class_conflicts_dedupe_open_uidx'
  ),
  'class_conflicts has the partial-unique open-dedupe index'
);

-- ============================================================================
-- (B) baseball_video_events — 0220 columns did not widen access
-- ============================================================================

-- 9. RLS still enabled; anon still locked out.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_video_events'),
  'RLS remains ENABLED on baseball_video_events'
);
SELECT isnt(has_table_privilege('anon', 'public.baseball_video_events', 'SELECT'), true, 'anon cannot SELECT baseball_video_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_video_events', 'INSERT'), true, 'anon cannot INSERT baseball_video_events');

-- 10. The V6 video-object columns this packet added exist.
SELECT has_column('public', 'baseball_video_events', 'reviewed_by_player_at',
  'baseball_video_events has reviewed_by_player_at (V6 player-reviewed)');
SELECT has_column('public', 'baseball_video_events', 'players_tagged',
  'baseball_video_events has players_tagged (V6 multi-tag)');
SELECT has_column('public', 'baseball_video_events', 'source_refs',
  'baseball_video_events has source_refs (provenance ledger)');

SELECT * FROM finish();
ROLLBACK;
