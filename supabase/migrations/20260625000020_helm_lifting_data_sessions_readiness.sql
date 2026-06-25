-- =============================================================================
-- Helm Lifting Lab — Sessions, Readiness & Progression
-- Migration: 20260625000020_helm_lifting_data_sessions_readiness.sql
--
-- Spec: docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md §1.5 (data tables)
--
-- Creates:
--   * helm_lifting_program_assignments   (publish: program day → materialized sessions)
--   * helm_lifting_sessions              (the athlete read surface)
--   * helm_lifting_session_exercises
--   * helm_lifting_set_results
--   * helm_lifting_readiness_checkins    (full V11 field set)
--   * helm_lifting_soreness_maps
--   * helm_lifting_bodyweight_entries
--   * helm_lifting_availability_statuses
--   * helm_lifting_maxes
--   * helm_lifting_prs
--   * helm_lifting_import_runs
--   * helm_lifting_import_rows
--
-- Each table: organization_id + sport + soft athlete/team refs + legacy_baseball_id
--   (nullable, partial-unique) + RLS + REVOKE anon.
--
-- GOLF-SAFETY: purely additive; ZERO ALTER/DROP of any golf_* or baseball_* object.
-- =============================================================================

-- ===========================================================================
-- 1. PROGRAM ASSIGNMENTS — turns a program day into materialized sessions
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_program_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid, -- SOFT ref: sport team
  program_id             uuid NOT NULL REFERENCES public.helm_lifting_programs(id) ON DELETE CASCADE,
  lift_day_id            uuid NOT NULL REFERENCES public.helm_lifting_days(id) ON DELETE CASCADE,
  assigned_by_coach_id   uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  assignment_type        text NOT NULL DEFAULT 'group'
    CHECK (assignment_type IN ('team', 'group', 'player')),
  group_id               uuid REFERENCES public.helm_lifting_groups(id) ON DELETE SET NULL,
  athlete_id             uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE SET NULL,
  scheduled_date         date NOT NULL,
  scheduled_start        timestamptz,
  scheduled_end          timestamptz,
  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled')),
  player_visible_at      timestamptz,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_program_assignments_org_date_idx
  ON public.helm_lifting_program_assignments (organization_id, sport, scheduled_date);
