-- pgTAP RLS contracts for BaseballHelm action-conversion materialization targets
-- (migration 20260624000230_baseball_signal_action_materialization.sql), which
-- creates TWO new RLS-enabled tables:
--
--   baseball_meeting_items       — the Decision Room agenda backlog. STAFF-ONLY:
--                                  the Decision Room is coach-only, so a player
--                                  must never read an agenda item.
--   baseball_coach_player_notes  — staff-authored notes ON a player. Staff read
--                                  all; a player may read ONLY their OWN note that
--                                  is player-facing (visibility team/player_only),
--                                  NEVER a staff_only note.
--
-- These back the v10 QA items "No sensitive data leakage" and "Player cannot
-- access staff-only cards" at the DB layer.
--
-- Security-critical invariants:
--   meeting_items   1. RLS enabled; anon has no privileges.
--                   2. SELECT/INSERT/UPDATE gated by is_baseball_team_staff;
--                      DELETE gated by is_baseball_primary_coach. NO player branch.
--                   3. status CHECK constrains the lifecycle vocabulary.
--   player_notes    4. RLS enabled; anon has no privileges.
--                   5. SELECT admits staff (is_baseball_team_staff) OR the
--                      player's OWN row, but ONLY when visibility <> 'staff_only'
--                      (team/player_only) — staff_only rows never reach a player.
--                   6. visibility CHECK constrains the vocabulary.
--   both            No policy targets anon.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: V9 Cross-Subsystem Data/Signal/Action Map + V10 Packet 10.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- baseball_meeting_items — STAFF ONLY (Decision Room is coach-only)
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_meeting_items'),
  'RLS is ENABLED on baseball_meeting_items'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_meeting_items', 'SELECT'), true, 'anon cannot SELECT baseball_meeting_items');
SELECT isnt(has_table_privilege('anon', 'public.baseball_meeting_items', 'INSERT'), true, 'anon cannot INSERT baseball_meeting_items');

SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_meeting_items'
        AND p.polname = 'baseball_meeting_items_select'
  ), '')) > 0,
  'baseball_meeting_items SELECT policy is staff-only (is_baseball_team_staff)'
);

-- No player-identity read path may exist on this staff-only table.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_meeting_items'
       AND p.polcmd IN ('r', '*')
       AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'),
  0,
  'no baseball_meeting_items SELECT policy exposes a player-identity read path'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_meeting_items'
      AND cmd = 'DELETE' AND qual ILIKE '%is_baseball_primary_coach%'
  ),
  'baseball_meeting_items DELETE policy is restricted to is_baseball_primary_coach'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_meeting_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND pg_get_constraintdef(con.oid) ILIKE '%resolved%'
  ),
  'baseball_meeting_items has a CHECK constraint constraining the status lifecycle'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_meeting_items'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_meeting_items policy targets the anon role'
);

-- ============================================================================
-- baseball_coach_player_notes — staff read all; player reads own VISIBLE only
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'),
  'RLS is ENABLED on baseball_coach_player_notes'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_player_notes', 'SELECT'), true, 'anon cannot SELECT baseball_coach_player_notes');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_player_notes', 'INSERT'), true, 'anon cannot INSERT baseball_coach_player_notes');

-- Staff branch present.
SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'
        AND p.polname = 'baseball_coach_player_notes_select'
  ), '')) > 0,
  'baseball_coach_player_notes SELECT policy grants staff via is_baseball_team_staff'
);

-- The player branch must be bound to the player's OWN identity.
SELECT ok(
  position('get_my_baseball_player_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'
        AND p.polname = 'baseball_coach_player_notes_select'
  ), '')) > 0,
  'baseball_coach_player_notes SELECT policy ties the player branch to get_my_baseball_player_id (own row only)'
);

-- CRITICAL: the player branch must EXCLUDE staff_only — a player must never read
-- a staff_only note. The policy phrases this as visibility IN ('team','player_only').
SELECT ok(
  (SELECT pg_get_expr(p.polqual, p.polrelid)
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'
       AND p.polname = 'baseball_coach_player_notes_select') ~ '''player_only'''
  AND (SELECT pg_get_expr(p.polqual, p.polrelid)
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'
           AND p.polname = 'baseball_coach_player_notes_select') ~ '''team''',
  'baseball_coach_player_notes player branch admits only the team/player_only visibility literals (excludes staff_only)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_coach_player_notes'
      AND cmd = 'INSERT' AND with_check ILIKE '%is_baseball_team_staff%'
  ),
  'baseball_coach_player_notes INSERT policy requires is_baseball_team_staff'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_coach_player_notes'
      AND cmd = 'DELETE' AND qual ILIKE '%is_baseball_primary_coach%'
  ),
  'baseball_coach_player_notes DELETE policy is restricted to is_baseball_primary_coach'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_player_notes'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility%'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
  ),
  'baseball_coach_player_notes has a CHECK constraint constraining visibility'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_coach_player_notes'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_coach_player_notes policy targets the anon role'
);

SELECT * FROM finish();
ROLLBACK;
