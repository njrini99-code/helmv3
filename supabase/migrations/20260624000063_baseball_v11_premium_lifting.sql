-- =============================================================================
-- BaseballHelm — V11 Premium Strength & Lifting System (full, additive)
-- =============================================================================
-- Controlling spec:
--   docs/.../26_final_auth_lifting_current_app_v11/v11_strength_coach_premium_lifting_system.md
--   docs/.../18_massive_program_os_v4/v4_strength_lifting_performance_system.md
--   docs/.../19_breakthrough_product_systems_v5/v5_performance_lifting_breakthrough_system.md
--
-- This UPGRADES the "Lite" surface (migration 20260624000061, which shipped
--   baseball_exercises / baseball_lift_assignments / baseball_lift_results /
--   baseball_readiness_checkins) to the full V11 program OS. It is ADDITIVE
--   ONLY — it never drops or rewrites a Lite table. The Lite tables stay; this
--   migration adds the materialized program model alongside them and a thin
--   column-extension on the existing readiness check-in table.
--
-- New table families (V11 spec "Data Model Summary"):
--   * Strength groups ....... baseball_strength_groups, _group_members
--   * Exercise library ...... baseball_lift_exercises, _exercise_substitutions
--   * Program model ......... baseball_lift_programs, _weeks, _days, _sections,
--                             _prescriptions
--   * Materialized sessions . baseball_lift_sessions, _session_exercises,
--                             _set_results   (MATERIALIZE at publish, never
--                             compute template math on the fly — spec L463)
--   * Publish/assign ........ baseball_lift_program_assignments
--   * Readiness extras ...... baseball_soreness_maps, baseball_bodyweight_entries,
--                             baseball_availability_statuses
--   * Progression ........... baseball_strength_maxes, baseball_strength_prs
--   * Imports ............... baseball_lift_import_runs, _import_rows
--
-- SECURITY MODEL
--   * V11 caps (corrected): can_manage_lifting gates ALL program/exercise/group/
--     session staff writes; can_view_readiness gates staff reads of readiness,
--     soreness, bodyweight, and availability (NOT can_view_medical — the strength
--     preset never grants the medical gate; that was the Lite bug we do not
--     repeat). Health-adjacent rows are never shown to other players.
--   * A player reads/writes only their OWN sessions, set results, soreness maps,
--     bodyweight, and readiness. Availability is staff-authored, player-readable
--     for the owning player only.
--   * Reuses SECURITY DEFINER helpers from 20260624000050:
--       is_baseball_team_staff, is_baseball_team_member,
--       has_baseball_staff_capability, can_manage_baseball_lift_group,
--       can_view_baseball_player, get_my_baseball_player_id, get_my_coach_id.
--
-- GUARANTEES
--   * Idempotent / additive: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, DROP POLICY IF EXISTS + CREATE. No DROP TABLE/COLUMN, no rename, no
--     destructive UPDATE/DELETE. RLS ENABLED on every new table. anon revoked.
--   * NOT applied here (production GolfHelm shares this DB). Hand-written TS types
--     live in src/lib/types/baseball-lifting-v11.ts.
-- =============================================================================

-- ============================================================================
-- 0. Extend the existing Lite readiness check-in with the full V11 inputs.
--    ADDITIVE columns only — the player-self RLS already on the table covers
--    these new columns (RLS is row-, not column-, scoped here).
-- ============================================================================
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS stress_level        integer
    CHECK (stress_level IS NULL OR (stress_level BETWEEN 1 AND 5));
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS lower_body_status   integer
    CHECK (lower_body_status IS NULL OR (lower_body_status BETWEEN 1 AND 5));
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS illness_flag        boolean NOT NULL DEFAULT false;
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS readiness_score     numeric;
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS readiness_band      text
    CHECK (readiness_band IS NULL OR readiness_band IN
      ('green','yellow','orange_lower','orange_upper','red','blue'));
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS lift_session_id     uuid;
ALTER TABLE public.baseball_readiness_checkins
  ADD COLUMN IF NOT EXISTS visibility          text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff','performance_staff','head_coach_only'));

-- ============================================================================
-- 1. STRENGTH GROUPS — how the strength coach organizes the room.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_strength_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  group_type  text NOT NULL DEFAULT 'static'
    CHECK (group_type IN ('static','dynamic','imported','temporary')),
  rule_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_strength_groups_team_idx
  ON public.baseball_strength_groups (team_id) WHERE is_active = true;

ALTER TABLE public.baseball_strength_groups ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_strength_group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.baseball_strength_groups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  source    text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','rule','import')),
  added_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  starts_at timestamptz,
  ends_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_strength_group_member UNIQUE (group_id, player_id)
);
CREATE INDEX IF NOT EXISTS baseball_strength_group_members_group_idx
  ON public.baseball_strength_group_members (group_id);
