-- pgTAP RLS contracts for BaseballHelm timeline-event acknowledgements
-- (migration 20260624000430_baseball_timeline_event_acks.sql).
--
-- DISTINCT TABLE from baseball_event_acknowledgements (which acks CALENDAR events
-- via an FK to baseball_events and is covered by
-- baseball_event_acknowledgements.sql). baseball_timeline_event_acks is a per-user
-- read-receipt on a baseball_player_timeline_events row, with a VISIBILITY-AWARE
-- write boundary: a user may ack only an event they can actually SEE, so a player
-- can NEVER ack (and thus never enumerate) a staff_only timeline row. This backs
-- the v10 QA items "No sensitive data leakage" / "Player cannot access staff-only
-- cards" at the DB layer.
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges.
--   2. Every write verb is self-scoped: INSERT/UPDATE/DELETE require
--      user_id = auth.uid() (ack/unack as yourself only).
--   3. The INSERT WITH CHECK mirrors the timeline SELECT predicate — a non-staff
--      user may ack ONLY a non-staff_only event that is their OWN
--      (visibility <> 'staff_only' AND e.player_id = my player id), so a player
--      cannot ack a staff_only row.
--   4. SELECT admits the user's own acks OR the team coach/staff of the underlying
--      event (is_baseball_team_coach_v2) — no cross-tenant read.
--   5. No policy targets anon; the (timeline_event_id, user_id) pair is UNIQUE
--      (one ack per user per event).
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: source -> signal -> action -> TIMELINE -> OUTCOME display loop.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- 1. RLS enabled; anon locked out of every verb.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'),
  'RLS is ENABLED on baseball_timeline_event_acks'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_timeline_event_acks', 'SELECT'), true, 'anon cannot SELECT baseball_timeline_event_acks');
SELECT isnt(has_table_privilege('anon', 'public.baseball_timeline_event_acks', 'INSERT'), true, 'anon cannot INSERT baseball_timeline_event_acks');
SELECT isnt(has_table_privilege('anon', 'public.baseball_timeline_event_acks', 'UPDATE'), true, 'anon cannot UPDATE baseball_timeline_event_acks');
SELECT isnt(has_table_privilege('anon', 'public.baseball_timeline_event_acks', 'DELETE'), true, 'anon cannot DELETE baseball_timeline_event_acks');

-- ============================================================================
-- 2. Every write verb is self-scoped (user_id = auth.uid()).
-- ============================================================================

SELECT ok(
  position('auth.uid()' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
        AND p.polname = 'baseball_timeline_acks_insert'
  ), '')) > 0,
  'baseball_timeline_event_acks INSERT WITH CHECK requires user_id = auth.uid()'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_timeline_event_acks'
      AND cmd = 'UPDATE'
      AND qual ILIKE '%auth.uid()%' AND with_check ILIKE '%auth.uid()%'
  ),
  'baseball_timeline_event_acks UPDATE policy is self-scoped (user_id = auth.uid())'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_timeline_event_acks'
      AND cmd = 'DELETE' AND qual ILIKE '%auth.uid()%'
  ),
  'baseball_timeline_event_acks DELETE policy is self-scoped (withdraw own ack only)'
);

-- ============================================================================
-- 3. INSERT mirrors the timeline visibility predicate — a player may ack ONLY a
--    non-staff_only event that is theirs. The WITH CHECK must reference BOTH the
--    staff_only exclusion AND the underlying timeline event table.
-- ============================================================================

SELECT ok(
  (SELECT pg_get_expr(p.polwithcheck, p.polrelid)
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
       AND p.polname = 'baseball_timeline_acks_insert') ~ 'staff_only'
  AND (SELECT pg_get_expr(p.polwithcheck, p.polrelid)
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
           AND p.polname = 'baseball_timeline_acks_insert') ~ 'baseball_player_timeline_events',
  'baseball_timeline_event_acks INSERT WITH CHECK gates on the timeline event visibility (excludes staff_only) against baseball_player_timeline_events'
);

-- ============================================================================
-- 4. SELECT: own acks OR team coach/staff of the underlying event.
-- ============================================================================

SELECT ok(
  (SELECT pg_get_expr(p.polqual, p.polrelid)
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
       AND p.polname = 'baseball_timeline_acks_select') ~ 'auth.uid()'
  AND (SELECT pg_get_expr(p.polqual, p.polrelid)
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
           AND p.polname = 'baseball_timeline_acks_select') ~ 'is_baseball_team_coach_v2',
  'baseball_timeline_event_acks SELECT policy admits own acks OR the team coach/staff (is_baseball_team_coach_v2) of the underlying event'
);

-- ============================================================================
-- 5. No policy targets anon; one ack per (event, user).
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_timeline_event_acks'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_timeline_event_acks policy targets the anon role'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_timeline_event_acks'
      AND con.contype = 'u'
      AND con.conname = 'baseball_timeline_event_acks_event_user_key'
  ),
  'baseball_timeline_event_acks enforces UNIQUE (timeline_event_id, user_id) — one ack per user per event'
);

SELECT * FROM finish();
ROLLBACK;
