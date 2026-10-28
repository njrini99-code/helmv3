-- Behavioral pgTAP suite for the player read of BaseballHelm practice reviews
-- (held migration 20261028120000_baseball_practice_reviews_player_read.sql).
--
-- Owner rule (2026-10-28): a player sees a practice review only when a coach
-- marked it visible to players (visibility = 'player_visible') AND the player
-- is one of the review's players (player_ids). staff_only and restricted stay
-- staff-only; a teammate's review, a team-level review with no players, and
-- another team's review stay hidden.
--
-- The migration also drops the file-only bpe_player_read_visible policy
-- (20260624000094), which let any team member read every player_visible
-- review of the team. In a stack replayed from migrations that policy exists
-- until the held migration runs, so the teammate and team-level cases below
-- fail without the drop.
--
-- Seeds two programs (A and B) and impersonates players through the
-- authenticated role + request.jwt.claims, the pattern of
-- baseball_team_scoped_tables_isolation.sql.
--
-- Plan arithmetic: 3 (policy shape) + 7 (player 1, six on team A and one on
-- team B) + 1 (player 2) + 1 (player 3) = 12. A miscounted plan aborts the
-- runner loop and skips later suites, so this is counted, not eyeballed.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- Policy shape.
-- ============================================================================

SELECT is(
  (SELECT cmd FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'baseball_practice_effectiveness_reviews'
       AND policyname = 'baseball_practice_effectiveness_reviews_select_player'),
  'SELECT',
  'the player read policy exists and is SELECT-only (players never write reviews)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'baseball_practice_effectiveness_reviews'
       AND policyname = 'bpe_player_read_visible'),
  0,
  'the team-wide bpe_player_read_visible policy is gone'
);

SELECT isnt(
  has_table_privilege('anon', 'public.baseball_practice_effectiveness_reviews', 'SELECT'),
  true,
  'anon still cannot SELECT practice reviews'
);