CREATE INDEX IF NOT EXISTS baseball_strength_group_members_player_idx
  ON public.baseball_strength_group_members (player_id);

ALTER TABLE public.baseball_strength_group_members ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 2. EXERCISE LIBRARY (full V11 fields). Distinct from the Lite
--    baseball_exercises table (kept) — this is the premium typed library the
--    program builder + substitutions reference.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_lift_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'strength'
    CHECK (category IN ('warmup','power','strength','accessory','arm_care',
                        'mobility','conditioning','recovery','test')),
  primary_pattern text
    CHECK (primary_pattern IS NULL OR primary_pattern IN
      ('squat','hinge','push','pull','carry','rotate','anti_rotate','sprint',
       'jump','throw','shoulder','elbow','hip','ankle')),
  body_region text
    CHECK (body_region IS NULL OR body_region IN
      ('lower','upper','trunk','arm','full_body')),
  equipment   text,
  unilateral  boolean NOT NULL DEFAULT false,
  baseball_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseball_tags text[] NOT NULL DEFAULT '{}',
  default_unit text NOT NULL DEFAULT 'lb'
    CHECK (default_unit IN ('lb','kg','bodyweight','seconds','yards','reps','mph','watts','mps')),
  track_load     boolean NOT NULL DEFAULT true,
  track_reps     boolean NOT NULL DEFAULT true,
  track_sets     boolean NOT NULL DEFAULT true,
  track_velocity boolean NOT NULL DEFAULT false,
  track_distance boolean NOT NULL DEFAULT false,
  track_time     boolean NOT NULL DEFAULT false,
  track_rpe      boolean NOT NULL DEFAULT true,
  video_url      text,
  instructions   text,
  coaching_cues  text[] NOT NULL DEFAULT '{}',
  contraindication_notes text,
  is_global   boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_lift_exercises_scope_ck
    CHECK ((is_global AND team_id IS NULL) OR (NOT is_global AND team_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS baseball_lift_exercises_team_idx
  ON public.baseball_lift_exercises (team_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS baseball_lift_exercises_global_idx
  ON public.baseball_lift_exercises (is_global) WHERE is_global = true;
ALTER TABLE public.baseball_lift_exercises ENABLE ROW LEVEL SECURITY;
-- Guard against duplicate exercise names within a team (no destructive merge).
CREATE UNIQUE INDEX IF NOT EXISTS baseball_lift_exercises_team_name_uq
  ON public.baseball_lift_exercises (team_id, lower(name)) WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.baseball_lift_exercise_substitutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.baseball_lift_exercises(id) ON DELETE CASCADE,
  substitute_exercise_id uuid NOT NULL REFERENCES public.baseball_lift_exercises(id) ON DELETE CASCADE,
  reason      text,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_lift_substitution UNIQUE (exercise_id, substitute_exercise_id),
  CONSTRAINT baseball_lift_substitution_distinct CHECK (exercise_id <> substitute_exercise_id)
);
CREATE INDEX IF NOT EXISTS baseball_lift_exercise_subs_exercise_idx
  ON public.baseball_lift_exercise_substitutions (exercise_id);

ALTER TABLE public.baseball_lift_exercise_substitutions ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 3. PROGRAM MODEL — program -> week -> day -> section -> prescription.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_lift_programs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  phase       text NOT NULL DEFAULT 'in_season'
    CHECK (phase IN ('fall','winter','preseason','in_season','postseason',
                     'summer','return_to_play','testing')),
  goal        text NOT NULL DEFAULT 'strength'
    CHECK (goal IN ('strength','power','hypertrophy','speed','maintenance',
                    'recovery','arm_care','testing')),
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  visibility  text NOT NULL DEFAULT 'staff_only'
    CHECK (visibility IN ('staff_only','assigned_players')),
  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','archived')),
  is_template boolean NOT NULL DEFAULT false,
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_programs_team_idx
  ON public.baseball_lift_programs (team_id, status);

ALTER TABLE public.baseball_lift_programs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_weeks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES public.baseball_lift_programs(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  name        text,
  theme       text,
  deload      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_lift_week UNIQUE (program_id, week_number)
);
CREATE INDEX IF NOT EXISTS baseball_lift_weeks_program_idx
  ON public.baseball_lift_weeks (program_id);

ALTER TABLE public.baseball_lift_weeks ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id     uuid NOT NULL REFERENCES public.baseball_lift_weeks(id) ON DELETE CASCADE,
  day_number  integer NOT NULL,
  name        text,
  day_type    text NOT NULL DEFAULT 'full_body'
    CHECK (day_type IN ('lower','upper','full_body','recovery','arm_care',
                        'conditioning','testing','custom')),
  baseball_context text
    CHECK (baseball_context IS NULL OR baseball_context IN
      ('pre_game','post_game','bullpen_day','starter_plus_1','starter_plus_2',
       'travel_day','off_day','practice_day')),
  estimated_minutes integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_lift_day UNIQUE (week_id, day_number)
);
CREATE INDEX IF NOT EXISTS baseball_lift_days_week_idx
  ON public.baseball_lift_days (week_id);

ALTER TABLE public.baseball_lift_days ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lift_day_id   uuid NOT NULL REFERENCES public.baseball_lift_days(id) ON DELETE CASCADE,
  section_order integer NOT NULL DEFAULT 0,
  name          text NOT NULL,
  section_type  text NOT NULL DEFAULT 'main_strength'
    CHECK (section_type IN ('warmup','movement_prep','power','main_strength',
                            'accessory','arm_care','mobility','conditioning')),
  instructions  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_sections_day_idx
  ON public.baseball_lift_sections (lift_day_id, section_order);

ALTER TABLE public.baseball_lift_sections ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_prescriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id    uuid NOT NULL REFERENCES public.baseball_lift_sections(id) ON DELETE CASCADE,
  exercise_id   uuid REFERENCES public.baseball_lift_exercises(id) ON DELETE SET NULL,
  order_index   integer NOT NULL DEFAULT 0,
  prescription_type text NOT NULL DEFAULT 'fixed'
    CHECK (prescription_type IN ('fixed','percent_1rm','rpe','velocity',
                                 'coach_load','player_select')),
  sets          integer,
  reps          integer,
  load_value    numeric,
  load_unit     text,
  percent_1rm   numeric,
  target_rpe    numeric,
  target_rir    numeric,
  target_velocity_min numeric,
  target_velocity_max numeric,
  rest_seconds  integer,
  tempo         text,
  coaching_note text,
  substitution_group_id uuid REFERENCES public.baseball_lift_exercise_substitutions(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_prescriptions_section_idx
  ON public.baseball_lift_prescriptions (section_id, order_index);

ALTER TABLE public.baseball_lift_prescriptions ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 4. PROGRAM ASSIGNMENT — turns a program day into materialized sessions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_lift_program_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES public.baseball_lift_programs(id) ON DELETE CASCADE,
  lift_day_id uuid NOT NULL REFERENCES public.baseball_lift_days(id) ON DELETE CASCADE,
  assigned_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  assignment_type text NOT NULL DEFAULT 'group'
    CHECK (assignment_type IN ('team','group','player')),
  group_id    uuid REFERENCES public.baseball_strength_groups(id) ON DELETE SET NULL,
  player_id   uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  event_id    uuid REFERENCES public.baseball_events(id) ON DELETE SET NULL,
  scheduled_date  date NOT NULL,
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','cancelled')),
  player_visible_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_program_assignments_team_idx
  ON public.baseball_lift_program_assignments (team_id, scheduled_date);
CREATE INDEX IF NOT EXISTS baseball_lift_program_assignments_event_idx
  ON public.baseball_lift_program_assignments (event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.baseball_lift_program_assignments ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 5. MATERIALIZED SESSIONS — the player surface reads these directly. Created at
--    publish time (no on-the-fly template math — spec L463).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_lift_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_assignment_id uuid REFERENCES public.baseball_lift_program_assignments(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES public.baseball_events(id) ON DELETE SET NULL,
  title         text,
  day_type      text,
  baseball_context text,
  scheduled_date date NOT NULL,
  estimated_minutes integer,
  status        text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','started','completed','missed','excused','modified')),
  started_at    timestamptz,
  completed_at  timestamptz,
  readiness_checkin_id uuid REFERENCES public.baseball_readiness_checkins(id) ON DELETE SET NULL,
  coach_review_status text NOT NULL DEFAULT 'none'
    CHECK (coach_review_status IN ('none','needs_review','reviewed')),
  player_note   text,
  coach_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One materialized session per (assignment, player) — enables idempotent
  -- re-publish via upsert, never delete-then-insert.
  CONSTRAINT uq_baseball_lift_session UNIQUE (program_assignment_id, player_id)
);
CREATE INDEX IF NOT EXISTS baseball_lift_sessions_team_date_idx
  ON public.baseball_lift_sessions (team_id, scheduled_date);
CREATE INDEX IF NOT EXISTS baseball_lift_sessions_player_idx
  ON public.baseball_lift_sessions (player_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS baseball_lift_sessions_status_idx
  ON public.baseball_lift_sessions (team_id, scheduled_date, status);

ALTER TABLE public.baseball_lift_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_session_exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.baseball_lift_sessions(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.baseball_lift_prescriptions(id) ON DELETE SET NULL,
  exercise_id   uuid REFERENCES public.baseball_lift_exercises(id) ON DELETE SET NULL,
  exercise_name_snapshot text NOT NULL,
  section_name_snapshot  text,
  section_type_snapshot  text,
  order_index   integer NOT NULL DEFAULT 0,
  prescribed_sets   integer,
  prescribed_reps   integer,
  prescribed_load   numeric,
  prescribed_load_unit text,
  prescribed_rpe    numeric,
  modified_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  modification_reason  text,
  status        text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','completed','skipped','substituted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_session_exercises_session_idx
  ON public.baseball_lift_session_exercises (session_id, order_index);

ALTER TABLE public.baseball_lift_session_exercises ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_set_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id uuid NOT NULL REFERENCES public.baseball_lift_session_exercises(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  set_number    integer NOT NULL,
  prescribed_reps integer,
  actual_reps   integer,
  prescribed_load numeric,
  actual_load   numeric,
  load_unit     text,
  rpe           numeric,
  rir           numeric,
  velocity      numeric,
  completed_at  timestamptz,
  player_note   text,
  coach_observed boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_lift_set UNIQUE (session_exercise_id, set_number)
);
CREATE INDEX IF NOT EXISTS baseball_lift_set_results_session_exercise_idx
  ON public.baseball_lift_set_results (session_exercise_id);
CREATE INDEX IF NOT EXISTS baseball_lift_set_results_player_idx
  ON public.baseball_lift_set_results (player_id);

ALTER TABLE public.baseball_lift_set_results ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 6. READINESS EXTRAS — soreness maps / bodyweight / availability.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_soreness_maps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id  uuid NOT NULL REFERENCES public.baseball_readiness_checkins(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  body_region text NOT NULL,
  side        text NOT NULL DEFAULT 'both'
    CHECK (side IN ('left','right','both','center')),
  severity    integer NOT NULL DEFAULT 0
    CHECK (severity BETWEEN 0 AND 10),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_soreness_maps_checkin_idx
  ON public.baseball_soreness_maps (checkin_id);
CREATE INDEX IF NOT EXISTS baseball_soreness_maps_player_idx
  ON public.baseball_soreness_maps (player_id);

ALTER TABLE public.baseball_soreness_maps ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_bodyweight_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  entry_date  date NOT NULL,
  weight_lbs  numeric NOT NULL CHECK (weight_lbs > 0 AND weight_lbs < 700),
  source      text NOT NULL DEFAULT 'player'
    CHECK (source IN ('player','coach','import')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baseball_bodyweight_entry UNIQUE (player_id, entry_date)
);
CREATE INDEX IF NOT EXISTS baseball_bodyweight_entries_player_idx
  ON public.baseball_bodyweight_entries (player_id, entry_date DESC);

ALTER TABLE public.baseball_bodyweight_entries ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_availability_statuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','limited','hold','return_to_play','unavailable')),
  reason_category text
    CHECK (reason_category IS NULL OR reason_category IN
      ('soreness','illness','injury_note','academic','travel','coach_decision','other')),
  note        text,
  visibility  text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff','performance_staff','head_coach_only')),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_availability_statuses_player_idx
  ON public.baseball_availability_statuses (player_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS baseball_availability_statuses_team_idx
  ON public.baseball_availability_statuses (team_id, starts_at DESC);

ALTER TABLE public.baseball_availability_statuses ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 7. PROGRESSION — maxes + PRs.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_strength_maxes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.baseball_lift_exercises(id) ON DELETE CASCADE,
  max_type    text NOT NULL DEFAULT 'training_max'
    CHECK (max_type IN ('estimated_1rm','tested_1rm','training_max','velocity_profile')),
  value       numeric NOT NULL,
  unit        text NOT NULL DEFAULT 'lb',
  test_date   date,
  source      text NOT NULL DEFAULT 'coach_test'
    CHECK (source IN ('coach_test','player_entry','import','calculated')),
  confidence  numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_strength_maxes_player_idx
  ON public.baseball_strength_maxes (player_id, exercise_id, max_type);

ALTER TABLE public.baseball_strength_maxes ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_strength_prs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.baseball_lift_exercises(id) ON DELETE CASCADE,
  pr_type     text NOT NULL DEFAULT 'load'
    CHECK (pr_type IN ('load','reps','estimated_1rm','velocity','volume')),
  value       numeric NOT NULL,
  unit        text NOT NULL DEFAULT 'lb',
  achieved_at timestamptz NOT NULL DEFAULT now(),
  lift_session_id uuid REFERENCES public.baseball_lift_sessions(id) ON DELETE SET NULL,
  verified_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_strength_prs_player_idx
  ON public.baseball_strength_prs (player_id, achieved_at DESC);

ALTER TABLE public.baseball_strength_prs ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 8. IMPORTS — lift-specific import runs + staged rows (audited, rollback-able).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_lift_import_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT 'csv'
    CHECK (source IN ('teambuildr','trainheroic','bridge','volt','google_sheets','csv','manual')),
  import_kind text NOT NULL DEFAULT 'lift_result'
    CHECK (import_kind IN ('lift_assignment','lift_result','testing','wellness','attendance')),
  file_name   text,
  file_hash   text,
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  units_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows  integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  unmatched_rows integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged','validated','committed','rolled_back','failed')),
  source_confidence text NOT NULL DEFAULT 'reported'
    CHECK (source_confidence IN ('verified','reported','inferred')),
  committed_at timestamptz,
  rolled_back_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_import_runs_team_idx
  ON public.baseball_lift_import_runs (team_id, created_at DESC);

ALTER TABLE public.baseball_lift_import_runs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.baseball_lift_import_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES public.baseball_lift_import_runs(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  row_number  integer NOT NULL,
  raw_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_player_id uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('matched','unmatched','ambiguous','skipped')),
  validation_error text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_lift_import_rows_run_idx
  ON public.baseball_lift_import_rows (import_run_id);

ALTER TABLE public.baseball_lift_import_rows ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- 9. ROW LEVEL SECURITY
--    Convention: every policy TO authenticated; service_role bypasses by design.
--    Staff writes -> can_manage_lifting; readiness/health-adjacent staff reads ->
--    can_view_readiness (V11 corrected gate). Players own their own rows.
-- ============================================================================

-- ---- helper macro pattern (inlined per table) -----------------------------
-- 9.1 strength groups ------------------------------------------------------
DROP POLICY IF EXISTS bsg_select ON public.baseball_strength_groups;
DROP POLICY IF EXISTS bsg_insert ON public.baseball_strength_groups;
DROP POLICY IF EXISTS bsg_update ON public.baseball_strength_groups;
DROP POLICY IF EXISTS bsg_delete ON public.baseball_strength_groups;
CREATE POLICY bsg_select ON public.baseball_strength_groups FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY bsg_insert ON public.baseball_strength_groups FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bsg_update ON public.baseball_strength_groups FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bsg_delete ON public.baseball_strength_groups FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- 9.2 strength group members ----------------------------------------------
DROP POLICY IF EXISTS bsgm_select ON public.baseball_strength_group_members;
DROP POLICY IF EXISTS bsgm_insert ON public.baseball_strength_group_members;
DROP POLICY IF EXISTS bsgm_update ON public.baseball_strength_group_members;
DROP POLICY IF EXISTS bsgm_delete ON public.baseball_strength_group_members;
-- A staff member of the group's team reads members; a player may read their OWN
-- membership rows (so the player UI can show their group), never others'.
CREATE POLICY bsgm_select ON public.baseball_strength_group_members FOR SELECT TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR EXISTS (SELECT 1 FROM public.baseball_strength_groups g
               WHERE g.id = group_id AND public.is_baseball_team_staff(g.team_id))
  );
CREATE POLICY bsgm_insert ON public.baseball_strength_group_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_strength_groups g
               WHERE g.id = group_id
                 AND public.has_baseball_staff_capability(g.team_id,'can_manage_lifting')));
CREATE POLICY bsgm_update ON public.baseball_strength_group_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_strength_groups g
               WHERE g.id = group_id
                 AND public.has_baseball_staff_capability(g.team_id,'can_manage_lifting')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_strength_groups g
               WHERE g.id = group_id
                 AND public.has_baseball_staff_capability(g.team_id,'can_manage_lifting')));
CREATE POLICY bsgm_delete ON public.baseball_strength_group_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_strength_groups g
               WHERE g.id = group_id
                 AND public.has_baseball_staff_capability(g.team_id,'can_manage_lifting')));

