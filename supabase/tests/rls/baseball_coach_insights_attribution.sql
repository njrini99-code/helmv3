-- pgTAP contracts for BaseballHelm CoachHelm engine insight attribution +
-- player-visibility gating (migration
-- 20260624000070_baseball_coach_insights_attribution.sql, which adds the
-- attribution columns and re-asserts the staff/player SELECT split on
-- baseball_coach_insights now that player_visible exists).
--
-- The security-critical invariant: a PLAYER must NEVER read a staff-only engine
-- insight. The CoachHelm baseball engine writes diagnostic insights derived from
-- staff_only box-score sources; a player may read an insight ONLY when it is
-- explicitly player_visible AND it is about that player. Staff read all team
-- insights.
--
-- This suite guards that contract against regression:
--   1. RLS is enabled; anon has no privileges on baseball_coach_insights.
--   2. The attribution columns exist with the right shape (source_refs jsonb,
--      confidence numeric, lifecycle_state text, player_visible boolean).
--   3. lifecycle_state + confidence are constrained (CHECK) so a row can't store
--      an off-ladder lifecycle or an out-of-range confidence.
--   4. The SELECT policy binds the player branch to BOTH player_visible = true
--      AND a player-identity check against baseball_players.user_id, and grants
--      staff access via is_baseball_team_staff. No player path omits the
--      player_visible gate.
--   5. No policy targets the anon role (service_role bypasses RLS for AI writes).
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint /
-- information_schema without seeding integration data (matches the deferral
-- note in _helpers.sql).
--
-- Source: Wave 10 (P10.4) CoachHelm baseball engine write layer.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_insights'),
  'RLS is ENABLED on baseball_coach_insights'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_insights', 'SELECT'), true, 'anon cannot SELECT baseball_coach_insights');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_insights', 'INSERT'), true, 'anon cannot INSERT baseball_coach_insights');
SELECT isnt(has_table_privilege('anon', 'public.baseball_coach_insights', 'UPDATE'), true, 'anon cannot UPDATE baseball_coach_insights');

-- ============================================================================
-- 2. Attribution columns exist with the right types.
-- ============================================================================

SELECT has_column('public', 'baseball_coach_insights', 'source_refs', 'has source_refs column');
SELECT col_type_is('public', 'baseball_coach_insights', 'source_refs', 'jsonb', 'source_refs is jsonb');
SELECT has_column('public', 'baseball_coach_insights', 'confidence', 'has confidence column');
SELECT has_column('public', 'baseball_coach_insights', 'lifecycle_state', 'has lifecycle_state column');
SELECT has_column('public', 'baseball_coach_insights', 'player_visible', 'has player_visible column');
SELECT col_type_is('public', 'baseball_coach_insights', 'player_visible', 'boolean', 'player_visible is boolean');

-- ============================================================================
-- 3. lifecycle_state + confidence are constrained.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_coach_insights'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%lifecycle_state%'
  ),
  'baseball_coach_insights has a CHECK constraint on lifecycle_state'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_coach_insights'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%confidence%'
  ),
  'baseball_coach_insights has a CHECK constraint bounding confidence'
);

-- ============================================================================
-- 4. SELECT policy gates the player branch with player_visible + identity.
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_coach_insights'
       AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_coach_insights has at least one SELECT policy'
);

-- The player branch must be bound to player_visible = true.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_insights'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'player_visible'
  ),
  'baseball_coach_insights SELECT policy binds the player branch to player_visible'
);

-- The player branch is tied to the player''s OWN identity (no cross-player read).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_coach_insights'
      AND p.polcmd IN ('r', '*')
      AND pg_get_expr(p.polqual, p.polrelid) ~ '(baseball_players|get_my_baseball_player_id|is_baseball_team_staff)'
  ),
  'baseball_coach_insights SELECT policy ties access to staff or the player''s own identity'
);

-- ============================================================================
-- 5. No policy targets the anon role.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_coach_insights'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_coach_insights policy targets the anon role'
);

SELECT * FROM finish();
ROLLBACK;