-- ============================================================================
-- SEED. Ids in the 0000002810xx range.
--   Program A: team ...281003, coach ...281002, players P1 ...281012 and
--              P2 ...281022, practice ...281031.
--   Program B: team ...281053, coach ...281052, player P3 ...281062,
--              practice ...281081.
--   Reviews on A: R1 visible [P1], R2 staff_only [P1], R3 restricted [P1],
--                 R4 visible [P2], R5 visible [] (team-level).
--   Reviews on B: R6 visible [P3], R7 visible [P1] (P1 is not on team B).
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000281001', 'Review Program A', 'college'),
    ('00000000-0000-0000-0000-000000281051', 'Review Program B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000281000', 'reviewcoacha@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281010', 'reviewplayer1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281020', 'reviewplayer2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281050', 'reviewcoachb@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281060', 'reviewplayer3@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000281000', 'reviewcoacha@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000281010', 'reviewplayer1@helm.test', 'player'),
    ('00000000-0000-0000-0000-000000281020', 'reviewplayer2@helm.test', 'player'),
    ('00000000-0000-0000-0000-000000281050', 'reviewcoachb@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000281060', 'reviewplayer3@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name) VALUES
    ('00000000-0000-0000-0000-000000281002', '00000000-0000-0000-0000-000000281000', 'college', 'Review Coach A'),
    ('00000000-0000-0000-0000-000000281052', '00000000-0000-0000-0000-000000281050', 'college', 'Review Coach B')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code) VALUES
    ('00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281001', 'Review Team A', 'college', 'GREVIEWA'),
    ('00000000-0000-0000-0000-000000281053', '00000000-0000-0000-0000-000000281051', 'Review Team B', 'college', 'GREVIEWB')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status) VALUES
    ('00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281002', 'head_coach', true, true, 'active'),
    ('00000000-0000-0000-0000-000000281053', '00000000-0000-0000-0000-000000281052', 'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated) VALUES
    ('00000000-0000-0000-0000-000000281012', '00000000-0000-0000-0000-000000281010', 'college', false),
    ('00000000-0000-0000-0000-000000281022', '00000000-0000-0000-0000-000000281020', 'college', false),
    ('00000000-0000-0000-0000-000000281062', '00000000-0000-0000-0000-000000281060', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281012', 'active'),
    ('00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281022', 'active'),
    ('00000000-0000-0000-0000-000000281053', '00000000-0000-0000-0000-000000281062', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_practices (id, team_id, title, status) VALUES
    ('00000000-0000-0000-0000-000000281031', '00000000-0000-0000-0000-000000281003', 'Team A practice', 'published'),
    ('00000000-0000-0000-0000-000000281081', '00000000-0000-0000-0000-000000281053', 'Team B practice', 'published')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_practice_effectiveness_reviews
    (id, team_id, practice_id, focus_area, conclusion, visibility, player_ids, dedupe_key) VALUES
    ('00000000-0000-0000-0000-000000281101', '00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281031',
     'Two-strike approach', 'R1 visible to P1', 'player_visible',
     ARRAY['00000000-0000-0000-0000-000000281012'::uuid], 'pgtap-r1'),
    ('00000000-0000-0000-0000-000000281102', '00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281031',
     'Two-strike approach', 'R2 staff only', 'staff_only',
     ARRAY['00000000-0000-0000-0000-000000281012'::uuid], 'pgtap-r2'),
    ('00000000-0000-0000-0000-000000281103', '00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281031',
     'Two-strike approach', 'R3 restricted', 'restricted',
     ARRAY['00000000-0000-0000-0000-000000281012'::uuid], 'pgtap-r3'),
    ('00000000-0000-0000-0000-000000281104', '00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281031',
     'Bunt defense', 'R4 visible to P2', 'player_visible',
     ARRAY['00000000-0000-0000-0000-000000281022'::uuid], 'pgtap-r4'),
    ('00000000-0000-0000-0000-000000281105', '00000000-0000-0000-0000-000000281003', '00000000-0000-0000-0000-000000281031',
     'Team defense', 'R5 team level, no players', 'player_visible',
     '{}'::uuid[], 'pgtap-r5'),
    ('00000000-0000-0000-0000-000000281106', '00000000-0000-0000-0000-000000281053', '00000000-0000-0000-0000-000000281081',
     'Baserunning', 'R6 visible to P3', 'player_visible',
     ARRAY['00000000-0000-0000-0000-000000281062'::uuid], 'pgtap-r6'),
    ('00000000-0000-0000-0000-000000281107', '00000000-0000-0000-0000-000000281053', '00000000-0000-0000-0000-000000281081',
     'Baserunning', 'R7 names P1 on a team P1 is not on', 'player_visible',
     ARRAY['00000000-0000-0000-0000-000000281012'::uuid], 'pgtap-r7')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Player 1 (team A).
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000281010", "role": "authenticated"}';

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281101'),
  1,
  'P1 reads their own review that the coach marked player_visible'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281102'),
  0,
  'P1 cannot read their own staff_only review'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281103'),
  0,
  'P1 cannot read their own restricted review'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281104'),
  0,
  'P1 cannot read a teammate''s player_visible review'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281105'),
  0,
  'P1 cannot read a team-level review that names no players'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE team_id = '00000000-0000-0000-0000-000000281003'),
  1,
  'P1 sees exactly one review on team A'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_practice_effectiveness_reviews
    WHERE id = '00000000-0000-0000-0000-000000281107'),
  0,
  'P1 cannot read a review on a team they are not a member of, even one naming them'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Player 2 (team A): sees only their own visible review.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000281020", "role": "authenticated"}';

SELECT is(
  (SELECT array_agg(id ORDER BY id)::text FROM public.baseball_practice_effectiveness_reviews
    WHERE id::text LIKE '00000000-0000-0000-0000-0000002811%'),
  '{00000000-0000-0000-0000-000000281104}',
  'P2 reads exactly their own visible review (R4)'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Player 3 (team B): sees only their own visible review, nothing of team A.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000281060", "role": "authenticated"}';

SELECT is(
  (SELECT array_agg(id ORDER BY id)::text FROM public.baseball_practice_effectiveness_reviews
    WHERE id::text LIKE '00000000-0000-0000-0000-0000002811%'),
  '{00000000-0000-0000-0000-000000281106}',
  'P3 reads exactly their own visible review (R6) and nothing of team A'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
