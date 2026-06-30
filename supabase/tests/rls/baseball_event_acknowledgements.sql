-- pgTAP contracts for BaseballHelm event acknowledgements RLS
-- (migration 20260624000040_baseball_timeline_and_acks.sql).
--
-- baseball_event_acknowledgements is a per-user read-receipt: one row per
-- (event_id, user_id). The security contract:
--   1. RLS is enabled; anon has NO privileges.
--   2. The UNIQUE(event_id, user_id) constraint exists (idempotent upsert key;
--      one acknowledgement per user per event — no duplicate receipts).
--   3. A user may only INSERT / UPDATE / DELETE their OWN acknowledgement
--      (every write policy is bound to user_id = auth.uid()). A player can never
--      forge an acknowledgement as another user.
--   4. SELECT is limited to either the user's own rows OR team staff of the
--      event's owning team (the staff visibility branch goes through the team
--      coach helper, never a raw player-readable path).
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 1 roster-timeline / Wave 4 acknowledgement packets (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(16);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_event_acknowledgements'),
  'RLS is ENABLED on baseball_event_acknowledgements'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_event_acknowledgements', 'SELECT'), true, 'anon cannot SELECT baseball_event_acknowledgements');
SELECT isnt(has_table_privilege('anon', 'public.baseball_event_acknowledgements', 'INSERT'), true, 'anon cannot INSERT baseball_event_acknowledgements');
SELECT isnt(has_table_privilege('anon', 'public.baseball_event_acknowledgements', 'UPDATE'), true, 'anon cannot UPDATE baseball_event_acknowledgements');
SELECT isnt(has_table_privilege('anon', 'public.baseball_event_acknowledgements', 'DELETE'), true, 'anon cannot DELETE baseball_event_acknowledgements');

-- ============================================================================
-- 2. UNIQUE(event_id, user_id) — one receipt per user per event.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_event_acknowledgements_event_user_key'
      AND contype = 'u'
  ),
  'UNIQUE(event_id, user_id) constraint exists (idempotent upsert key)'
);

-- ============================================================================
-- 3. Every WRITE policy is bound to user_id = auth.uid() (self only).
-- ============================================================================

-- Helper: assert that the named policy's USING and/or WITH CHECK expression
-- references both `user_id` and `auth.uid()` (the self-ownership predicate).
CREATE OR REPLACE FUNCTION tests.policy_is_self_owned(
  p_table text,
  p_policy text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_using text;
  v_check text;
  v_all text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
  INTO v_using, v_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = p_table AND p.polname = p_policy;

  v_all := coalesce(v_using, '') || ' ' || coalesce(v_check, '');
  RETURN position('user_id' IN v_all) > 0 AND position('auth.uid()' IN v_all) > 0;
END $$;

SELECT ok(
  tests.policy_is_self_owned('baseball_event_acknowledgements', 'baseball_event_acknowledgements_insert'),
  'INSERT policy is bound to user_id = auth.uid() (no forging as another user)'
);
SELECT ok(
  tests.policy_is_self_owned('baseball_event_acknowledgements', 'baseball_event_acknowledgements_update'),
  'UPDATE policy is bound to user_id = auth.uid()'
);
SELECT ok(
  tests.policy_is_self_owned('baseball_event_acknowledgements', 'baseball_event_acknowledgements_delete'),
  'DELETE policy is bound to user_id = auth.uid()'
);

-- ============================================================================
-- 4. SELECT policy: own rows OR team-staff branch (via the coach helper).
-- ============================================================================

-- Own-row branch present.
SELECT ok(
  tests.policy_is_self_owned('baseball_event_acknowledgements', 'baseball_event_acknowledgements_select'),
  'SELECT policy includes the own-row branch (user_id = auth.uid())'
);

-- Staff branch goes through the team-staff helper (not a raw player path).
SELECT ok(
  (SELECT position('is_baseball_team_staff' IN pg_get_expr(polqual, polrelid)) > 0
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polname = 'baseball_event_acknowledgements_select'),
  'SELECT staff branch is gated by the team-staff helper'
);

-- The staff branch is scoped through the event''s team (joins baseball_events).
SELECT ok(
  (SELECT position('baseball_events' IN pg_get_expr(polqual, polrelid)) > 0
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polname = 'baseball_event_acknowledgements_select'),
  'SELECT staff branch resolves the team via the owning baseball_events row'
);

-- ============================================================================
-- 5. Exactly one policy per command (no overlapping permissive write paths).
-- ============================================================================

SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polcmd = 'a'),  -- INSERT
  1,
  'exactly one INSERT policy on baseball_event_acknowledgements'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polcmd = 'w'),  -- UPDATE
  1,
  'exactly one UPDATE policy on baseball_event_acknowledgements'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polcmd = 'd'),  -- DELETE
  1,
  'exactly one DELETE policy on baseball_event_acknowledgements'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'baseball_event_acknowledgements'
       AND p.polcmd = 'r'),  -- SELECT
  1,
  'exactly one SELECT policy on baseball_event_acknowledgements'
);

SELECT * FROM finish();
ROLLBACK;
