-- pgTAP contracts for BaseballHelm V5 Player Passport + Daily Contract
-- (migration 20260624000220_baseball_player_passport_and_daily_contract.sql).
--
-- Security-critical invariants guarded here:
--   PASSPORT SETTINGS (baseball_player_passport_settings):
--     * RLS enabled; anon holds nothing.
--     * visibility_state is CHECK-constrained (no arbitrary exposure value).
--     * SELECT/INSERT/UPDATE bind to staff OR the subject player; DELETE is
--       staff-only. No policy targets anon.
--   DAILY CONTRACT (baseball_player_daily_contracts):
--     * RLS enabled; anon holds nothing.
--     * status + visibility are CHECK-constrained.
--     * The contract is PLAYER-OWNED: INSERT/UPDATE/DELETE are bound to the
--       player's own identity (get_my_baseball_player_id). A coach can never
--       write another player's contract.
--     * SELECT lets staff see only NON player_only rows (the player's private
--       reflections stay private) — i.e. the SELECT policy references both the
--       player identity AND the player_only visibility gate.
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: V5 Player Passport + Daily Contract packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(31);

-- ============================================================================
-- PASSPORT SETTINGS
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_settings'),
  'RLS is ENABLED on baseball_player_passport_settings'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_settings', 'SELECT'), true, 'anon cannot SELECT baseball_player_passport_settings');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_settings', 'INSERT'), true, 'anon cannot INSERT baseball_player_passport_settings');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_settings', 'UPDATE'), true, 'anon cannot UPDATE baseball_player_passport_settings');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_passport_settings', 'DELETE'), true, 'anon cannot DELETE baseball_player_passport_settings');

-- visibility_state CHECK constraint exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_passport_settings'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility_state%'
  ),
  'baseball_player_passport_settings has a CHECK on visibility_state'
);

-- SELECT policy exists and binds to staff OR the subject player.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_settings'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'passport_settings SELECT binds to player identity AND staff authority'
);

-- INSERT policy is gated (staff OR subject player) — never open.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_settings'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ '(get_my_baseball_player_id|is_baseball_team_coach)'
  ),
  'passport_settings INSERT is gated on player identity or staff authority'
);

-- DELETE is staff-only (operational config; player cannot self-delete settings).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_settings'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'passport_settings DELETE is staff-gated'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_passport_settings'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'no passport_settings DELETE policy lets a player self-delete settings'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_passport_settings'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_player_passport_settings policy targets the anon role'
);

-- ============================================================================
-- DAILY CONTRACT
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'),
  'RLS is ENABLED on baseball_player_daily_contracts'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_player_daily_contracts', 'SELECT'), true, 'anon cannot SELECT baseball_player_daily_contracts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_daily_contracts', 'INSERT'), true, 'anon cannot INSERT baseball_player_daily_contracts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_daily_contracts', 'UPDATE'), true, 'anon cannot UPDATE baseball_player_daily_contracts');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_daily_contracts', 'DELETE'), true, 'anon cannot DELETE baseball_player_daily_contracts');

-- status + visibility CHECK constraints exist.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_daily_contracts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  ),
  'baseball_player_daily_contracts has a CHECK on status'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_daily_contracts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility%'
  ),
  'baseball_player_daily_contracts has a CHECK on visibility'
);

-- The (player, team, date) uniqueness is enforced (one contract per day).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_daily_contracts'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%contract_date%'
  ),
  'daily_contracts has a UNIQUE(player_id, team_id, contract_date) constraint'
);

-- INSERT is bound to the player's OWN identity (not a coach write path).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'daily_contracts INSERT is bound to the player''s own identity'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polcmd = 'a'  -- INSERT
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'no daily_contracts INSERT policy lets a coach write another player''s contract'
);

-- UPDATE + DELETE are bound to the player's own identity.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polcmd = 'w'  -- UPDATE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'daily_contracts UPDATE is bound to the player''s own identity'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'daily_contracts DELETE is bound to the player''s own identity'
);

-- SELECT: the staff branch is gated by the player_only visibility exclusion, so
-- a coach never reads the player's private (player_only) reflections.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'player_only'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'daily_contracts SELECT gates the staff branch with the player_only exclusion'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_daily_contracts'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_player_daily_contracts policy targets the anon role'
);

-- ============================================================================
-- DAILY CONTRACT — COACH ACKNOWLEDGEMENT (migration 20260624000620)
-- ============================================================================

-- The coach-ack columns exist.
SELECT has_column('baseball_player_daily_contracts', 'coach_acknowledged_at',
  'daily_contracts has coach_acknowledged_at');
SELECT has_column('baseball_player_daily_contracts', 'coach_acknowledged_by',
  'daily_contracts has coach_acknowledged_by');

-- A SECOND, coach-scoped UPDATE policy exists, gated BOTH on staff authority AND
-- the player_only EXCLUSION — so a coach can only ever ack a row the player
-- SHARED (never a private day).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polname = 'baseball_daily_contract_coach_ack_update'
      AND p.polcmd = 'w'  -- UPDATE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'player_only'
  ),
  'coach-ack UPDATE policy is staff-gated AND restricted to shared (non player_only) rows'
);

-- The coach-ack UPDATE policy's WITH CHECK also re-asserts the shared + staff
-- boundary, so a coach can neither hide nor re-home a row through the ack path.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polname = 'baseball_daily_contract_coach_ack_update'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'is_baseball_team_coach'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'player_only'
  ),
  'coach-ack UPDATE WITH CHECK re-asserts the shared + staff boundary'
);

-- The original player-owned UPDATE policy is UNTOUCHED (still present), so a
-- player retains full control of their own intentions/status/reflection.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_player_daily_contracts'
      AND p.polname = 'baseball_daily_contract_update'
      AND p.polcmd = 'w'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'the player-owned UPDATE policy remains intact alongside the coach-ack policy'
);

SELECT * FROM finish();
ROLLBACK;
