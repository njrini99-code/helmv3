-- v3 local-dev seed
--
-- Loaded by Supabase CLI on `supabase db reset`. Production NEVER sees
-- this file; the migration chain alone is canonical for prod.
--
-- GOAL (per master plan Part XXVIII): one team, 5 players, 10 rounds
-- each, populated standing. Only the pieces that exist as of W9-pt2 are
-- ship-able now; later waves fill in the rest in dependency order:
--
--   W10 — append PGA standards seed rows
--   W11 — append golf_player_standing snapshot rows (or rely on cron)
--   W18 — append golf_goals fixtures
--   W21+ — append synthetic shots that exercise the v3 generators
--
-- Idempotent: every statement uses ON CONFLICT or guards so re-running
-- inside a long-lived local DB doesn't corrupt state. `supabase db reset`
-- always starts clean, so the guards are belt-and-suspenders.
--
-- USER NOTE: `auth.users` rows cannot be created from raw SQL through
-- the Supabase Auth API (encrypted password + GoTrue audit log). The
-- intended fixture user path is:
--
--   1. Spin up local stack:        supabase start
--   2. Run app onboarding flows OR a future scripts/seed-local-users.ts
--      that calls supabase.auth.admin.createUser() for 1 coach + 5 players.
--   3. Run `supabase db reset` (which re-applies migrations and this seed).
--
-- The blocks below stage the *non-user-dependent* fixtures and leave
-- user-dependent inserts behind feature checks so a fresh `supabase db
-- reset` (with no users yet) succeeds quietly.

-- ----------------------------------------------------------------------
-- Sanity check: v3 migrations have landed
-- ----------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.golf_metrics') IS NULL THEN
    RAISE EXCEPTION 'v3-seed: golf_metrics not found. Apply migrations first.';
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- Metrics seed is performed by 20260524190200_v3_golf_metrics_seed.sql.
-- No additional metric data shipped from this file.
-- ----------------------------------------------------------------------

-- ----------------------------------------------------------------------
-- Coach/player fixture rows are inserted only when at least one
-- auth.users row already exists (i.e. a developer has signed up via the
-- app or the future scripts/seed-local-users.ts). Otherwise this is a
-- silent no-op so `supabase db reset` works on a brand-new dev machine.
-- ----------------------------------------------------------------------
DO $$
DECLARE
  v_user_count int;
  v_coach_id uuid;
  v_team_id uuid;
BEGIN
  SELECT count(*) INTO v_user_count FROM auth.users LIMIT 1;
  IF v_user_count = 0 THEN
    RAISE NOTICE 'v3-seed: no auth.users yet — skipping fixture coach/team. Sign up via the app or run scripts/seed-local-users.ts, then re-run supabase db reset.';
    RETURN;
  END IF;

  -- Pick the first coach we find as the fixture coach
  SELECT c.id INTO v_coach_id
  FROM public.golf_coaches c
  ORDER BY c.created_at ASC
  LIMIT 1;
  IF v_coach_id IS NULL THEN
    RAISE NOTICE 'v3-seed: no golf_coaches rows — skipping v3 settings fixture.';
    RETURN;
  END IF;

  -- Pick the first team they coach
  SELECT s.team_id INTO v_team_id
  FROM public.golf_team_coach_staff s
  WHERE s.coach_id = v_coach_id
  ORDER BY s.created_at ASC
  LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE NOTICE 'v3-seed: coach % has no team — skipping settings fixture.', v_coach_id;
    RETURN;
  END IF;

  -- Ensure a golf_coachhelm_settings row exists with the v3 columns populated.
  -- The unique key in prod is (coach_id) only — one settings row per coach
  -- even though team_id is in the table (verified via pg_constraint, 2026-05-24).
  INSERT INTO public.golf_coachhelm_settings (
    coach_id, team_id,
    enabled, auto_insights, weekly_summary, trend_alerts,
    insight_frequency, min_rounds_for_insights,
    goal_assignment_default, llm_narrative_enabled, llm_budget_usd_per_day
  )
  VALUES (
    v_coach_id, v_team_id,
    true, true, true, true,
    'daily', 5,
    'suggested', true, 5.00
  )
  ON CONFLICT (coach_id) DO UPDATE
    SET goal_assignment_default = EXCLUDED.goal_assignment_default,
        llm_narrative_enabled = EXCLUDED.llm_narrative_enabled,
        llm_budget_usd_per_day = EXCLUDED.llm_budget_usd_per_day,
        team_id = EXCLUDED.team_id,
        updated_at = now();

  RAISE NOTICE 'v3-seed: coachhelm_settings populated for coach=% team=%', v_coach_id, v_team_id;
END $$;

-- ----------------------------------------------------------------------
-- TODO (later waves):
--   W10 — INSERT INTO golf_pga_standards (...) ON CONFLICT DO NOTHING;
--   W11 — INSERT INTO golf_player_standing (...) ON CONFLICT DO UPDATE;
--   W18 — INSERT INTO golf_goals (...) ON CONFLICT DO NOTHING;
--   W21+ — INSERT INTO golf_shots fixture rows that exercise generators.
-- ----------------------------------------------------------------------