CREATE INDEX IF NOT EXISTS helm_lifting_program_assignments_program_idx
  ON public.helm_lifting_program_assignments (program_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_program_assignments_legacy_uq
  ON public.helm_lifting_program_assignments (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 2. MATERIALIZED SESSIONS — the athlete surface reads these directly.
--    Created at publish time (no on-the-fly template math — V11 spec L463).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_assignment_id     uuid REFERENCES public.helm_lifting_program_assignments(id) ON DELETE CASCADE,
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                     text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                   uuid, -- SOFT ref
  athlete_id                uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  title                     text,
  day_type                  text,
  sport_context             text, -- was baseball_context
  scheduled_date            date NOT NULL,
  estimated_minutes         integer,
  status                    text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'started', 'completed', 'missed', 'excused', 'modified')),
  started_at                timestamptz,
  completed_at              timestamptz,
  readiness_checkin_id      uuid, -- SOFT ref: helm_lifting_readiness_checkins.id (set after checkin exists)
  coach_review_status       text NOT NULL DEFAULT 'none'
    CHECK (coach_review_status IN ('none', 'needs_review', 'reviewed')),
  player_note               text,
  coach_note                text,
  legacy_baseball_id        uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- Idempotent re-publish via upsert; never delete-then-insert
  CONSTRAINT uq_helm_lifting_session UNIQUE (program_assignment_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS helm_lifting_sessions_org_date_idx
  ON public.helm_lifting_sessions (organization_id, sport, scheduled_date);
CREATE INDEX IF NOT EXISTS helm_lifting_sessions_athlete_idx
  ON public.helm_lifting_sessions (athlete_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS helm_lifting_sessions_status_idx
  ON public.helm_lifting_sessions (organization_id, scheduled_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_sessions_legacy_uq
  ON public.helm_lifting_sessions (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 2b. Session exercises
CREATE TABLE IF NOT EXISTS public.helm_lifting_session_exercises (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                uuid NOT NULL REFERENCES public.helm_lifting_sessions(id) ON DELETE CASCADE,
  prescription_id           uuid REFERENCES public.helm_lifting_prescriptions(id) ON DELETE SET NULL,
  exercise_id               uuid REFERENCES public.helm_lifting_exercises(id) ON DELETE SET NULL,
  exercise_name_snapshot    text NOT NULL,
  section_name_snapshot     text,
  section_type_snapshot     text,
  order_index               integer NOT NULL DEFAULT 0,
  prescribed_sets           integer,
  prescribed_reps           integer,
  prescribed_load           numeric,
  prescribed_load_unit      text,
  prescribed_rpe            numeric,
  modified_by_coach_id      uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  modification_reason       text,
  status                    text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'completed', 'skipped', 'substituted')),
  legacy_baseball_id        uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_session_exercises_session_idx
  ON public.helm_lifting_session_exercises (session_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_session_exercises_legacy_uq
  ON public.helm_lifting_session_exercises (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 2c. Set results
CREATE TABLE IF NOT EXISTS public.helm_lifting_set_results (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id       uuid NOT NULL REFERENCES public.helm_lifting_session_exercises(id) ON DELETE CASCADE,
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                     text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id                uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  set_number                integer NOT NULL,
  prescribed_reps           integer,
  actual_reps               integer,
  prescribed_load           numeric,
  actual_load               numeric,
  load_unit                 text,
  rpe                       numeric,
  rir                       numeric,
  velocity                  numeric,
  completed_at              timestamptz,
  player_note               text,
  coach_observed            boolean NOT NULL DEFAULT false,
  legacy_baseball_id        uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_set UNIQUE (session_exercise_id, set_number)
);
CREATE INDEX IF NOT EXISTS helm_lifting_set_results_session_exercise_idx
  ON public.helm_lifting_set_results (session_exercise_id);
CREATE INDEX IF NOT EXISTS helm_lifting_set_results_athlete_idx
  ON public.helm_lifting_set_results (athlete_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_set_results_legacy_uq
  ON public.helm_lifting_set_results (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 3. READINESS FAMILY
-- ===========================================================================

-- 3a. Readiness check-ins (full V11 field set)
CREATE TABLE IF NOT EXISTS public.helm_lifting_readiness_checkins (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  checkin_date           date NOT NULL,
  sleep_quality          integer CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5),
  energy_level           integer CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 5),
  soreness_overall       integer CHECK (soreness_overall IS NULL OR soreness_overall BETWEEN 0 AND 10),
  stress_level           integer CHECK (stress_level IS NULL OR stress_level BETWEEN 1 AND 5),
  lower_body_status      integer CHECK (lower_body_status IS NULL OR lower_body_status BETWEEN 1 AND 5),
  illness_flag           boolean NOT NULL DEFAULT false,
  mood                   integer CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  notes                  text,
  readiness_score        numeric,
  readiness_band         text
    CHECK (readiness_band IS NULL OR readiness_band IN
      ('green', 'yellow', 'orange_lower', 'orange_upper', 'red', 'blue')),
  lift_session_id        uuid, -- SOFT ref: helm_lifting_sessions.id
  visibility             text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff', 'performance_staff', 'head_coach_only')),
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_checkin UNIQUE (athlete_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS helm_lifting_readiness_checkins_athlete_idx
  ON public.helm_lifting_readiness_checkins (athlete_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS helm_lifting_readiness_checkins_org_idx
  ON public.helm_lifting_readiness_checkins (organization_id, sport, checkin_date);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_readiness_checkins_legacy_uq
  ON public.helm_lifting_readiness_checkins (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 3b. Soreness maps
CREATE TABLE IF NOT EXISTS public.helm_lifting_soreness_maps (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id             uuid NOT NULL REFERENCES public.helm_lifting_readiness_checkins(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  body_region            text NOT NULL,
  side                   text NOT NULL DEFAULT 'both'
    CHECK (side IN ('left', 'right', 'both', 'center')),
  severity               integer NOT NULL DEFAULT 0
    CHECK (severity BETWEEN 0 AND 10),
  note                   text,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_soreness_maps_checkin_idx
  ON public.helm_lifting_soreness_maps (checkin_id);
CREATE INDEX IF NOT EXISTS helm_lifting_soreness_maps_athlete_idx
  ON public.helm_lifting_soreness_maps (athlete_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_soreness_maps_legacy_uq
  ON public.helm_lifting_soreness_maps (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 3c. Bodyweight entries
CREATE TABLE IF NOT EXISTS public.helm_lifting_bodyweight_entries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  entry_date             date NOT NULL,
  weight_lbs             numeric NOT NULL CHECK (weight_lbs > 0 AND weight_lbs < 700),
  source                 text NOT NULL DEFAULT 'player'
    CHECK (source IN ('player', 'coach', 'import')),
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_bodyweight UNIQUE (athlete_id, entry_date)
);
CREATE INDEX IF NOT EXISTS helm_lifting_bodyweight_entries_athlete_idx
  ON public.helm_lifting_bodyweight_entries (athlete_id, entry_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_bodyweight_entries_legacy_uq
  ON public.helm_lifting_bodyweight_entries (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 3d. Availability statuses (staff-authored)
CREATE TABLE IF NOT EXISTS public.helm_lifting_availability_statuses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'limited', 'hold', 'return_to_play', 'unavailable')),
  reason_category        text
    CHECK (reason_category IS NULL OR reason_category IN
      ('soreness', 'illness', 'injury_note', 'academic', 'travel', 'coach_decision', 'other')),
  note                   text,
  visibility             text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff', 'performance_staff', 'head_coach_only')),
  starts_at              timestamptz NOT NULL DEFAULT now(),
  ends_at                timestamptz,
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_availability_statuses_athlete_idx
  ON public.helm_lifting_availability_statuses (athlete_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS helm_lifting_availability_statuses_org_idx
  ON public.helm_lifting_availability_statuses (organization_id, sport, starts_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_availability_statuses_legacy_uq
  ON public.helm_lifting_availability_statuses (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 4. PROGRESSION — maxes + PRs
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_maxes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  exercise_id            uuid NOT NULL REFERENCES public.helm_lifting_exercises(id) ON DELETE CASCADE,
  max_type               text NOT NULL DEFAULT 'training_max'
    CHECK (max_type IN ('estimated_1rm', 'tested_1rm', 'training_max', 'velocity_profile')),
  value                  numeric NOT NULL,
  unit                   text NOT NULL DEFAULT 'lb',
  test_date              date,
  source                 text NOT NULL DEFAULT 'coach_test'
    CHECK (source IN ('coach_test', 'player_entry', 'import', 'calculated')),
  confidence             numeric,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_maxes_athlete_idx
  ON public.helm_lifting_maxes (athlete_id, exercise_id, max_type);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_maxes_legacy_uq
  ON public.helm_lifting_maxes (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.helm_lifting_prs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  exercise_id            uuid NOT NULL REFERENCES public.helm_lifting_exercises(id) ON DELETE CASCADE,
  pr_type                text NOT NULL DEFAULT 'load'
    CHECK (pr_type IN ('load', 'reps', 'estimated_1rm', 'velocity', 'volume')),
  value                  numeric NOT NULL,
  unit                   text NOT NULL DEFAULT 'lb',
  achieved_at            timestamptz NOT NULL DEFAULT now(),
  lift_session_id        uuid REFERENCES public.helm_lifting_sessions(id) ON DELETE SET NULL,
  verified_by_coach_id   uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_prs_athlete_idx
  ON public.helm_lifting_prs (athlete_id, achieved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_prs_legacy_uq
  ON public.helm_lifting_prs (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 5. IMPORTS — lift-specific import runs + staged rows
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_import_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  source                 text NOT NULL DEFAULT 'csv'
    CHECK (source IN ('teambuildr', 'trainheroic', 'bridge', 'volt', 'google_sheets', 'csv', 'manual')),
  import_kind            text NOT NULL DEFAULT 'lift_result'
    CHECK (import_kind IN ('lift_assignment', 'lift_result', 'testing', 'wellness', 'attendance')),
  file_name              text,
  file_hash              text,
  mapping_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  units_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows             integer NOT NULL DEFAULT 0,
  matched_rows           integer NOT NULL DEFAULT 0,
  unmatched_rows         integer NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'validated', 'committed', 'rolled_back', 'failed')),
  source_confidence      text NOT NULL DEFAULT 'reported'
    CHECK (source_confidence IN ('verified', 'reported', 'inferred')),
  committed_at           timestamptz,
  rolled_back_at         timestamptz,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_import_runs_org_idx
  ON public.helm_lifting_import_runs (organization_id, sport, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_import_runs_legacy_uq
  ON public.helm_lifting_import_runs (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.helm_lifting_import_rows (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id          uuid NOT NULL REFERENCES public.helm_lifting_import_runs(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  row_number             integer NOT NULL,
  raw_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_athlete_id     uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE SET NULL,
  match_status           text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('matched', 'unmatched', 'ambiguous', 'skipped')),
  validation_error       text,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_import_rows_run_idx
  ON public.helm_lifting_import_rows (import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_import_rows_legacy_uq
  ON public.helm_lifting_import_rows (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 6. ROW LEVEL SECURITY
-- ===========================================================================

-- 6.1 Program assignments — staff read/write; no athlete direct read
ALTER TABLE public.helm_lifting_program_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlpa_select ON public.helm_lifting_program_assignments;
DROP POLICY IF EXISTS hlpa_insert ON public.helm_lifting_program_assignments;
DROP POLICY IF EXISTS hlpa_update ON public.helm_lifting_program_assignments;
DROP POLICY IF EXISTS hlpa_delete ON public.helm_lifting_program_assignments;

CREATE POLICY hlpa_select ON public.helm_lifting_program_assignments FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hlpa_insert ON public.helm_lifting_program_assignments FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlpa_update ON public.helm_lifting_program_assignments FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlpa_delete ON public.helm_lifting_program_assignments FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 6.2 Sessions — athlete reads OWN; staff reads/manages all
ALTER TABLE public.helm_lifting_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlsess_select ON public.helm_lifting_sessions;
DROP POLICY IF EXISTS hlsess_insert ON public.helm_lifting_sessions;
DROP POLICY IF EXISTS hlsess_update ON public.helm_lifting_sessions;
DROP POLICY IF EXISTS hlsess_delete ON public.helm_lifting_sessions;

CREATE POLICY hlsess_select ON public.helm_lifting_sessions FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

-- Only staff materialize (publish) sessions
CREATE POLICY hlsess_insert ON public.helm_lifting_sessions FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

-- Athlete may advance their OWN lifecycle; staff may edit any
CREATE POLICY hlsess_update ON public.helm_lifting_sessions FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlsess_delete ON public.helm_lifting_sessions FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 6.3 Session exercises — athlete OWN; staff
ALTER TABLE public.helm_lifting_session_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlse_select ON public.helm_lifting_session_exercises;
DROP POLICY IF EXISTS hlse_insert ON public.helm_lifting_session_exercises;
DROP POLICY IF EXISTS hlse_update ON public.helm_lifting_session_exercises;
DROP POLICY IF EXISTS hlse_delete ON public.helm_lifting_session_exercises;

CREATE POLICY hlse_select ON public.helm_lifting_session_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sessions s
    WHERE s.id = session_id
      AND (
        public.helm_lifting_is_my_athlete(s.athlete_id)
        OR public.helm_lifting_can_view_org(s.organization_id, s.sport)
      )
  ));

CREATE POLICY hlse_insert ON public.helm_lifting_session_exercises FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_sessions s
    WHERE s.id = session_id
      AND public.helm_lifting_can_edit_org(s.organization_id)
  ));

CREATE POLICY hlse_update ON public.helm_lifting_session_exercises FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sessions s
    WHERE s.id = session_id
      AND (
        public.helm_lifting_is_my_athlete(s.athlete_id)
        OR public.helm_lifting_can_edit_org(s.organization_id)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_sessions s
    WHERE s.id = session_id
      AND (
        public.helm_lifting_is_my_athlete(s.athlete_id)
        OR public.helm_lifting_can_edit_org(s.organization_id)
      )
  ));

CREATE POLICY hlse_delete ON public.helm_lifting_session_exercises FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sessions s
    WHERE s.id = session_id
      AND public.helm_lifting_can_edit_org(s.organization_id)
  ));

-- 6.4 Set results — athlete OWN; staff
ALTER TABLE public.helm_lifting_set_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlsr_select ON public.helm_lifting_set_results;
DROP POLICY IF EXISTS hlsr_insert ON public.helm_lifting_set_results;
DROP POLICY IF EXISTS hlsr_update ON public.helm_lifting_set_results;
DROP POLICY IF EXISTS hlsr_delete ON public.helm_lifting_set_results;

CREATE POLICY hlsr_select ON public.helm_lifting_set_results FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlsr_insert ON public.helm_lifting_set_results FOR INSERT TO authenticated
  WITH CHECK (
    (public.helm_lifting_is_my_athlete(athlete_id))
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlsr_update ON public.helm_lifting_set_results FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlsr_delete ON public.helm_lifting_set_results FOR DELETE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- 6.5 Readiness checkins — athlete OWN; staff with can_view_org
ALTER TABLE public.helm_lifting_readiness_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlrc_select ON public.helm_lifting_readiness_checkins;
DROP POLICY IF EXISTS hlrc_insert ON public.helm_lifting_readiness_checkins;
DROP POLICY IF EXISTS hlrc_update ON public.helm_lifting_readiness_checkins;
DROP POLICY IF EXISTS hlrc_delete ON public.helm_lifting_readiness_checkins;

CREATE POLICY hlrc_select ON public.helm_lifting_readiness_checkins FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlrc_insert ON public.helm_lifting_readiness_checkins FOR INSERT TO authenticated
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlrc_update ON public.helm_lifting_readiness_checkins FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlrc_delete ON public.helm_lifting_readiness_checkins FOR DELETE TO authenticated
  USING (public.helm_lifting_is_my_athlete(athlete_id));

-- 6.6 Soreness maps — athlete OWN (insert/delete); staff view
ALTER TABLE public.helm_lifting_soreness_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlsm_select ON public.helm_lifting_soreness_maps;
DROP POLICY IF EXISTS hlsm_insert ON public.helm_lifting_soreness_maps;
DROP POLICY IF EXISTS hlsm_update ON public.helm_lifting_soreness_maps;
DROP POLICY IF EXISTS hlsm_delete ON public.helm_lifting_soreness_maps;

CREATE POLICY hlsm_select ON public.helm_lifting_soreness_maps FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlsm_insert ON public.helm_lifting_soreness_maps FOR INSERT TO authenticated
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlsm_update ON public.helm_lifting_soreness_maps FOR UPDATE TO authenticated
  USING (public.helm_lifting_is_my_athlete(athlete_id))
  WITH CHECK (public.helm_lifting_is_my_athlete(athlete_id));

CREATE POLICY hlsm_delete ON public.helm_lifting_soreness_maps FOR DELETE TO authenticated
  USING (public.helm_lifting_is_my_athlete(athlete_id));

-- 6.7 Bodyweight entries — athlete OWN; staff view + edit
ALTER TABLE public.helm_lifting_bodyweight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlbw_select ON public.helm_lifting_bodyweight_entries;
DROP POLICY IF EXISTS hlbw_insert ON public.helm_lifting_bodyweight_entries;
DROP POLICY IF EXISTS hlbw_update ON public.helm_lifting_bodyweight_entries;
DROP POLICY IF EXISTS hlbw_delete ON public.helm_lifting_bodyweight_entries;

CREATE POLICY hlbw_select ON public.helm_lifting_bodyweight_entries FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlbw_insert ON public.helm_lifting_bodyweight_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlbw_update ON public.helm_lifting_bodyweight_entries FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlbw_delete ON public.helm_lifting_bodyweight_entries FOR DELETE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- 6.8 Availability statuses — staff-authored; athlete may read OWN
ALTER TABLE public.helm_lifting_availability_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlas_select ON public.helm_lifting_availability_statuses;
DROP POLICY IF EXISTS hlas_insert ON public.helm_lifting_availability_statuses;
DROP POLICY IF EXISTS hlas_update ON public.helm_lifting_availability_statuses;
DROP POLICY IF EXISTS hlas_delete ON public.helm_lifting_availability_statuses;

CREATE POLICY hlas_select ON public.helm_lifting_availability_statuses FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlas_insert ON public.helm_lifting_availability_statuses FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlas_update ON public.helm_lifting_availability_statuses FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlas_delete ON public.helm_lifting_availability_statuses FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 6.9 Maxes — athlete reads OWN; staff
ALTER TABLE public.helm_lifting_maxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlmax_select ON public.helm_lifting_maxes;
DROP POLICY IF EXISTS hlmax_insert ON public.helm_lifting_maxes;
DROP POLICY IF EXISTS hlmax_update ON public.helm_lifting_maxes;
DROP POLICY IF EXISTS hlmax_delete ON public.helm_lifting_maxes;

CREATE POLICY hlmax_select ON public.helm_lifting_maxes FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlmax_insert ON public.helm_lifting_maxes FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlmax_update ON public.helm_lifting_maxes FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlmax_delete ON public.helm_lifting_maxes FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 6.10 PRs — athlete reads OWN; athlete may self-claim; staff manages
ALTER TABLE public.helm_lifting_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlpr_select ON public.helm_lifting_prs;
DROP POLICY IF EXISTS hlpr_insert ON public.helm_lifting_prs;
DROP POLICY IF EXISTS hlpr_update ON public.helm_lifting_prs;
DROP POLICY IF EXISTS hlpr_delete ON public.helm_lifting_prs;

CREATE POLICY hlpr_select ON public.helm_lifting_prs FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlpr_insert ON public.helm_lifting_prs FOR INSERT TO authenticated
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlpr_update ON public.helm_lifting_prs FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlpr_delete ON public.helm_lifting_prs FOR DELETE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- 6.11 Import runs + rows — staff only
ALTER TABLE public.helm_lifting_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlir_select ON public.helm_lifting_import_runs;
DROP POLICY IF EXISTS hlir_insert ON public.helm_lifting_import_runs;
DROP POLICY IF EXISTS hlir_update ON public.helm_lifting_import_runs;
DROP POLICY IF EXISTS hlir_delete ON public.helm_lifting_import_runs;

CREATE POLICY hlir_select ON public.helm_lifting_import_runs FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hlir_insert ON public.helm_lifting_import_runs FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlir_update ON public.helm_lifting_import_runs FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlir_delete ON public.helm_lifting_import_runs FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

ALTER TABLE public.helm_lifting_import_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hlirw_all ON public.helm_lifting_import_rows;
CREATE POLICY hlirw_all ON public.helm_lifting_import_rows FOR ALL TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

-- ===========================================================================
-- 7. GRANTS
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'helm_lifting_program_assignments',
    'helm_lifting_sessions',
    'helm_lifting_session_exercises',
    'helm_lifting_set_results',
    'helm_lifting_readiness_checkins',
    'helm_lifting_soreness_maps',
    'helm_lifting_bodyweight_entries',
    'helm_lifting_availability_statuses',
    'helm_lifting_maxes',
    'helm_lifting_prs',
    'helm_lifting_import_runs',
    'helm_lifting_import_rows'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
