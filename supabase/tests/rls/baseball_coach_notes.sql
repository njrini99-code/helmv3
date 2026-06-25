-- pgTAP RLS contracts for BaseballHelm scoped staff notes
-- (migration 20260624000900_baseball_coach_notes.sql).
--
-- baseball_coach_notes holds staff-private observations on a player across SIX
-- visibility scopes (staff_public / coach_group / strength / academic /
-- player_visible / hidden_from_player). The migration's central guarantee is that
-- RLS *enforces* the scopes — not the UI: the subject PLAYER may read ONLY their
-- OWN 'player_visible' notes, and 'hidden_from_player' is the strictest scope a
-- player must never reach. This directly backs the v10 QA items "No sensitive data
-- leakage" and "Player cannot access staff-only cards".
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges.
--   2. The SELECT policy ties the player branch to BOTH scope = 'player_visible'
--      AND the player's OWN identity (baseball_players.user_id = auth.uid()); the
--      staff branch is gated by is_baseball_team_coach_v2 + per-scope capability.
--   3. The per-scope CASE distinguishes the private scopes — coach_group /
--      hidden_from_player require can_view_private_notes, strength requires
--      can_manage_lifting, academic requires can_view_academics (via
--      baseball_staff_has_note_capability), so a generic staffer cannot read a
--      private/academic/strength note.
--   4. No DELETE policy exists (soft-delete only — no hard row delete for any
--      non-service role).
--   5. No policy targets anon; the scope enum carries hidden_from_player.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_type without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: v7 Player Profile Snapshot System §"Staff Notes".

BEGIN;
\ir _helpers.sql

SELECT plan(13);

-- ============================================================================
-- 1. RLS enabled; anon locked out of every verb.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'),
  'RLS is ENABLED on baseball_coach_notes'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_notes', 'SELECT'), true, 'anon cannot SELECT baseball_coach_notes');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_notes', 'INSERT'), true, 'anon cannot INSERT baseball_coach_notes');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_notes', 'UPDATE'), true, 'anon cannot UPDATE baseball_coach_notes');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_notes', 'DELETE'), true, 'anon cannot DELETE baseball_coach_notes');

-- ============================================================================
-- 2. SELECT policy: player branch bound to player_visible + own identity.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_coach_notes'
      AND policyname = 'baseball_coach_notes_select'
      AND cmd = 'SELECT'
  ),
  'baseball_coach_notes has a named SELECT policy'
);

-- The player read branch must be gated by scope = 'player_visible'.
SELECT ok(
  position('player_visible' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'
        AND p.polname = 'baseball_coach_notes_select'
  ), '')) > 0,
  'baseball_coach_notes SELECT policy gates a branch on scope = player_visible'
);

-- The player read branch is tied to the player's OWN identity (no cross-player
-- read), and the staff branch is gated by is_baseball_team_coach_v2.
SELECT ok(
  position('baseball_players' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'
        AND p.polname = 'baseball_coach_notes_select'
  ), '')) > 0
  AND position('is_baseball_team_coach_v2' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'
        AND p.polname = 'baseball_coach_notes_select'
  ), '')) > 0,
  'baseball_coach_notes SELECT policy ties player reads to own baseball_players identity and staff reads to is_baseball_team_coach_v2'
);

-- ============================================================================
-- 3. Per-scope capability gating: the private scopes require the right cap.
--    (A bare is_baseball_team_coach_v2 with NO capability gate would let any
--     staffer read coach_group/strength/academic/hidden notes — a leak.)
-- ============================================================================

SELECT ok(
  position('baseball_staff_has_note_capability' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'
        AND p.polname = 'baseball_coach_notes_select'
  ), '')) > 0,
  'baseball_coach_notes SELECT policy applies per-scope capability gating (baseball_staff_has_note_capability)'
);

SELECT ok(
  EXISTS (
    SELECT 1 WHERE COALESCE((
      SELECT pg_get_expr(p.polqual, p.polrelid)
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_notes'
          AND p.polname = 'baseball_coach_notes_select'
    ), '') LIKE '%hidden_from_player%'
  ),
  'baseball_coach_notes SELECT policy explicitly references the hidden_from_player scope (strictest gate)'
);

-- ============================================================================
-- 4. No DELETE policy (soft-delete only).
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_coach_notes'
       AND cmd IN ('DELETE', 'ALL')),
  0,
  'baseball_coach_notes exposes NO client DELETE policy (soft-delete via deleted_at only)'
);

-- ============================================================================
-- 5. No policy targets anon; the scope enum carries hidden_from_player.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_coach_notes'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_coach_notes policy targets the anon role'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'baseball_note_scope'
      AND e.enumlabel = 'hidden_from_player'
  ),
  'baseball_note_scope enum carries the hidden_from_player label'
);

SELECT * FROM finish();
ROLLBACK;