-- 9.3 exercise library + substitutions ------------------------------------
DROP POLICY IF EXISTS ble_select ON public.baseball_lift_exercises;
DROP POLICY IF EXISTS ble_insert ON public.baseball_lift_exercises;
DROP POLICY IF EXISTS ble_update ON public.baseball_lift_exercises;
DROP POLICY IF EXISTS ble_delete ON public.baseball_lift_exercises;
CREATE POLICY ble_select ON public.baseball_lift_exercises FOR SELECT TO authenticated
  USING (
    (is_global = true AND EXISTS (SELECT 1 FROM public.baseball_team_coach_staff tcs
                                  WHERE tcs.coach_id = public.get_my_coach_id()))
    OR (team_id IS NOT NULL AND public.is_baseball_team_staff(team_id))
    OR (team_id IS NOT NULL AND public.is_baseball_team_member(team_id))
  );
CREATE POLICY ble_insert ON public.baseball_lift_exercises FOR INSERT TO authenticated
  WITH CHECK (team_id IS NOT NULL AND is_global = false
              AND public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY ble_update ON public.baseball_lift_exercises FOR UPDATE TO authenticated
  USING (team_id IS NOT NULL AND public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (team_id IS NOT NULL AND public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY ble_delete ON public.baseball_lift_exercises FOR DELETE TO authenticated
  USING (team_id IS NOT NULL AND public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

DROP POLICY IF EXISTS bles_select ON public.baseball_lift_exercise_substitutions;
DROP POLICY IF EXISTS bles_insert ON public.baseball_lift_exercise_substitutions;
DROP POLICY IF EXISTS bles_update ON public.baseball_lift_exercise_substitutions;
DROP POLICY IF EXISTS bles_delete ON public.baseball_lift_exercise_substitutions;
CREATE POLICY bles_select ON public.baseball_lift_exercise_substitutions FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY bles_insert ON public.baseball_lift_exercise_substitutions FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bles_update ON public.baseball_lift_exercise_substitutions FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bles_delete ON public.baseball_lift_exercise_substitutions FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- 9.4 program model (programs/weeks/days/sections/prescriptions) -----------
-- Programs are staff-authored. assigned_players visibility is realized through
-- the materialized SESSIONS, not the template — players never read raw programs.
DROP POLICY IF EXISTS blp_select ON public.baseball_lift_programs;
DROP POLICY IF EXISTS blp_insert ON public.baseball_lift_programs;
DROP POLICY IF EXISTS blp_update ON public.baseball_lift_programs;
DROP POLICY IF EXISTS blp_delete ON public.baseball_lift_programs;
CREATE POLICY blp_select ON public.baseball_lift_programs FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY blp_insert ON public.baseball_lift_programs FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blp_update ON public.baseball_lift_programs FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blp_delete ON public.baseball_lift_programs FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- weeks/days/sections/prescriptions inherit gating through their program's team.
DROP POLICY IF EXISTS blw_all ON public.baseball_lift_weeks;
CREATE POLICY blw_all ON public.baseball_lift_weeks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_programs p
                 WHERE p.id = program_id AND public.is_baseball_team_staff(p.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_programs p
                 WHERE p.id = program_id
                   AND public.has_baseball_staff_capability(p.team_id,'can_manage_lifting')));

DROP POLICY IF EXISTS bld_all ON public.baseball_lift_days;
CREATE POLICY bld_all ON public.baseball_lift_days FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_weeks w
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE w.id = week_id AND public.is_baseball_team_staff(p.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_weeks w
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE w.id = week_id
                   AND public.has_baseball_staff_capability(p.team_id,'can_manage_lifting')));

DROP POLICY IF EXISTS blsec_all ON public.baseball_lift_sections;
CREATE POLICY blsec_all ON public.baseball_lift_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_days d
                 JOIN public.baseball_lift_weeks w ON w.id = d.week_id
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE d.id = lift_day_id AND public.is_baseball_team_staff(p.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_days d
                 JOIN public.baseball_lift_weeks w ON w.id = d.week_id
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE d.id = lift_day_id
                   AND public.has_baseball_staff_capability(p.team_id,'can_manage_lifting')));

DROP POLICY IF EXISTS blpr_all ON public.baseball_lift_prescriptions;
CREATE POLICY blpr_all ON public.baseball_lift_prescriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_sections s
                 JOIN public.baseball_lift_days d ON d.id = s.lift_day_id
                 JOIN public.baseball_lift_weeks w ON w.id = d.week_id
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE s.id = section_id AND public.is_baseball_team_staff(p.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_sections s
                 JOIN public.baseball_lift_days d ON d.id = s.lift_day_id
                 JOIN public.baseball_lift_weeks w ON w.id = d.week_id
                 JOIN public.baseball_lift_programs p ON p.id = w.program_id
                 WHERE s.id = section_id
                   AND public.has_baseball_staff_capability(p.team_id,'can_manage_lifting')));

