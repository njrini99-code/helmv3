-- #406 — Behavioral pgTAP suite for can_view_baseball_player()'s
-- scope_player_ids staff-isolation contract.
--
-- Function under test: supabase/migrations/20260630180000_baseball_scope_player_ids_rls.sql
--   public.can_view_baseball_player(p_team_id, p_player_id)
--     * own-player bypass (33-35)                     -- not exercised here;
--       the three synthetic player ids below are never resolved by
--       get_my_baseball_player_id() for the scoped coach's user, so this
--       bypass never interferes with the assertions.
--     * no-coach-row -> false (37-39)                  -- not exercised here
--     * primary coach -> true (41-43)                  -- not exercised here
--     * suspended/removed/invited staff -> false (56-58), evaluated BEFORE
--       the scope_player_ids check
--     * is_head_coach -> true (60-62)                  -- not exercised here
--     * scope_player_ids IS NOT NULL AND cardinality>0  -> allowlist check
--       (64-66)
--     * scope_player_ids NULL/empty -> full team visibility (68-69,
--       "fallthrough")
--
-- This is a BEHAVIORAL test (not the schema-light introspection _helpers.sql
-- describes as the historical default in this directory): it seeds one real
-- team + one scoped (non-head, non-primary, active) staff coach, then
-- impersonates that coach via the authenticated role + a
-- `request.jwt.claims` JWT — the exact pattern already proven in
-- baseball_recalc_body_guards.sql and
-- golf_coach_insights_cross_tenant_select.sql — and asserts
-- can_view_baseball_player() across empty -> one -> multiple -> revoked-status
-- scope_player_ids states against three synthetic player ids (never inserted
-- as real baseball_players rows; can_view_baseball_player only ever compares
-- p_player_id against the scope array / the caller's own resolved player id,
-- so no baseball_players seeding is required to exercise this contract).
--
-- Case D additionally seeds a SECOND staff-coach row on the SAME team (a
-- distinct coach_id/user_id) with its own, WIDER scope_player_ids allowlist,
-- and — still impersonating the FIRST coach — asserts that coach's results
-- are entirely unaffected by the second row. This proves actual cross-staff
-- isolation: the row lookup in can_view_baseball_player() is
-- `WHERE tcs.team_id = p_team_id AND tcs.coach_id = v_coach_id LIMIT 1`
-- (migration 20260630180000, lines 45-50), and with only one staff row per
-- team a regression that drops/weakens the `coach_id = v_coach_id` predicate
-- (e.g. an accidental ORDER BY + LIMIT 1 refactor) would be invisible to this
-- suite. With two staff rows now present, such a regression would let the
-- first coach's view resolve to the second (wider-scoped) coach's row and
-- surface playerC — which Case D asserts stays hidden.
--
-- scope_player_ids is a plain `uuid[]` column (20260625000040_baseball_staff_
-- display_scope_columns.sql / 20260624000082_baseball_staff_display_and_
-- invite_columns.sql) with no FK and no CHECK constraint, and
-- baseball_team_coach_staff.status is free-text with no CHECK constraint
-- either (confirmed via migration grep) — so synthetic, never-elsewhere-used
-- uuids and arbitrary lifecycle status values are legal here.

BEGIN;
\ir _helpers.sql

SELECT plan(15);

-- ============================================================================
-- Invariants — SECURITY DEFINER + pinned search_path preserved, anon still
-- has no EXECUTE (mirrors baseball_recalc_body_guards.sql's invariant block).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_view_baseball_player'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'can_view_baseball_player is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.can_view_baseball_player(uuid,uuid)', 'EXECUTE'),
  true,
  'anon still cannot execute can_view_baseball_player'
);

-- ============================================================================
-- Seed one team + one scoped (non-head, non-primary) active staff coach.
-- ============================================================================
DO $$
DECLARE
  v_user_id  uuid := '00000000-0000-0000-0000-0000000c0a01';
  v_coach_id uuid := '00000000-0000-0000-0000-0000000c0a02';
  v_team_id  uuid := '00000000-0000-0000-0000-0000000c0a03';
BEGIN
  INSERT INTO auth.users (id, email, role)
    VALUES (v_user_id, 'scopedcoach@helm.test', 'authenticated')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
    VALUES (v_user_id, 'scopedcoach@helm.test', 'coach')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type)
    VALUES (v_coach_id, v_user_id, 'college')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, name, team_type, join_code)
    VALUES (v_team_id, 'pgtap-scope-team', 'college', 'PGTAPSCOPE')
    ON CONFLICT DO NOTHING;

  -- Non-head, non-primary, active staff row with NO scope set yet.
  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status, scope_player_ids)
  VALUES
    (v_team_id, v_coach_id, 'assistant', false, false, 'active', NULL)
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = false,
        is_head_coach = false,
        status = 'active',
        scope_player_ids = NULL;
END $$;

-- Three synthetic player ids, distinct from the scoped coach's own identity
-- (so the own-player bypass at migration lines 33-35 never fires):
--   playerA = ...0c0aa1   playerB = ...0c0ab1   playerC = ...0c0ac1

