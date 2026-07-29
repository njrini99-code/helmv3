-- pgTAP contracts for baseball_player_percentiles — the fourth and last
-- `USING (true)` SELECT policy in the baseball schema.
--
-- HOW IT WAS FOUND. Not from a report: by sweeping the 2026-05-27 baseline for
-- every `FOR SELECT ... USING (true)` on a baseball table instead of stopping
-- at the two that had been flagged. Five turned up.
-- `baseball_coaches_select_all` was replaced by 20260701014000 and
-- `baseball_team_coach_staff_select` by 20260624000050; baseball_players and
-- baseball_teams are migration B SECTION 2. This one nothing had ever touched:
--
--     -- 20260527000000_prod_public_baseline.sql:16710
--     CREATE POLICY "Anyone can view percentiles"
--       ON "public"."baseball_player_percentiles"
--       FOR SELECT TO "authenticated" USING (true);
--
-- The name reads like reference data — league-wide benchmark curves, the kind
-- of thing that genuinely should be public. The table is not that. It is
-- `player_id uuid NOT NULL`, one row per player, holding percentile_gpa,
-- composite_academic, composite_athletic, exit velocity, pitch velocity and
-- sixty time. Any authenticated user could read every player in the database,
-- ranked academically and athletically.
--
-- Derived rather than raw (a percentile, not the GPA), which is the one thing
-- that makes it less severe than the roster-PII leak — not enough to leave it.
--
-- ASSERTS THE POST-B STATE. Against an A-only database the policy group fails,
-- correctly.
--
-- Plan arithmetic, per group: 4 (policy shape) + 1 (anon) + 4 (behaviour) = 9.
-- Counted rather than eyeballed — a miscounted plan aborts the runner's
-- `set -euo pipefail` loop and silently skips every alphabetically later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- GROUP 1 — policy shape.
-- ============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_percentiles'
      AND p.polname = 'Anyone can view percentiles'
  ),
  'the permissive baseline policy "Anyone can view percentiles" is GONE'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_player_percentiles'
      AND p.polname = 'baseball_player_percentiles_select'
      AND p.polcmd = 'r'
  ),
  'baseball_player_percentiles_select exists as a SELECT policy'
);

SELECT ok(
  position('can_view_baseball_player' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_percentiles'
       AND p.polname = 'baseball_player_percentiles_select'
  ), '')) > 0,
  'the percentiles policy gates on can_view_baseball_player — a percentile is visible exactly when the player row behind it is'
);

SELECT ok(
  position(' FROM ' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_percentiles'
       AND p.polname = 'baseball_player_percentiles_select'
  ), '')) = 0,
  'the percentiles policy USING contains no inline subquery — no path to a recursion cycle'
);

-- ============================================================================
-- GROUP 2 — anon defense in depth.
-- ============================================================================

SELECT isnt(
  has_table_privilege('anon', 'public.baseball_player_percentiles', 'SELECT'),
  true,
  'anon cannot SELECT baseball_player_percentiles'
);

-- ============================================================================
-- SEED — two programs, one player each, a percentile row for both.
-- Ids in the 0000000f* range; checked against every sibling suite.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000f0001', 'Percentile Program A', 'college'),
    ('00000000-0000-0000-0000-0000000f0002', 'Percentile Program B', 'college')
  ON CONFLICT DO NOTHING;

  -- --- Program A: coach + player ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f0101', 'pctcoacha@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f0301', 'pctplayera@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f0101', 'pctcoacha@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000f0301', 'pctplayera@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000f0102',
            '00000000-0000-0000-0000-0000000f0101', 'college', 'Percentile Coach A')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000f0103',
            '00000000-0000-0000-0000-0000000f0001',
            'Percentile Team A', 'college', 'FPCTAAAA')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status)
  VALUES
    ('00000000-0000-0000-0000-0000000f0103', '00000000-0000-0000-0000-0000000f0102',
     'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000f0302',
            '00000000-0000-0000-0000-0000000f0301', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000f0103',
            '00000000-0000-0000-0000-0000000f0302', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Program B: a separate tenant with its own player ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f0401', 'pctplayerb@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f0401', 'pctplayerb@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000f0203',
            '00000000-0000-0000-0000-0000000f0002',
            'Percentile Team B', 'college', 'FPCTBBBB')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000f0402',
            '00000000-0000-0000-0000-0000000f0401', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000f0203',
            '00000000-0000-0000-0000-0000000f0402', 'active')
  ON CONFLICT DO NOTHING;

  -- The rows that used to be world-readable.
  INSERT INTO public.baseball_player_percentiles
    (player_id, grad_year, percentile_exit_velocity, percentile_gpa, composite_academic)
  VALUES
    ('00000000-0000-0000-0000-0000000f0302', 2027, 88, 91, 90),
    ('00000000-0000-0000-0000-0000000f0402', 2027, 72, 64, 65)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 3 — behavioural. The negative is the one that matters.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000f0101", "role": "authenticated"}';

SELECT is(
  (SELECT percentile_gpa FROM public.baseball_player_percentiles
    WHERE player_id = '00000000-0000-0000-0000-0000000f0302'),
  91,
  'Coach A CAN read their own rostered player''s percentiles (the legitimate capability is preserved)'
);

-- THE FIX. Under `USING (true)` this returned 64.
SELECT is(
  (SELECT count(*)::int FROM public.baseball_player_percentiles
    WHERE player_id = '00000000-0000-0000-0000-0000000f0402'),
  0,
  'Coach A CANNOT read Program B''s player percentiles — cross-tenant academic/athletic ranking exposure closed'
);

RESET role;
RESET request.jwt.claims;

-- A player reads their own percentiles: can_view_baseball_player short-circuits
-- on get_my_baseball_player_id() before any coach logic runs.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000f0301", "role": "authenticated"}';

SELECT is(
  (SELECT percentile_gpa FROM public.baseball_player_percentiles
    WHERE player_id = '00000000-0000-0000-0000-0000000f0302'),
  91,
  'a player CAN still read their own percentiles — the self clause survives the tightening'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_player_percentiles),
  1,
  'that player''s unfiltered SELECT returns ONLY their own row — no bulk ranking of every player in the database'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