-- 9.5 program assignments --------------------------------------------------
DROP POLICY IF EXISTS blpa_select ON public.baseball_lift_program_assignments;
DROP POLICY IF EXISTS blpa_insert ON public.baseball_lift_program_assignments;
DROP POLICY IF EXISTS blpa_update ON public.baseball_lift_program_assignments;
DROP POLICY IF EXISTS blpa_delete ON public.baseball_lift_program_assignments;
CREATE POLICY blpa_select ON public.baseball_lift_program_assignments FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY blpa_insert ON public.baseball_lift_program_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blpa_update ON public.baseball_lift_program_assignments FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blpa_delete ON public.baseball_lift_program_assignments FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- 9.6 materialized sessions -----------------------------------------------
-- A player reads/updates only their OWN session; staff read/manage scoped via
-- can_manage_baseball_lift_group. NO broad team-member read path (private loads).
DROP POLICY IF EXISTS blsess_select ON public.baseball_lift_sessions;
DROP POLICY IF EXISTS blsess_insert ON public.baseball_lift_sessions;
DROP POLICY IF EXISTS blsess_update ON public.baseball_lift_sessions;
DROP POLICY IF EXISTS blsess_delete ON public.baseball_lift_sessions;
CREATE POLICY blsess_select ON public.baseball_lift_sessions FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
-- Only managing staff materialize sessions (publish). Players never self-insert.
CREATE POLICY blsess_insert ON public.baseball_lift_sessions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));
-- Player can advance their own session lifecycle (start/complete); staff may edit.
CREATE POLICY blsess_update ON public.baseball_lift_sessions FOR UPDATE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id))
  WITH CHECK (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY blsess_delete ON public.baseball_lift_sessions FOR DELETE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id));

