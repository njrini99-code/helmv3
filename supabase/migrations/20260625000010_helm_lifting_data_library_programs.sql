-- =============================================================================
-- Helm Lifting Lab — Exercise Library, Groups & Program Model
-- Migration: 20260625000010_helm_lifting_data_library_programs.sql
--
-- Spec: docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md §1.5 (data tables,
--       cloned from V11 baseball_lift_* shapes), §1.6 (RLS)
--
-- Creates:
--   * helm_lifting_exercises             (exercise library — cloned from baseball_lift_exercises)
--   * helm_lifting_exercise_substitutions
--   * helm_lifting_groups                (strength groups — cloned from baseball_strength_groups)
--   * helm_lifting_group_members
--   * helm_lifting_programs              (program model)
--   * helm_lifting_weeks
--   * helm_lifting_days
--   * helm_lifting_sections
--   * helm_lifting_prescriptions
--
-- Key differences from baseball originals:
--   * org-keyed: organization_id (FK organizations) + sport text
--   * soft athlete/team refs (no hard FK to sport tables)
--   * legacy_baseball_id uuid (nullable, partial-unique) on every table
--     so the backfill (Wave 2 W2-G) is idempotent via ON CONFLICT DO NOTHING
--
-- GOLF-SAFETY: purely additive; zero ALTER/DROP of any golf_* or baseball_*
--   object; REVOKE ALL ... FROM anon on every table.
-- =============================================================================

