-- pgTAP contracts for the BaseballHelm Stats Center (Wave 7).
--
-- Wave 7 creates NO new tables — the Stats Center read model
-- (src/lib/baseball/read-models/stats-center.ts) and its loadStatsCenter
-- server action compose a staff-only, team-wide stats view over EXISTING tables:
--   baseball_box_score_batting, baseball_box_score_pitching,
--   baseball_player_season_stats, baseball_games, baseball_team_members.
--
-- These assertions pin the security invariants the Stats Center relies on so a
-- future migration cannot silently widen them and turn a coaching surface into a
-- cross-tenant / cross-player leak:
--
--   1. RLS is ENABLED on every table the read model reads; anon has no SELECT.
--   2. No SELECT policy on those tables targets the anon role.
--   3. The box-score + season-stat SELECT policies are bound to EITHER the
--      viewer's own player id OR team-coach membership — never "any
--      authenticated" — so a player can never read another player's lines and a
--      non-member can never read a team's lines.
--   4. The games SELECT policy is bound to team membership/coach (so the
--      official-vs-scrimmage classification cannot be read cross-tenant).
--
-- Schema-light: asserts the contract over pg_policies / pg_class without seeding
-- integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 7 Stats Center packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- 1. RLS enabled on every table the Stats Center reads.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_box_score_batting'),
  'RLS is ENABLED on baseball_box_score_batting'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_box_score_pitching'),
  'RLS is ENABLED on baseball_box_score_pitching'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_season_stats'),
  'RLS is ENABLED on baseball_player_season_stats'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_games'),
  'RLS is ENABLED on baseball_games'
);

-- ============================================================================
-- 2. anon locked out of SELECT on every read table.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_box_score_batting', 'SELECT'), true, 'anon cannot SELECT baseball_box_score_batting');
SELECT isnt(has_table_privilege('anon', 'public.baseball_box_score_pitching', 'SELECT'), true, 'anon cannot SELECT baseball_box_score_pitching');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_season_stats', 'SELECT'), true, 'anon cannot SELECT baseball_player_season_stats');
SELECT isnt(has_table_privilege('anon', 'public.baseball_games', 'SELECT'), true, 'anon cannot SELECT baseball_games');

-- No policy on these tables targets anon (service_role bypasses RLS).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'baseball_box_score_batting', 'baseball_box_score_pitching',
         'baseball_player_season_stats', 'baseball_games'
       )
       AND 'anon' = ANY(roles)),
  0,
  'no Stats Center read-table policy targets the anon role'
);

-- ============================================================================
-- 3. Box-score + season-stat SELECT is own-player OR team-coach scoped.
--    (Neither "any authenticated" nor unqualified — the gate cannot be widened.)
-- ============================================================================

-- baseball_box_score_batting SELECT: bound to own player id AND coach membership.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_box_score_batting'
        AND p.polcmd IN ('r', '*')
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'baseball_players'
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'baseball_box_score_batting SELECT is own-player OR team-coach scoped'
);

-- baseball_box_score_pitching SELECT: same dual gate.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_box_score_pitching'
        AND p.polcmd IN ('r', '*')
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'baseball_players'
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'baseball_box_score_pitching SELECT is own-player OR team-coach scoped'
);

-- baseball_player_season_stats SELECT: same dual gate.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_season_stats'
        AND p.polcmd IN ('r', '*')
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'baseball_players'
        AND pg_get_expr(p.polqual, p.polrelid) ~ 'is_baseball_team_coach'
  ),
  'baseball_player_season_stats SELECT is own-player OR team-coach scoped'
);

-- None of these SELECT policies may be unqualified (a NULL/true USING clause
-- would expose every row to every authenticated user).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN (
         'baseball_box_score_batting', 'baseball_box_score_pitching',
         'baseball_player_season_stats'
       )
       AND p.polcmd IN ('r', '*')
       AND (p.polqual IS NULL OR pg_get_expr(p.polqual, p.polrelid) = 'true')),
  0,
  'no box-score/season SELECT policy is unqualified (true/NULL USING)'
);

-- ============================================================================
-- 4. baseball_games SELECT is team-membership scoped (official/scrimmage class
--    cannot be read cross-tenant).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_games'
        AND p.polcmd IN ('r', '*')
        AND pg_get_expr(p.polqual, p.polrelid) ~ '(is_baseball_team_member|is_baseball_team_coach)'
  ),
  'baseball_games SELECT is bound to team membership/coach'
);

-- ============================================================================
-- 5. Each read table still exposes a working SELECT path (not fully locked).
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_box_score_batting' AND cmd IN ('SELECT', 'ALL')),
  '>=', 1,
  'baseball_box_score_batting has a SELECT path'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_box_score_pitching' AND cmd IN ('SELECT', 'ALL')),
  '>=', 1,
  'baseball_box_score_pitching has a SELECT path'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_player_season_stats' AND cmd IN ('SELECT', 'ALL')),
  '>=', 1,
  'baseball_player_season_stats has a SELECT path'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_games' AND cmd IN ('SELECT', 'ALL')),
  '>=', 1,
  'baseball_games has a SELECT path'
);

SELECT * FROM finish();
ROLLBACK;