-- 9.7 session exercises ----------------------------------------------------
DROP POLICY IF EXISTS blse_select ON public.baseball_lift_session_exercises;
DROP POLICY IF EXISTS blse_insert ON public.baseball_lift_session_exercises;
DROP POLICY IF EXISTS blse_update ON public.baseball_lift_session_exercises;
DROP POLICY IF EXISTS blse_delete ON public.baseball_lift_session_exercises;
CREATE POLICY blse_select ON public.baseball_lift_session_exercises FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_sessions s
                 WHERE s.id = session_id
                   AND (s.player_id = public.get_my_baseball_player_id()
                        OR public.can_manage_baseball_lift_group(s.team_id, s.player_id))));
CREATE POLICY blse_insert ON public.baseball_lift_session_exercises FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_sessions s
                 WHERE s.id = session_id
                   AND public.can_manage_baseball_lift_group(s.team_id, s.player_id)));
CREATE POLICY blse_update ON public.baseball_lift_session_exercises FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_sessions s
                 WHERE s.id = session_id
                   AND (s.player_id = public.get_my_baseball_player_id()
                        OR public.can_manage_baseball_lift_group(s.team_id, s.player_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.baseball_lift_sessions s
                 WHERE s.id = session_id
                   AND (s.player_id = public.get_my_baseball_player_id()
                        OR public.can_manage_baseball_lift_group(s.team_id, s.player_id))));