-- ============================================================================
-- Case A — scope_player_ids IS NULL: fallthrough, full team visibility.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c0a01", "role": "authenticated"}';

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0aa1'::uuid
  ),
  true,
  'NULL scope: scoped staff can view playerA (fallthrough, no allowlist set)'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ab1'::uuid
  ),
  true,
  'NULL scope: scoped staff can view playerB (fallthrough, no allowlist set)'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ac1'::uuid
  ),
  true,
  'NULL scope: scoped staff can view playerC (fallthrough, no allowlist set)'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Case B — scope_player_ids = [playerA]: single-entry allowlist.
-- (Seeding UPDATE runs under the default/superuser session context, same as
-- the DO $$ seed block above and every other suite in this directory.)
-- ============================================================================
UPDATE public.baseball_team_coach_staff
   SET scope_player_ids = ARRAY['00000000-0000-0000-0000-0000000c0aa1'::uuid]
 WHERE team_id = '00000000-0000-0000-0000-0000000c0a03'
   AND coach_id = '00000000-0000-0000-0000-0000000c0a02';

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c0a01", "role": "authenticated"}';

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0aa1'::uuid
  ),
  true,
  'one-player scope [A]: playerA (in allowlist) is visible'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ab1'::uuid
  ),
  false,
  'one-player scope [A]: playerB (not in allowlist) is hidden'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ac1'::uuid
  ),
  false,
  'one-player scope [A]: playerC (not in allowlist) is hidden'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Case C — scope_player_ids = [playerA, playerB]: multi-entry allowlist.
-- ============================================================================
UPDATE public.baseball_team_coach_staff
   SET scope_player_ids = ARRAY[
     '00000000-0000-0000-0000-0000000c0aa1'::uuid,
     '00000000-0000-0000-0000-0000000c0ab1'::uuid
   ]
 WHERE team_id = '00000000-0000-0000-0000-0000000c0a03'
   AND coach_id = '00000000-0000-0000-0000-0000000c0a02';

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c0a01", "role": "authenticated"}';

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0aa1'::uuid
  ),
  true,
  'multi-player scope [A,B]: playerA is visible'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ab1'::uuid
  ),
  true,
  'multi-player scope [A,B]: playerB is visible'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ac1'::uuid
  ),
  false,
  'multi-player scope [A,B]: playerC (still not in allowlist) is hidden'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Case D — cross-staff isolation: a SECOND staff-coach row on the SAME team
-- (distinct coach_id/user_id), given a WIDER scope_player_ids allowlist
-- ([playerA, playerB, playerC] — a superset of the first coach's current
-- [playerA, playerB], and one that additionally covers playerC, which the
-- first coach cannot see). Still impersonating the FIRST coach, the results
-- below must be identical to Case C's: unaffected by the second row's
-- existence or its wider scope. See the top-of-file note for the exact
-- regression class this closes.
-- ============================================================================
DO $$
DECLARE
  v_user_id2  uuid := '00000000-0000-0000-0000-0000000c0b01';
  v_coach_id2 uuid := '00000000-0000-0000-0000-0000000c0b02';
  v_team_id   uuid := '00000000-0000-0000-0000-0000000c0a03';
BEGIN
  INSERT INTO auth.users (id, email, role)
    VALUES (v_user_id2, 'secondscopedcoach@helm.test', 'authenticated')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
    VALUES (v_user_id2, 'secondscopedcoach@helm.test', 'coach')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type)
    VALUES (v_coach_id2, v_user_id2, 'college')
    ON CONFLICT DO NOTHING;

  -- Second staff row, same team, non-head/non-primary/active, wider scope.
  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status, scope_player_ids)
  VALUES
    (v_team_id, v_coach_id2, 'assistant', false, false, 'active', ARRAY[
      '00000000-0000-0000-0000-0000000c0aa1'::uuid,
      '00000000-0000-0000-0000-0000000c0ab1'::uuid,
      '00000000-0000-0000-0000-0000000c0ac1'::uuid
    ])
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = false,
        is_head_coach = false,
        status = 'active',
        scope_player_ids = EXCLUDED.scope_player_ids;
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c0a01", "role": "authenticated"}';

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ac1'::uuid
  ),
  false,
  'cross-staff isolation: first coach (scope [A,B]) still cannot view playerC, even though a second staff row on the same team now has playerC in ITS (wider) scope_player_ids'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0aa1'::uuid
  ),
  true,
  'cross-staff isolation: first coach still sees playerA per its OWN scope, unaffected by the second staff row existing'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Negative case — a suspended staff row returns false for every player
-- regardless of scope_player_ids, because the status check (56-58) runs
-- BEFORE the scope check (64-66). scope_player_ids is left unchanged at
-- [playerA, playerB] from Case C to prove this: playerA is still nominally
-- in the allowlist yet becomes invisible purely from the status flip.
-- ============================================================================
UPDATE public.baseball_team_coach_staff
   SET status = 'suspended'
 WHERE team_id = '00000000-0000-0000-0000-0000000c0a03'
   AND coach_id = '00000000-0000-0000-0000-0000000c0a02';

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c0a01", "role": "authenticated"}';

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0aa1'::uuid
  ),
  false,
  'suspended staff: playerA (still in allowlist) is hidden -- status gate precedes the scope check'
);

SELECT is(
  public.can_view_baseball_player(
    '00000000-0000-0000-0000-0000000c0a03'::uuid,
    '00000000-0000-0000-0000-0000000c0ac1'::uuid
  ),
  false,
  'suspended staff: playerC (not in allowlist either) is hidden'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