-- ===========================================================================
-- 1. EXERCISE LIBRARY
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_exercises (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  name                   text NOT NULL,
  category               text NOT NULL DEFAULT 'strength'
    CHECK (category IN ('warmup', 'power', 'strength', 'accessory', 'arm_care',
                        'mobility', 'conditioning', 'recovery', 'test')),
  primary_pattern        text
    CHECK (primary_pattern IS NULL OR primary_pattern IN
      ('squat', 'hinge', 'push', 'pull', 'carry', 'rotate', 'anti_rotate',
       'sprint', 'jump', 'throw', 'shoulder', 'elbow', 'hip', 'ankle')),
  body_region            text
    CHECK (body_region IS NULL OR body_region IN
      ('lower', 'upper', 'trunk', 'arm', 'full_body')),
  equipment              text,
  unilateral             boolean NOT NULL DEFAULT false,
  sport_constraints      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sport_tags             text[] NOT NULL DEFAULT '{}',
  default_unit           text NOT NULL DEFAULT 'lb'
    CHECK (default_unit IN ('lb', 'kg', 'bodyweight', 'seconds', 'yards', 'reps', 'mph', 'watts', 'mps')),
  track_load             boolean NOT NULL DEFAULT true,
  track_reps             boolean NOT NULL DEFAULT true,
  track_sets             boolean NOT NULL DEFAULT true,
  track_velocity         boolean NOT NULL DEFAULT false,
  track_distance         boolean NOT NULL DEFAULT false,
  track_time             boolean NOT NULL DEFAULT false,
  track_rpe              boolean NOT NULL DEFAULT true,
  video_url              text,
  instructions           text,
  coaching_cues          text[] NOT NULL DEFAULT '{}',
  contraindication_notes text,
  is_global              boolean NOT NULL DEFAULT false,
  is_active              boolean NOT NULL DEFAULT true,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Global exercises: organization_id still required (the Lab org that manages it)
  -- but is_global can be true for cross-org sharing within same org
  CONSTRAINT helm_lifting_exercises_scope_ck
    CHECK (
      (is_global = true AND organization_id IS NOT NULL)
      OR (is_global = false AND organization_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS helm_lifting_exercises_org_sport_idx
  ON public.helm_lifting_exercises (organization_id, sport) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS helm_lifting_exercises_global_idx
  ON public.helm_lifting_exercises (is_global) WHERE is_global = true;
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_exercises_org_name_uq
  ON public.helm_lifting_exercises (organization_id, sport, lower(name));
-- Partial unique for backfill idempotency: one helm row per legacy source row
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_exercises_legacy_uq
  ON public.helm_lifting_exercises (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 1b. Exercise substitutions
CREATE TABLE IF NOT EXISTS public.helm_lifting_exercise_substitutions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  exercise_id            uuid NOT NULL REFERENCES public.helm_lifting_exercises(id) ON DELETE CASCADE,
  substitute_exercise_id uuid NOT NULL REFERENCES public.helm_lifting_exercises(id) ON DELETE CASCADE,
  reason                 text,
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_substitution UNIQUE (exercise_id, substitute_exercise_id),
  CONSTRAINT helm_lifting_substitution_distinct CHECK (exercise_id <> substitute_exercise_id)
);
CREATE INDEX IF NOT EXISTS helm_lifting_exercise_subs_exercise_idx
  ON public.helm_lifting_exercise_substitutions (exercise_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_exercise_subs_legacy_uq
  ON public.helm_lifting_exercise_substitutions (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 2. STRENGTH GROUPS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_groups (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid, -- SOFT ref: the sport team this group belongs to
  name                   text NOT NULL,
  description            text,
  group_type             text NOT NULL DEFAULT 'static'
    CHECK (group_type IN ('static', 'dynamic', 'imported', 'temporary')),
  rule_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  is_active              boolean NOT NULL DEFAULT true,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_groups_org_sport_idx
  ON public.helm_lifting_groups (organization_id, sport) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_groups_legacy_uq
  ON public.helm_lifting_groups (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- 2b. Group members
CREATE TABLE IF NOT EXISTS public.helm_lifting_group_members (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id               uuid NOT NULL REFERENCES public.helm_lifting_groups(id) ON DELETE CASCADE,
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,
  source                 text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rule', 'import')),
  added_by_coach_id      uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  starts_at              timestamptz,
  ends_at                timestamptz,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_group_member UNIQUE (group_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS helm_lifting_group_members_group_idx
  ON public.helm_lifting_group_members (group_id);
CREATE INDEX IF NOT EXISTS helm_lifting_group_members_athlete_idx
  ON public.helm_lifting_group_members (athlete_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_group_members_legacy_uq
  ON public.helm_lifting_group_members (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 3. PROGRAM MODEL — program → week → day → section → prescription
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_programs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid, -- SOFT ref: sport team scope
  name                   text NOT NULL,
  description            text,
  phase                  text NOT NULL DEFAULT 'in_season'
    CHECK (phase IN ('fall', 'winter', 'preseason', 'in_season', 'postseason',
                     'summer', 'return_to_play', 'testing')),
  goal                   text NOT NULL DEFAULT 'strength'
    CHECK (goal IN ('strength', 'power', 'hypertrophy', 'speed', 'maintenance',
                    'recovery', 'arm_care', 'testing')),
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  visibility             text NOT NULL DEFAULT 'staff_only'
    CHECK (visibility IN ('staff_only', 'assigned_players')),
  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  is_template            boolean NOT NULL DEFAULT false,
  start_date             date,
  end_date               date,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_programs_org_sport_idx
  ON public.helm_lifting_programs (organization_id, sport, status);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_programs_legacy_uq
  ON public.helm_lifting_programs (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- Weeks
CREATE TABLE IF NOT EXISTS public.helm_lifting_weeks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id             uuid NOT NULL REFERENCES public.helm_lifting_programs(id) ON DELETE CASCADE,
  week_number            integer NOT NULL,
  name                   text,
  theme                  text,
  deload                 boolean NOT NULL DEFAULT false,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_week UNIQUE (program_id, week_number)
);
CREATE INDEX IF NOT EXISTS helm_lifting_weeks_program_idx
  ON public.helm_lifting_weeks (program_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_weeks_legacy_uq
  ON public.helm_lifting_weeks (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- Days
CREATE TABLE IF NOT EXISTS public.helm_lifting_days (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id                uuid NOT NULL REFERENCES public.helm_lifting_weeks(id) ON DELETE CASCADE,
  day_number             integer NOT NULL,
  name                   text,
  day_type               text NOT NULL DEFAULT 'full_body'
    CHECK (day_type IN ('lower', 'upper', 'full_body', 'recovery', 'arm_care',
                        'conditioning', 'testing', 'custom')),
  sport_context          text, -- was baseball_context; renamed for multi-sport
  estimated_minutes      integer,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_day UNIQUE (week_id, day_number)
);
CREATE INDEX IF NOT EXISTS helm_lifting_days_week_idx
  ON public.helm_lifting_days (week_id);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_days_legacy_uq
  ON public.helm_lifting_days (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- Sections
CREATE TABLE IF NOT EXISTS public.helm_lifting_sections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lift_day_id            uuid NOT NULL REFERENCES public.helm_lifting_days(id) ON DELETE CASCADE,
  section_order          integer NOT NULL DEFAULT 0,
  name                   text NOT NULL,
  section_type           text NOT NULL DEFAULT 'main_strength'
    CHECK (section_type IN ('warmup', 'movement_prep', 'power', 'main_strength',
                            'accessory', 'arm_care', 'mobility', 'conditioning')),
  instructions           text,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_sections_day_idx
  ON public.helm_lifting_sections (lift_day_id, section_order);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_sections_legacy_uq
  ON public.helm_lifting_sections (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- Prescriptions
CREATE TABLE IF NOT EXISTS public.helm_lifting_prescriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id             uuid NOT NULL REFERENCES public.helm_lifting_sections(id) ON DELETE CASCADE,
  exercise_id            uuid REFERENCES public.helm_lifting_exercises(id) ON DELETE SET NULL,
  order_index            integer NOT NULL DEFAULT 0,
  prescription_type      text NOT NULL DEFAULT 'fixed'
    CHECK (prescription_type IN ('fixed', 'percent_1rm', 'rpe', 'velocity',
                                 'coach_load', 'player_select')),
  sets                   integer,
  reps                   integer,
  load_value             numeric,
  load_unit              text,
  percent_1rm            numeric,
  target_rpe             numeric,
  target_rir             numeric,
  target_velocity_min    numeric,
  target_velocity_max    numeric,
  rest_seconds           integer,
  tempo                  text,
  coaching_note          text,
  substitution_group_id  uuid REFERENCES public.helm_lifting_exercise_substitutions(id) ON DELETE SET NULL,
  legacy_baseball_id     uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helm_lifting_prescriptions_section_idx
  ON public.helm_lifting_prescriptions (section_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_prescriptions_legacy_uq
  ON public.helm_lifting_prescriptions (legacy_baseball_id)
  WHERE legacy_baseball_id IS NOT NULL;

-- ===========================================================================
-- 4. ROW LEVEL SECURITY
-- ===========================================================================

-- 4.1 Exercises + substitutions -------------------------------------------
ALTER TABLE public.helm_lifting_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hle_select ON public.helm_lifting_exercises;
DROP POLICY IF EXISTS hle_insert ON public.helm_lifting_exercises;
DROP POLICY IF EXISTS hle_update ON public.helm_lifting_exercises;
DROP POLICY IF EXISTS hle_delete ON public.helm_lifting_exercises;

CREATE POLICY hle_select ON public.helm_lifting_exercises FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
    OR public.helm_lifting_is_my_athlete(
         (SELECT a.id FROM public.helm_lifting_athletes a
          WHERE a.organization_id = helm_lifting_exercises.organization_id
            AND a.sport = helm_lifting_exercises.sport
            AND a.user_id = auth.uid()
          LIMIT 1)
       )
  );

CREATE POLICY hle_insert ON public.helm_lifting_exercises FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hle_update ON public.helm_lifting_exercises FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hle_delete ON public.helm_lifting_exercises FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

ALTER TABLE public.helm_lifting_exercise_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hles_select ON public.helm_lifting_exercise_substitutions;
DROP POLICY IF EXISTS hles_insert ON public.helm_lifting_exercise_substitutions;
DROP POLICY IF EXISTS hles_update ON public.helm_lifting_exercise_substitutions;
DROP POLICY IF EXISTS hles_delete ON public.helm_lifting_exercise_substitutions;

CREATE POLICY hles_select ON public.helm_lifting_exercise_substitutions FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hles_insert ON public.helm_lifting_exercise_substitutions FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hles_update ON public.helm_lifting_exercise_substitutions FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hles_delete ON public.helm_lifting_exercise_substitutions FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 4.2 Groups + members ----------------------------------------------------
ALTER TABLE public.helm_lifting_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlg_select ON public.helm_lifting_groups;
DROP POLICY IF EXISTS hlg_insert ON public.helm_lifting_groups;
DROP POLICY IF EXISTS hlg_update ON public.helm_lifting_groups;
DROP POLICY IF EXISTS hlg_delete ON public.helm_lifting_groups;

CREATE POLICY hlg_select ON public.helm_lifting_groups FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hlg_insert ON public.helm_lifting_groups FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlg_update ON public.helm_lifting_groups FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlg_delete ON public.helm_lifting_groups FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

ALTER TABLE public.helm_lifting_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlgm_select ON public.helm_lifting_group_members;
DROP POLICY IF EXISTS hlgm_insert ON public.helm_lifting_group_members;
DROP POLICY IF EXISTS hlgm_update ON public.helm_lifting_group_members;
DROP POLICY IF EXISTS hlgm_delete ON public.helm_lifting_group_members;

-- Athlete may read their OWN membership; staff may read all
CREATE POLICY hlgm_select ON public.helm_lifting_group_members FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR EXISTS (
      SELECT 1 FROM public.helm_lifting_groups g
      WHERE g.id = group_id
        AND public.helm_lifting_can_view_org(g.organization_id, g.sport)
    )
  );

CREATE POLICY hlgm_insert ON public.helm_lifting_group_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_groups g
    WHERE g.id = group_id
      AND public.helm_lifting_can_edit_org(g.organization_id)
  ));

CREATE POLICY hlgm_update ON public.helm_lifting_group_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_groups g
    WHERE g.id = group_id
      AND public.helm_lifting_can_edit_org(g.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_groups g
    WHERE g.id = group_id
      AND public.helm_lifting_can_edit_org(g.organization_id)
  ));

CREATE POLICY hlgm_delete ON public.helm_lifting_group_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_groups g
    WHERE g.id = group_id
      AND public.helm_lifting_can_edit_org(g.organization_id)
  ));

-- 4.3 Program model -------------------------------------------------------
-- Programs: staff-authored; athletes read via materialized sessions, not here.
ALTER TABLE public.helm_lifting_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlp_select ON public.helm_lifting_programs;
DROP POLICY IF EXISTS hlp_insert ON public.helm_lifting_programs;
DROP POLICY IF EXISTS hlp_update ON public.helm_lifting_programs;
DROP POLICY IF EXISTS hlp_delete ON public.helm_lifting_programs;

CREATE POLICY hlp_select ON public.helm_lifting_programs FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hlp_insert ON public.helm_lifting_programs FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlp_update ON public.helm_lifting_programs FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlp_delete ON public.helm_lifting_programs FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- Weeks/days/sections/prescriptions inherit gating through the program's org.
ALTER TABLE public.helm_lifting_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hlw_all ON public.helm_lifting_weeks;
CREATE POLICY hlw_all ON public.helm_lifting_weeks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

ALTER TABLE public.helm_lifting_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hld_all ON public.helm_lifting_days;
CREATE POLICY hld_all ON public.helm_lifting_days FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

ALTER TABLE public.helm_lifting_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hlsec_all ON public.helm_lifting_sections;
CREATE POLICY hlsec_all ON public.helm_lifting_sections FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

ALTER TABLE public.helm_lifting_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hlpr_all ON public.helm_lifting_prescriptions;
CREATE POLICY hlpr_all ON public.helm_lifting_prescriptions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

-- ===========================================================================
-- 5. GRANTS
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'helm_lifting_exercises',
    'helm_lifting_exercise_substitutions',
    'helm_lifting_groups',
    'helm_lifting_group_members',
    'helm_lifting_programs',
    'helm_lifting_weeks',
    'helm_lifting_days',
    'helm_lifting_sections',
    'helm_lifting_prescriptions'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