CREATE POLICY blse_delete ON public.baseball_lift_session_exercises FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.baseball_lift_sessions s
                 WHERE s.id = session_id
                   AND public.can_manage_baseball_lift_group(s.team_id, s.player_id)));

-- 9.8 set results — player owns OWN; staff scoped; no peer read --------------
DROP POLICY IF EXISTS blsr_select ON public.baseball_lift_set_results;
DROP POLICY IF EXISTS blsr_insert ON public.baseball_lift_set_results;
DROP POLICY IF EXISTS blsr_update ON public.baseball_lift_set_results;
DROP POLICY IF EXISTS blsr_delete ON public.baseball_lift_set_results;
CREATE POLICY blsr_select ON public.baseball_lift_set_results FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY blsr_insert ON public.baseball_lift_set_results FOR INSERT TO authenticated
  WITH CHECK ((player_id = public.get_my_baseball_player_id()
               AND public.is_baseball_team_member(team_id))
              OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY blsr_update ON public.baseball_lift_set_results FOR UPDATE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id))
  WITH CHECK (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY blsr_delete ON public.baseball_lift_set_results FOR DELETE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));

-- 9.9 soreness maps — player owns; staff need can_view_readiness -------------
DROP POLICY IF EXISTS bsm_select ON public.baseball_soreness_maps;
DROP POLICY IF EXISTS bsm_insert ON public.baseball_soreness_maps;
DROP POLICY IF EXISTS bsm_update ON public.baseball_soreness_maps;
DROP POLICY IF EXISTS bsm_delete ON public.baseball_soreness_maps;
CREATE POLICY bsm_select ON public.baseball_soreness_maps FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR (public.has_baseball_staff_capability(team_id,'can_view_readiness')
             AND public.can_view_baseball_player(team_id, player_id)));
