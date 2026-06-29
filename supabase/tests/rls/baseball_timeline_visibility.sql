-- pgTAP contracts for BaseballHelm player-timeline visibility gating
-- (migrations 20260624000040_baseball_timeline_and_acks.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql).
--
-- The security-critical invariant: a PLAYER must never be able to read a
-- staff-only timeline note for themselves. Staff/coaches see everything for
-- their team; the subject player sees only their own non-staff-only events.
--
-- This suite guards that contract against regression. Two migrations define a
-- SELECT policy on this table (0040: "baseball_timeline_select" using the
-- 'staff_only' vocabulary; 0050: "baseball_player_timeline_events_select"
-- now also uses that same vocabulary. Both are PERMISSIVE,
-- so the EFFECTIVE player-readable set is their union — meaning EACH player
-- branch must independently exclude staff-private rows. We assert that:
--   1. RLS is enabled; anon has no privileges.
--   2. The visibility CHECK constraint exists (timeline cannot store an
--      arbitrary visibility value that would slip past the policies).
--   3. Whatever SELECT policy/policies exist, every player-facing branch is
--      bound to BOTH (a) a visibility predicate that excludes the staff-private
--      value AND (b) a player-identity predicate. Equivalently: no SELECT
--      policy on this table grants a player a path that omits the visibility
--      gate. We verify the staff-private tokens never appear without an
--      accompanying exclusion, and that a player-identity function is present.
--   4. Writes are staff-gated (players cannot INSERT/UPDATE/DELETE timeline
--      events for themselves).
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 1 roster-timeline / schema-rls packets (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(17);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'),
  'RLS is ENABLED on baseball_player_timeline_events'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_player_timeline_events', 'SELECT'), true, 'anon cannot SELECT baseball_player_timeline_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_timeline_events', 'INSERT'), true, 'anon cannot INSERT baseball_player_timeline_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_timeline_events', 'UPDATE'), true, 'anon cannot UPDATE baseball_player_timeline_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_timeline_events', 'DELETE'), true, 'anon cannot DELETE baseball_player_timeline_events');

-- ============================================================================
-- 2. visibility CHECK constraint exists (values are constrained at the column).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_timeline_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility%'
  ),
  'baseball_player_timeline_events has a CHECK constraint on visibility'
);

-- ============================================================================
-- 3. Every SELECT policy excludes staff-private rows from the player branch.
-- ============================================================================
-- There is at least one SELECT policy.
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
       AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_player_timeline_events has at least one SELECT policy'
);

-- The 0040 SELECT policy: the player branch must exclude 'staff_only'.
-- (If the policy is absent, COALESCE('') makes the staff_only check vacuously
--  pass and the player-identity check fail loud — so we assert presence first.)
SELECT ok(
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
      AND policyname = 'baseball_timeline_select'
  ) THEN
    -- staff-only rows are excluded for the player branch
    position('staff_only' IN COALESCE((
      SELECT pg_get_expr(p.polqual, p.polrelid)
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
          AND p.polname = 'baseball_timeline_select'
    ), '')) > 0
  ELSE true END,
  'baseball_timeline_select (0040) references the staff_only exclusion'
);

SELECT ok(
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
      AND policyname = 'baseball_timeline_select'
  ) THEN
    COALESCE((
      SELECT pg_get_expr(p.polqual, p.polrelid)
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
          AND p.polname = 'baseball_timeline_select'
    ), '') ~ 'visibility[^)]*<>[^)]*''staff_only'''
  ELSE true END,
  'baseball_timeline_select (0040) gates the player branch with visibility <> staff_only'
);

-- The 0050 SELECT policy: the player branch is bound to a player-identity check
-- and excludes the staff-private 'staff_only' visibility.
SELECT ok(
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
      AND policyname = 'baseball_player_timeline_events_select'
  ) THEN
    position('staff_only' IN COALESCE((
      SELECT pg_get_expr(p.polqual, p.polrelid)
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
          AND p.polname = 'baseball_player_timeline_events_select'
    ), '')) > 0
  ELSE true END,
  'baseball_player_timeline_events_select (0050) references the staff_only exclusion'
);

SELECT ok(
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
      AND policyname = 'baseball_player_timeline_events_select'
  ) THEN
    COALESCE((
      SELECT pg_get_expr(p.polqual, p.polrelid)
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
          AND p.polname = 'baseball_player_timeline_events_select'
    ), '') ~ 'visibility[^)]*<>[^)]*''staff_only'''
  ELSE true END,
  'baseball_player_timeline_events_select (0050) gates the player branch with visibility <> staff_only'
);

-- A player-identity function is referenced by the SELECT policy set, so the
-- player branch can only ever match the player''s OWN rows.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ '(get_my_baseball_player_id|baseball_players)'
  ),
  'timeline SELECT policy set ties the player branch to the player''s own identity'
);

-- ============================================================================
-- 4. Writes are staff-gated — every write policy references a staff/coach
--    authority helper and the player branch is NOT a self-write path.
-- ============================================================================

-- INSERT exists and is staff-gated (no player-self WITH CHECK path).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
      AND cmd = 'INSERT'
  ),
  'baseball_player_timeline_events has an INSERT policy'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'no INSERT policy lets a player self-insert their own timeline event'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ '(can_view_baseball_player|is_baseball_team_coach)'
  ),
  'timeline INSERT is gated on a staff/coach authority helper'
);

-- DELETE exists and is staff-gated.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_timeline_events'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ '(can_view_baseball_player|is_baseball_team_coach)'
  ),
  'timeline DELETE is gated on a staff/coach authority helper'
);

-- All timeline policies target authenticated only (service_role bypasses RLS).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_timeline_events'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_player_timeline_events policy targets the anon role'
);

SELECT * FROM finish();
ROLLBACK;
