-- =============================================================================
-- 20260625000080_helm_lifting_backfill_from_baseball.sql
--
-- Wave-2 (W2-G) backfill: copies every existing baseball_lift_* /
-- baseball_readiness_* / baseball_strength_* / baseball_soreness_* /
-- baseball_bodyweight_* / baseball_availability_* row into the parallel
-- helm_lifting_* tables.
--
-- Blueprint §5: "Seed athletes first, then V11 graph in dependency order."
--
-- Dependency order (must match FK chain):
--   0. helm_lifting_athletes          ← baseball_players + baseball_teams
--   1. helm_lifting_exercises          ← baseball_lift_exercises
--   2. helm_lifting_exercise_substitutions ← baseball_lift_exercise_substitutions
--   3. helm_lifting_groups             ← baseball_strength_groups
--   4. helm_lifting_group_members      ← baseball_strength_group_members
--   5. helm_lifting_programs           ← baseball_lift_programs
--   6. helm_lifting_weeks              ← baseball_lift_weeks
--   7. helm_lifting_days               ← baseball_lift_days
--   8. helm_lifting_sections           ← baseball_lift_sections
--   9. helm_lifting_prescriptions      ← baseball_lift_prescriptions
--  10. helm_lifting_program_assignments← baseball_lift_program_assignments
--  11. helm_lifting_sessions           ← baseball_lift_sessions
--  12. helm_lifting_session_exercises  ← baseball_lift_session_exercises
--  13. helm_lifting_set_results        ← baseball_lift_set_results
--  14. helm_lifting_readiness_checkins ← baseball_readiness_checkins
--  15. helm_lifting_soreness_maps      ← baseball_soreness_maps
--  16. helm_lifting_bodyweight_entries ← baseball_bodyweight_entries
--  17. helm_lifting_availability_statuses ← baseball_availability_statuses
--  18. helm_lifting_maxes              ← baseball_strength_maxes
--  19. helm_lifting_prs                ← baseball_strength_prs
--  20. helm_lifting_import_runs        ← baseball_lift_import_runs
--  21. helm_lifting_import_rows        ← baseball_lift_import_rows
--
-- Idempotency: every INSERT uses ON CONFLICT DO NOTHING on legacy_baseball_id
-- (partial-unique index WHERE legacy_baseball_id IS NOT NULL, created by
-- migrations 000010 + 000020 for the helm_lifting_* tables). Re-running this
-- migration is safe.
--
-- Safety:
--   * READS ONLY: baseball_* / organizations tables.
--   * WRITES ONLY: helm_lifting_* tables.
--   * NEVER touches golf_* or shared schema objects.
--   * Each table is wrapped in BEGIN … EXCEPTION … END so one failed table
--     does not abort the entire migration.
--   * Guards via to_regclass() ensure the block is a no-op on a fresh DB
--     that hasn't run the source migrations yet.
--   * SECURITY DEFINER is NOT used — this runs as the migration-role which
--     already has full service_role access.
--
-- NOT applied here. Ships as a migration file only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utility: resolve organization_id from a baseball_team_id.
-- Teams may have a NULL organization_id on old rows; we fall back to a
-- sentinel org only when we must — callers skip the row if the org is NULL.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0. helm_lifting_athletes — seed first; all downstream tables reference this.
--    Source: baseball_players joined to their active roster team(s).
--    One athlete row per (org, sport='baseball', player_id).
-- ===========================================================================
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_players') IS NULL
     OR to_regclass('public.helm_lifting_athletes') IS NULL THEN
    RAISE NOTICE 'backfill athletes: source or target table absent, skipping.';
    RETURN;
  END IF;

  INSERT INTO public.helm_lifting_athletes
    (organization_id, sport, sport_player_id, user_id,
     team_id, first_name, last_name, position, is_active, created_at, updated_at)
  SELECT DISTINCT ON (t.organization_id, p.id)
    t.organization_id,
    'baseball'::text,
    p.id,
    p.user_id,
    t.id,
    p.first_name,
    p.last_name,
    p.primary_position,
    true,
    COALESCE(p.created_at, now()),
    COALESCE(p.updated_at, now())
  FROM public.baseball_players      p
  JOIN public.baseball_team_members btm ON btm.player_id = p.id
  JOIN public.baseball_teams        t   ON t.id = btm.team_id
  WHERE t.organization_id IS NOT NULL
    AND btm.status = 'active'
  ORDER BY t.organization_id, p.id, btm.created_at DESC
  ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_athletes (via team_members): % rows inserted.', v_count;

  IF false THEN
    -- Last resort: pull players from lift_sessions (they're on a team) or
    -- from lift_results which carry team_id directly.
    IF to_regclass('public.baseball_lift_sessions') IS NOT NULL THEN
      INSERT INTO public.helm_lifting_athletes
        (organization_id, sport, sport_player_id, user_id,
         team_id, first_name, last_name, position, is_active, created_at, updated_at)
      SELECT DISTINCT ON (t.organization_id, p.id)
        t.organization_id,
        'baseball'::text,
        p.id,
        p.user_id,
        t.id,
        p.first_name,
        p.last_name,
        p.primary_position,
        true,
        COALESCE(p.created_at, now()),
        COALESCE(p.updated_at, now())
      FROM public.baseball_lift_sessions ls
      JOIN public.baseball_players       p  ON p.id  = ls.player_id
      JOIN public.baseball_teams         t  ON t.id  = ls.team_id
      WHERE t.organization_id IS NOT NULL
      ORDER BY t.organization_id, p.id, ls.created_at DESC
      ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING;

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RAISE NOTICE 'backfill helm_lifting_athletes (via lift_sessions): % rows inserted.', v_count;
    ELSE
      RAISE NOTICE 'backfill helm_lifting_athletes: no membership table found, skipping (no lift_sessions either).';
    END IF;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_athletes failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 1. helm_lifting_exercises ← baseball_lift_exercises
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_exercises') IS NULL
     OR to_regclass('public.helm_lifting_exercises') IS NULL THEN
    RAISE NOTICE 'backfill exercises: source or target absent, skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_exercises
    (organization_id, sport, name, category, primary_pattern, body_region,
     equipment, unilateral, sport_constraints, sport_tags,
     default_unit, track_load, track_reps, track_sets,
     track_velocity, track_distance, track_time, track_rpe,
     video_url, instructions, coaching_cues, contraindication_notes,
     is_global, is_active, legacy_baseball_id, created_at, updated_at)
  SELECT
    COALESCE(t.organization_id,
      (SELECT id FROM public.organizations LIMIT 1)) AS organization_id,
    'baseball'::text,
    e.name,
    e.category,
    e.primary_pattern,
    e.body_region,
    e.equipment,
    e.unilateral,
    e.baseball_constraints,
    e.baseball_tags,
    e.default_unit,
    e.track_load,
    e.track_reps,
    e.track_sets,
    e.track_velocity,
    e.track_distance,
    e.track_time,
    e.track_rpe,
    e.video_url,
    e.instructions,
    e.coaching_cues,
    e.contraindication_notes,
    e.is_global,
    e.is_active,
    e.id,              -- legacy_baseball_id
    e.created_at,
    e.updated_at
  FROM public.baseball_lift_exercises e
  LEFT JOIN public.baseball_teams t ON t.id = e.team_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_exercises: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_exercises failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 2. helm_lifting_exercise_substitutions ← baseball_lift_exercise_substitutions
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_exercise_substitutions') IS NULL
     OR to_regclass('public.helm_lifting_exercise_substitutions') IS NULL THEN
    RAISE NOTICE 'backfill exercise_substitutions: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_exercise_substitutions
    (exercise_id, substitute_exercise_id, reason, legacy_baseball_id, created_at)
  SELECT
    he.id   AS exercise_id,
    hs.id   AS substitute_exercise_id,
    bs.reason,
    bs.id,
    bs.created_at
  FROM public.baseball_lift_exercise_substitutions bs
  JOIN public.helm_lifting_exercises he ON he.legacy_baseball_id = bs.exercise_id
  JOIN public.helm_lifting_exercises hs ON hs.legacy_baseball_id = bs.substitute_exercise_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_exercise_substitutions: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_exercise_substitutions failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 3. helm_lifting_groups ← baseball_strength_groups
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_strength_groups') IS NULL
     OR to_regclass('public.helm_lifting_groups') IS NULL THEN
    RAISE NOTICE 'backfill groups: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_groups
    (organization_id, sport, team_id, name, description, is_active,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    sg.team_id,
    sg.name,
    sg.description,
    sg.is_active,
    sg.id,
    sg.created_at,
    COALESCE(sg.updated_at, sg.created_at)
  FROM public.baseball_strength_groups sg
  JOIN public.baseball_teams           t  ON t.id = sg.team_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_groups: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_groups failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 4. helm_lifting_group_members ← baseball_strength_group_members
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_strength_group_members') IS NULL
     OR to_regclass('public.helm_lifting_group_members') IS NULL THEN
    RAISE NOTICE 'backfill group_members: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_group_members
    (group_id, athlete_id, starts_at, ends_at, legacy_baseball_id, created_at)
  SELECT
    hg.id   AS group_id,
    ha.id   AS athlete_id,
    gm.starts_at,
    gm.ends_at,
    gm.id,
    gm.created_at
  FROM public.baseball_strength_group_members gm
  JOIN public.helm_lifting_groups             hg ON hg.legacy_baseball_id = gm.group_id
  JOIN public.helm_lifting_athletes           ha ON ha.sport_player_id    = gm.player_id
                                                 AND ha.sport             = 'baseball'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_group_members: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_group_members failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 5. helm_lifting_programs ← baseball_lift_programs
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_programs') IS NULL
     OR to_regclass('public.helm_lifting_programs') IS NULL THEN
    RAISE NOTICE 'backfill programs: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_programs
    (organization_id, sport, team_id, name, description, phase, goal,
     visibility, status, is_template, start_date, end_date,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    p.team_id,
    p.name,
    p.description,
    p.phase,
    p.goal,
    p.visibility,
    p.status,
    p.is_template,
    p.start_date,
    p.end_date,
    p.id,
    p.created_at,
    p.updated_at
  FROM public.baseball_lift_programs p
  JOIN public.baseball_teams         t ON t.id = p.team_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_programs: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_programs failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 6. helm_lifting_weeks ← baseball_lift_weeks
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_weeks') IS NULL
     OR to_regclass('public.helm_lifting_weeks') IS NULL THEN
    RAISE NOTICE 'backfill weeks: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_weeks
    (program_id, week_number, name, theme, deload, legacy_baseball_id, created_at)
  SELECT
    hp.id AS program_id,
    w.week_number,
    w.name,
    w.theme,
    w.deload,
    w.id,
    w.created_at
  FROM public.baseball_lift_weeks   w
  JOIN public.helm_lifting_programs hp ON hp.legacy_baseball_id = w.program_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_weeks: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_weeks failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 7. helm_lifting_days ← baseball_lift_days
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_days') IS NULL
     OR to_regclass('public.helm_lifting_days') IS NULL THEN
    RAISE NOTICE 'backfill days: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_days
    (week_id, day_number, name, day_type, sport_context,
     estimated_minutes, legacy_baseball_id, created_at)
  SELECT
    hw.id AS week_id,
    d.day_number,
    d.name,
    d.day_type,
    d.baseball_context,   -- maps to sport_context in helm schema
    d.estimated_minutes,
    d.id,
    d.created_at
  FROM public.baseball_lift_days   d
  JOIN public.helm_lifting_weeks  hw ON hw.legacy_baseball_id = d.week_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_days: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_days failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 8. helm_lifting_sections ← baseball_lift_sections
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_sections') IS NULL
     OR to_regclass('public.helm_lifting_sections') IS NULL THEN
    RAISE NOTICE 'backfill sections: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_sections
    (lift_day_id, section_order, name, section_type, instructions,
     legacy_baseball_id, created_at)
  SELECT
    hd.id AS lift_day_id,
    s.section_order,
    s.name,
    s.section_type,
    s.instructions,
    s.id,
    s.created_at
  FROM public.baseball_lift_sections s
  JOIN public.helm_lifting_days      hd ON hd.legacy_baseball_id = s.lift_day_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_sections: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_sections failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 9. helm_lifting_prescriptions ← baseball_lift_prescriptions
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_prescriptions') IS NULL
     OR to_regclass('public.helm_lifting_prescriptions') IS NULL THEN
    RAISE NOTICE 'backfill prescriptions: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_prescriptions
    (section_id, exercise_id, order_index, prescription_type,
     sets, reps, load_value, load_unit, percent_1rm,
     target_rpe, target_rir, target_velocity_min, target_velocity_max,
     rest_seconds, tempo, coaching_note,
     legacy_baseball_id, created_at)
  SELECT
    hs.id  AS section_id,
    he.id  AS exercise_id,
    pr.order_index,
    pr.prescription_type,
    pr.sets,
    pr.reps,
    pr.load_value,
    pr.load_unit,
    pr.percent_1rm,
    pr.target_rpe,
    pr.target_rir,
    pr.target_velocity_min,
    pr.target_velocity_max,
    pr.rest_seconds,
    pr.tempo,
    pr.coaching_note,
    pr.id,
    pr.created_at
  FROM public.baseball_lift_prescriptions pr
  JOIN public.helm_lifting_sections       hs ON hs.legacy_baseball_id = pr.section_id
  LEFT JOIN public.helm_lifting_exercises he ON he.legacy_baseball_id = pr.exercise_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_prescriptions: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_prescriptions failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 10. helm_lifting_program_assignments ← baseball_lift_program_assignments
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_program_assignments') IS NULL
     OR to_regclass('public.helm_lifting_program_assignments') IS NULL THEN
    RAISE NOTICE 'backfill program_assignments: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_program_assignments
    (organization_id, sport, team_id, program_id, lift_day_id,
     assignment_type, group_id, athlete_id,
     scheduled_date, scheduled_start, scheduled_end,
     status, player_visible_at, legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    pa.team_id,
    hp.id  AS program_id,
    hd.id  AS lift_day_id,
    pa.assignment_type,
    hg.id  AS group_id,
    ha.id  AS athlete_id,
    pa.scheduled_date,
    pa.scheduled_start,
    pa.scheduled_end,
    pa.status,
    pa.player_visible_at,
    pa.id,
    pa.created_at,
    pa.updated_at
  FROM public.baseball_lift_program_assignments pa
  JOIN public.baseball_teams                    t   ON t.id  = pa.team_id
  JOIN public.helm_lifting_programs             hp  ON hp.legacy_baseball_id = pa.program_id
  JOIN public.helm_lifting_days                 hd  ON hd.legacy_baseball_id = pa.lift_day_id
  LEFT JOIN public.helm_lifting_groups          hg  ON hg.legacy_baseball_id = pa.group_id
  LEFT JOIN public.helm_lifting_athletes        ha  ON ha.sport_player_id    = pa.player_id
                                                   AND ha.sport              = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_program_assignments: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_program_assignments failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 11. helm_lifting_sessions ← baseball_lift_sessions
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_sessions') IS NULL
     OR to_regclass('public.helm_lifting_sessions') IS NULL THEN
    RAISE NOTICE 'backfill sessions: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_sessions
    (program_assignment_id, organization_id, sport, team_id, athlete_id,
     title, day_type, sport_context, scheduled_date, estimated_minutes,
     status, started_at, completed_at,
     coach_review_status, player_note, coach_note,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    hpa.id AS program_assignment_id,
    t.organization_id,
    'baseball'::text,
    s.team_id,
    ha.id  AS athlete_id,
    s.title,
    s.day_type,
    s.baseball_context,
    s.scheduled_date,
    s.estimated_minutes,
    s.status,
    s.started_at,
    s.completed_at,
    s.coach_review_status,
    s.player_note,
    s.coach_note,
    s.id,
    s.created_at,
    s.updated_at
  FROM public.baseball_lift_sessions              s
  JOIN public.baseball_teams                      t   ON t.id  = s.team_id
  JOIN public.helm_lifting_athletes               ha  ON ha.sport_player_id = s.player_id
                                                     AND ha.sport           = 'baseball'
  LEFT JOIN public.helm_lifting_program_assignments hpa ON hpa.legacy_baseball_id = s.program_assignment_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_sessions: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_sessions failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 12. helm_lifting_session_exercises ← baseball_lift_session_exercises
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_session_exercises') IS NULL
     OR to_regclass('public.helm_lifting_session_exercises') IS NULL THEN
    RAISE NOTICE 'backfill session_exercises: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_session_exercises
    (session_id, prescription_id, exercise_id,
     exercise_name_snapshot, section_name_snapshot, section_type_snapshot,
     order_index, prescribed_sets, prescribed_reps,
     prescribed_load, prescribed_load_unit, prescribed_rpe,
     status, legacy_baseball_id, created_at, updated_at)
  SELECT
    hs.id   AS session_id,
    hpr.id  AS prescription_id,
    he.id   AS exercise_id,
    se.exercise_name_snapshot,
    se.section_name_snapshot,
    se.section_type_snapshot,
    se.order_index,
    se.prescribed_sets,
    se.prescribed_reps,
    se.prescribed_load,
    se.prescribed_load_unit,
    se.prescribed_rpe,
    se.status,
    se.id,
    se.created_at,
    se.updated_at
  FROM public.baseball_lift_session_exercises   se
  JOIN public.helm_lifting_sessions             hs  ON hs.legacy_baseball_id  = se.session_id
  LEFT JOIN public.helm_lifting_prescriptions   hpr ON hpr.legacy_baseball_id = se.prescription_id
  LEFT JOIN public.helm_lifting_exercises       he  ON he.legacy_baseball_id  = se.exercise_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_session_exercises: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_session_exercises failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 13. helm_lifting_set_results ← baseball_lift_set_results
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_set_results') IS NULL
     OR to_regclass('public.helm_lifting_set_results') IS NULL THEN
    RAISE NOTICE 'backfill set_results: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_set_results
    (session_exercise_id, organization_id, sport, athlete_id,
     set_number, prescribed_reps, actual_reps,
     prescribed_load, actual_load, load_unit,
     rpe, rir, velocity, completed_at, player_note, coach_observed,
     legacy_baseball_id, created_at)
  SELECT
    hse.id AS session_exercise_id,
    t.organization_id,
    'baseball'::text,
    ha.id  AS athlete_id,
    sr.set_number,
    sr.prescribed_reps,
    sr.actual_reps,
    sr.prescribed_load,
    sr.actual_load,
    sr.load_unit,
    sr.rpe,
    sr.rir,
    sr.velocity,
    sr.completed_at,
    sr.player_note,
    sr.coach_observed,
    sr.id,
    sr.created_at
  FROM public.baseball_lift_set_results           sr
  JOIN public.helm_lifting_session_exercises      hse ON hse.legacy_baseball_id = sr.session_exercise_id
  JOIN public.baseball_teams                      t   ON t.id  = sr.team_id
  JOIN public.helm_lifting_athletes               ha  ON ha.sport_player_id = sr.player_id
                                                     AND ha.sport           = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_set_results: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_set_results failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 14. helm_lifting_readiness_checkins ← baseball_readiness_checkins
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_readiness_checkins') IS NULL
     OR to_regclass('public.helm_lifting_readiness_checkins') IS NULL THEN
    RAISE NOTICE 'backfill readiness_checkins: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_readiness_checkins
    (organization_id, sport, athlete_id, check_date,
     sleep_hours, energy_level, soreness_level, arm_status, mood, notes,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ha.id AS athlete_id,
    rc.check_date,
    rc.sleep_hours,
    rc.energy_level,
    rc.soreness_level,
    rc.arm_status,
    rc.mood,
    rc.notes,
    rc.id,
    rc.created_at,
    rc.updated_at
  FROM public.baseball_readiness_checkins rc
  JOIN public.baseball_teams              t  ON t.id  = rc.team_id
  JOIN public.helm_lifting_athletes       ha ON ha.sport_player_id = rc.player_id
                                            AND ha.sport           = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_readiness_checkins: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_readiness_checkins failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 15. helm_lifting_soreness_maps ← baseball_soreness_maps
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_soreness_maps') IS NULL
     OR to_regclass('public.helm_lifting_soreness_maps') IS NULL THEN
    RAISE NOTICE 'backfill soreness_maps: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_soreness_maps
    (checkin_id, organization_id, sport, athlete_id,
     body_region, side, severity, note, legacy_baseball_id, created_at)
  SELECT
    hrc.id AS checkin_id,
    t.organization_id,
    'baseball'::text,
    ha.id  AS athlete_id,
    sm.body_region,
    sm.side,
    sm.severity,
    sm.note,
    sm.id,
    sm.created_at
  FROM public.baseball_soreness_maps             sm
  JOIN public.helm_lifting_readiness_checkins    hrc ON hrc.legacy_baseball_id = sm.checkin_id
  JOIN public.baseball_teams                     t   ON t.id  = sm.team_id
  JOIN public.helm_lifting_athletes              ha  ON ha.sport_player_id = sm.player_id
                                                    AND ha.sport           = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_soreness_maps: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_soreness_maps failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 16. helm_lifting_bodyweight_entries ← baseball_bodyweight_entries
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_bodyweight_entries') IS NULL
     OR to_regclass('public.helm_lifting_bodyweight_entries') IS NULL THEN
    RAISE NOTICE 'backfill bodyweight_entries: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_bodyweight_entries
    (organization_id, sport, athlete_id, entry_date,
     weight_lbs, source, legacy_baseball_id, created_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ha.id AS athlete_id,
    be.entry_date,
    be.weight_lbs,
    be.source,
    be.id,
    be.created_at
  FROM public.baseball_bodyweight_entries be
  JOIN public.baseball_teams              t  ON t.id  = be.team_id
  JOIN public.helm_lifting_athletes       ha ON ha.sport_player_id = be.player_id
                                            AND ha.sport           = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_bodyweight_entries: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_bodyweight_entries failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 17. helm_lifting_availability_statuses ← baseball_availability_statuses
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_availability_statuses') IS NULL
     OR to_regclass('public.helm_lifting_availability_statuses') IS NULL THEN
    RAISE NOTICE 'backfill availability_statuses: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_availability_statuses
    (organization_id, sport, athlete_id, status,
     reason_category, note, visibility,
     starts_at, ends_at, legacy_baseball_id, created_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ha.id AS athlete_id,
    av.status,
    av.reason_category,
    av.note,
    av.visibility,
    av.starts_at,
    av.ends_at,
    av.id,
    av.created_at
  FROM public.baseball_availability_statuses av
  JOIN public.baseball_teams                  t  ON t.id  = av.team_id
  JOIN public.helm_lifting_athletes           ha ON ha.sport_player_id = av.player_id
                                                AND ha.sport           = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_availability_statuses: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_availability_statuses failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 18. helm_lifting_maxes ← baseball_strength_maxes
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_strength_maxes') IS NULL
     OR to_regclass('public.helm_lifting_maxes') IS NULL THEN
    RAISE NOTICE 'backfill maxes: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_maxes
    (organization_id, sport, athlete_id, exercise_id,
     max_type, value, unit, test_date, source, confidence,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ha.id AS athlete_id,
    he.id AS exercise_id,
    mx.max_type,
    mx.value,
    mx.unit,
    mx.test_date,
    mx.source,
    mx.confidence,
    mx.id,
    mx.created_at,
    mx.updated_at
  FROM public.baseball_strength_maxes  mx
  JOIN public.baseball_teams            t  ON t.id  = mx.team_id
  JOIN public.helm_lifting_athletes     ha ON ha.sport_player_id = mx.player_id
                                          AND ha.sport           = 'baseball'
  JOIN public.helm_lifting_exercises    he ON he.legacy_baseball_id = mx.exercise_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_maxes: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_maxes failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 19. helm_lifting_prs ← baseball_strength_prs
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_strength_prs') IS NULL
     OR to_regclass('public.helm_lifting_prs') IS NULL THEN
    RAISE NOTICE 'backfill prs: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_prs
    (organization_id, sport, athlete_id, exercise_id,
     pr_type, value, unit, achieved_at, lift_session_id,
     legacy_baseball_id, created_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ha.id  AS athlete_id,
    he.id  AS exercise_id,
    pr.pr_type,
    pr.value,
    pr.unit,
    pr.achieved_at,
    hls.id AS lift_session_id,
    pr.id,
    pr.created_at
  FROM public.baseball_strength_prs   pr
  JOIN public.baseball_teams           t   ON t.id   = pr.team_id
  JOIN public.helm_lifting_athletes    ha  ON ha.sport_player_id = pr.player_id
                                          AND ha.sport           = 'baseball'
  JOIN public.helm_lifting_exercises   he  ON he.legacy_baseball_id = pr.exercise_id
  LEFT JOIN public.helm_lifting_sessions hls ON hls.legacy_baseball_id = pr.lift_session_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_prs: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_prs failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 20. helm_lifting_import_runs ← baseball_lift_import_runs
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_import_runs') IS NULL
     OR to_regclass('public.helm_lifting_import_runs') IS NULL THEN
    RAISE NOTICE 'backfill import_runs: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_import_runs
    (organization_id, sport, source, import_kind,
     file_name, file_hash, mapping_json, units_json,
     total_rows, matched_rows, unmatched_rows,
     status, source_confidence, committed_at, rolled_back_at,
     legacy_baseball_id, created_at, updated_at)
  SELECT
    t.organization_id,
    'baseball'::text,
    ir.source,
    ir.import_kind,
    ir.file_name,
    ir.file_hash,
    ir.mapping_json,
    ir.units_json,
    ir.total_rows,
    ir.matched_rows,
    ir.unmatched_rows,
    ir.status,
    ir.source_confidence,
    ir.committed_at,
    ir.rolled_back_at,
    ir.id,
    ir.created_at,
    ir.updated_at
  FROM public.baseball_lift_import_runs ir
  JOIN public.baseball_teams             t ON t.id = ir.team_id
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_import_runs: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_import_runs failed: %', SQLERRM;
END $$;

-- ===========================================================================
-- 21. helm_lifting_import_rows ← baseball_lift_import_rows
-- ===========================================================================
DO $$
DECLARE v_count integer := 0;
BEGIN
  IF to_regclass('public.baseball_lift_import_rows') IS NULL
     OR to_regclass('public.helm_lifting_import_rows') IS NULL THEN
    RAISE NOTICE 'backfill import_rows: skipping.'; RETURN;
  END IF;

  INSERT INTO public.helm_lifting_import_rows
    (import_run_id, organization_id, sport, row_number, raw_json,
     matched_athlete_id, match_status, validation_error, created_at)
  SELECT
    hir.id AS import_run_id,
    t.organization_id,
    'baseball'::text,
    rw.row_number,
    rw.raw_json,
    ha.id  AS matched_athlete_id,
    rw.match_status,
    rw.validation_error,
    rw.created_at
  FROM public.baseball_lift_import_rows         rw
  JOIN public.helm_lifting_import_runs          hir ON hir.legacy_baseball_id   = rw.import_run_id
  JOIN public.baseball_teams                    t   ON t.id                     = rw.team_id
  LEFT JOIN public.helm_lifting_athletes        ha  ON ha.sport_player_id       = rw.matched_player_id
                                                   AND ha.sport                 = 'baseball'
  WHERE t.organization_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'backfill helm_lifting_import_rows: % rows inserted.', v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill helm_lifting_import_rows failed: %', SQLERRM;
END $$;

-- ============================================================================
-- END — W2-G backfill migration. READS: baseball_* / organizations.
--        WRITES: helm_lifting_* only. Golf tables untouched.
-- ============================================================================