CREATE POLICY bsm_insert ON public.baseball_soreness_maps FOR INSERT TO authenticated
  WITH CHECK (player_id = public.get_my_baseball_player_id()
              AND public.is_baseball_team_member(team_id));
CREATE POLICY bsm_update ON public.baseball_soreness_maps FOR UPDATE TO authenticated
  USING (player_id = public.get_my_baseball_player_id())
  WITH CHECK (player_id = public.get_my_baseball_player_id());
CREATE POLICY bsm_delete ON public.baseball_soreness_maps FOR DELETE TO authenticated
  USING (player_id = public.get_my_baseball_player_id());

-- 9.10 bodyweight — player owns; staff need can_view_readiness ---------------
DROP POLICY IF EXISTS bbw_select ON public.baseball_bodyweight_entries;
DROP POLICY IF EXISTS bbw_insert ON public.baseball_bodyweight_entries;
DROP POLICY IF EXISTS bbw_update ON public.baseball_bodyweight_entries;
DROP POLICY IF EXISTS bbw_delete ON public.baseball_bodyweight_entries;
CREATE POLICY bbw_select ON public.baseball_bodyweight_entries FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR (public.has_baseball_staff_capability(team_id,'can_view_readiness')
             AND public.can_view_baseball_player(team_id, player_id)));
-- Player self-logs; a managing coach may also enter (source='coach').
CREATE POLICY bbw_insert ON public.baseball_bodyweight_entries FOR INSERT TO authenticated
  WITH CHECK ((player_id = public.get_my_baseball_player_id()
               AND public.is_baseball_team_member(team_id))
              OR public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bbw_update ON public.baseball_bodyweight_entries FOR UPDATE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (player_id = public.get_my_baseball_player_id()
         OR public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bbw_delete ON public.baseball_bodyweight_entries FOR DELETE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- 9.11 availability — staff-authored; owning player may read theirs ----------
DROP POLICY IF EXISTS bas_select ON public.baseball_availability_statuses;
DROP POLICY IF EXISTS bas_insert ON public.baseball_availability_statuses;
DROP POLICY IF EXISTS bas_update ON public.baseball_availability_statuses;
DROP POLICY IF EXISTS bas_delete ON public.baseball_availability_statuses;
CREATE POLICY bas_select ON public.baseball_availability_statuses FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR (public.has_baseball_staff_capability(team_id,'can_view_readiness')
             AND public.can_view_baseball_player(team_id, player_id)));
CREATE POLICY bas_insert ON public.baseball_availability_statuses FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bas_update ON public.baseball_availability_statuses FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY bas_delete ON public.baseball_availability_statuses FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- 9.12 maxes — player reads OWN; staff scoped --------------------------------
DROP POLICY IF EXISTS bmax_select ON public.baseball_strength_maxes;
DROP POLICY IF EXISTS bmax_insert ON public.baseball_strength_maxes;
DROP POLICY IF EXISTS bmax_update ON public.baseball_strength_maxes;
DROP POLICY IF EXISTS bmax_delete ON public.baseball_strength_maxes;
CREATE POLICY bmax_select ON public.baseball_strength_maxes FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY bmax_insert ON public.baseball_strength_maxes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY bmax_update ON public.baseball_strength_maxes FOR UPDATE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id))
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY bmax_delete ON public.baseball_strength_maxes FOR DELETE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id));

-- 9.13 PRs — player reads OWN; staff scoped; PRs may be system-written --------
DROP POLICY IF EXISTS bpr_select ON public.baseball_strength_prs;
DROP POLICY IF EXISTS bpr_insert ON public.baseball_strength_prs;
DROP POLICY IF EXISTS bpr_update ON public.baseball_strength_prs;
DROP POLICY IF EXISTS bpr_delete ON public.baseball_strength_prs;
CREATE POLICY bpr_select ON public.baseball_strength_prs FOR SELECT TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));
-- A player can record their own PR (from a logged set); staff may verify/add.
CREATE POLICY bpr_insert ON public.baseball_strength_prs FOR INSERT TO authenticated
  WITH CHECK ((player_id = public.get_my_baseball_player_id()
               AND public.is_baseball_team_member(team_id))
              OR public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY bpr_update ON public.baseball_strength_prs FOR UPDATE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id))
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));
CREATE POLICY bpr_delete ON public.baseball_strength_prs FOR DELETE TO authenticated
  USING (player_id = public.get_my_baseball_player_id()
         OR public.can_manage_baseball_lift_group(team_id, player_id));

-- 9.14 import runs + rows — staff with can_manage_lifting only ---------------
DROP POLICY IF EXISTS blir_select ON public.baseball_lift_import_runs;
DROP POLICY IF EXISTS blir_insert ON public.baseball_lift_import_runs;
DROP POLICY IF EXISTS blir_update ON public.baseball_lift_import_runs;
DROP POLICY IF EXISTS blir_delete ON public.baseball_lift_import_runs;
CREATE POLICY blir_select ON public.baseball_lift_import_runs FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY blir_insert ON public.baseball_lift_import_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blir_update ON public.baseball_lift_import_runs FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));
CREATE POLICY blir_delete ON public.baseball_lift_import_runs FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

DROP POLICY IF EXISTS blirw_all ON public.baseball_lift_import_rows;
CREATE POLICY blirw_all ON public.baseball_lift_import_rows FOR ALL TO authenticated
  USING (public.is_baseball_team_staff(team_id))
  WITH CHECK (public.has_baseball_staff_capability(team_id,'can_manage_lifting'));

-- ============================================================================
-- 10. GRANTS — authenticated (RLS-gated) + service_role; NEVER anon.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'baseball_strength_groups','baseball_strength_group_members',
    'baseball_lift_exercises','baseball_lift_exercise_substitutions',
    'baseball_lift_programs','baseball_lift_weeks','baseball_lift_days',
    'baseball_lift_sections','baseball_lift_prescriptions',
    'baseball_lift_program_assignments','baseball_lift_sessions',
    'baseball_lift_session_exercises','baseball_lift_set_results',
    'baseball_soreness_maps','baseball_bodyweight_entries',
    'baseball_availability_statuses','baseball_strength_maxes',
    'baseball_strength_prs','baseball_lift_import_runs','baseball_lift_import_rows'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
