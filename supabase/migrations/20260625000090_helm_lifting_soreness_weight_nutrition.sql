-- =============================================================================
-- Helm Lifting Lab — Soreness Check Schedules, Weight Check-In Schedules,
--                    and Nutrition Plans
-- Migration: 20260625000090_helm_lifting_soreness_weight_nutrition.sql
--
-- Spec: helm_lifting_lab_soreness_weight_nutrition_plan.md §8, §9, §10, §14, §17
--
-- Creates:
--   * helm_lifting_soreness_check_schedules  — coach-authored soreness check schedules
--   * helm_lifting_soreness_check_requests   — materialized per-athlete per-day requests
--   * helm_lifting_weight_checkin_schedules  — coach-authored weight check-in schedules
--   * helm_lifting_weight_checkin_requests   — materialized per-athlete per-day requests
--   * helm_lifting_nutrition_plans           — uploadable nutrition plan documents
--   * helm_lifting_nutrition_plan_assignments — plan → team/group/athlete assignments
--
--   ALTERs (additive only, guarded by IF NOT EXISTS):
--   * helm_lifting_readiness_checkins: +soreness_status, +submitted_from
--
--   Storage:
--   * lifting-nutrition private bucket (25 MB, PDF/image/doc/link)
--   * storage.objects RLS: coaches read+insert; athletes read own assigned plans
--
-- RLS CONVENTIONS (matches existing helm_lifting_* tables):
--   helper functions used:
--     helm_lifting_is_my_athlete(p_athlete uuid) → boolean
--     helm_lifting_can_view_org(p_org uuid, p_sport text) → boolean
--     helm_lifting_can_edit_org(p_org uuid) → boolean
--     helm_lifting_is_head_coach_viewer(p_org uuid) → boolean
--
--   pattern for every table:
--     ENABLE ROW LEVEL SECURITY
--     DROP POLICY IF EXISTS <short_name> ON <table>   (one per verb)
--     CREATE POLICY <short_name> ON <table> FOR <verb> TO authenticated USING/WITH CHECK(...)
--     REVOKE ALL ON public.<table> FROM anon;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
--     GRANT ALL ON public.<table> TO service_role;
--
-- GOLF-SAFETY GUARANTEES:
--   * Purely additive: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS. Zero ALTER TYPE / DROP on any shared object.
--   * ZERO ALTER/DROP of any golf_* or baseball_* or existing helm_lifting_* object
--     other than the two narrow ADD COLUMN statements on readiness_checkins.
--   * No FK into golf_* or baseball_* tables — only into shared `organizations`
--     and existing helm_lifting_* tables.
--   * Every SECURITY DEFINER function: SET search_path = public, pg_temp.
--   * service_role bypasses RLS by design — no explicit grant needed for it to work.
-- =============================================================================


-- ===========================================================================
-- 1. helm_lifting_soreness_check_schedules
--    Coach-authored schedule for recurring or one-time soreness checks.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_soreness_check_schedules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid,                   -- SOFT ref: sport team, no hard FK
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,

  title                  text NOT NULL,
  assignment_type        text NOT NULL CHECK (assignment_type IN ('team', 'group', 'athlete')),
  group_id               uuid REFERENCES public.helm_lifting_groups(id) ON DELETE SET NULL,
  athlete_id             uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE SET NULL,

  frequency_type         text NOT NULL CHECK (frequency_type IN ('once', 'daily', 'weekly', 'custom')),
  days_of_week           integer[],              -- 0=Sunday … 6=Saturday; NULL when not custom/weekly
  start_date             date NOT NULL,
  end_date               date,
  due_time               time,
  due_window_start       time,
  due_window_end         time,

  body_focus             text NOT NULL DEFAULT 'full_body'
    CHECK (body_focus IN ('full_body', 'throwing_arm', 'lower_body', 'custom')),
  custom_regions         text[],                 -- SORENESS_REGION_IDs from soreness-regions.ts
  instructions           text,

  visibility             text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff', 'performance_staff', 'head_coach_only')),

  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hlscs_org_sport_idx
  ON public.helm_lifting_soreness_check_schedules (organization_id, sport, status);
CREATE INDEX IF NOT EXISTS hlscs_start_date_idx
  ON public.helm_lifting_soreness_check_schedules (start_date)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS hlscs_group_idx
  ON public.helm_lifting_soreness_check_schedules (group_id)
  WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hlscs_athlete_idx
  ON public.helm_lifting_soreness_check_schedules (athlete_id)
  WHERE athlete_id IS NOT NULL;


-- ===========================================================================
-- 2. helm_lifting_soreness_check_requests
--    Materialized per-athlete per-due-date soreness check request.
--    Created by a server action (materializeSorenessCheckRequests) that fans
--    out the schedule to individual athletes.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_soreness_check_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id            uuid REFERENCES public.helm_lifting_soreness_check_schedules(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid,                   -- SOFT ref, denormalized from schedule
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,

  due_date               date NOT NULL,
  due_at                 timestamptz,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready_to_go', 'completed', 'missed', 'excused')),

  -- set after athlete submits; SOFT ref (readiness_checkins exist by this time)
  readiness_checkin_id   uuid,
  completed_at           timestamptz,
  reminder_sent_at       timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_helm_lifting_soreness_request UNIQUE (schedule_id, athlete_id, due_date)
);

CREATE INDEX IF NOT EXISTS hlscr_athlete_due_idx
  ON public.helm_lifting_soreness_check_requests (athlete_id, due_date DESC);
CREATE INDEX IF NOT EXISTS hlscr_org_due_idx
  ON public.helm_lifting_soreness_check_requests (organization_id, due_date, status);
CREATE INDEX IF NOT EXISTS hlscr_schedule_idx
  ON public.helm_lifting_soreness_check_requests (schedule_id);
CREATE INDEX IF NOT EXISTS hlscr_status_due_idx
  ON public.helm_lifting_soreness_check_requests (status, due_date)
  WHERE status IN ('pending', 'missed');


-- ===========================================================================
-- 3. helm_lifting_weight_checkin_schedules
--    Coach-authored schedule for recurring or one-time bodyweight check-ins.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_weight_checkin_schedules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid,                   -- SOFT ref: sport team, no hard FK
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,

  title                  text NOT NULL,
  assignment_type        text NOT NULL CHECK (assignment_type IN ('team', 'group', 'athlete')),
  group_id               uuid REFERENCES public.helm_lifting_groups(id) ON DELETE SET NULL,
  athlete_id             uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE SET NULL,

  frequency_type         text NOT NULL CHECK (frequency_type IN ('once', 'daily', 'weekly', 'custom')),
  days_of_week           integer[],
  start_date             date NOT NULL,
  end_date               date,
  due_time               time,
  due_window_start       time,
  due_window_end         time,

  instructions           text,

  visibility             text NOT NULL DEFAULT 'performance_staff'
    CHECK (visibility IN ('staff', 'performance_staff', 'head_coach_only')),

  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hlwcs_org_sport_idx
  ON public.helm_lifting_weight_checkin_schedules (organization_id, sport, status);
CREATE INDEX IF NOT EXISTS hlwcs_start_date_idx
  ON public.helm_lifting_weight_checkin_schedules (start_date)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS hlwcs_group_idx
  ON public.helm_lifting_weight_checkin_schedules (group_id)
  WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hlwcs_athlete_idx
  ON public.helm_lifting_weight_checkin_schedules (athlete_id)
  WHERE athlete_id IS NOT NULL;


-- ===========================================================================
-- 4. helm_lifting_weight_checkin_requests
--    Materialized per-athlete per-due-date weight check-in request.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_weight_checkin_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id            uuid REFERENCES public.helm_lifting_weight_checkin_schedules(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid,
  athlete_id             uuid NOT NULL REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,

  due_date               date NOT NULL,
  due_at                 timestamptz,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'missed', 'excused')),

  -- FK to the actual weight entry when completed; cascades to NULL on entry delete
  bodyweight_entry_id    uuid REFERENCES public.helm_lifting_bodyweight_entries(id) ON DELETE SET NULL,
  completed_at           timestamptz,
  reminder_sent_at       timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_helm_lifting_weight_request UNIQUE (schedule_id, athlete_id, due_date)
);

CREATE INDEX IF NOT EXISTS hlwcr_athlete_due_idx
  ON public.helm_lifting_weight_checkin_requests (athlete_id, due_date DESC);
CREATE INDEX IF NOT EXISTS hlwcr_org_due_idx
  ON public.helm_lifting_weight_checkin_requests (organization_id, due_date, status);
CREATE INDEX IF NOT EXISTS hlwcr_schedule_idx
  ON public.helm_lifting_weight_checkin_requests (schedule_id);
CREATE INDEX IF NOT EXISTS hlwcr_bodyweight_entry_idx
  ON public.helm_lifting_weight_checkin_requests (bodyweight_entry_id)
  WHERE bodyweight_entry_id IS NOT NULL;


-- ===========================================================================
-- 5. helm_lifting_nutrition_plans
--    Coach-uploaded nutrition plan: document, link, or inline note.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_nutrition_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid,                   -- SOFT ref, optional scope hint
  created_by_coach_id    uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,

  title                  text NOT NULL,
  description            text,

  plan_type              text NOT NULL DEFAULT 'document'
    CHECK (plan_type IN ('document', 'link', 'note')),

  -- document plan fields (populated when plan_type = 'document')
  storage_path           text,
  file_name              text,
  file_type              text,
  file_size              integer,

  -- link plan fields (populated when plan_type = 'link')
  external_url           text,

  visibility             text NOT NULL DEFAULT 'athlete_and_performance_staff'
    CHECK (visibility IN (
      'athlete_and_performance_staff',
      'performance_staff',
      'head_coach_only'
    )),

  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  published_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hlnp_org_sport_idx
  ON public.helm_lifting_nutrition_plans (organization_id, sport, status);
CREATE INDEX IF NOT EXISTS hlnp_created_by_idx
  ON public.helm_lifting_nutrition_plans (created_by_coach_id)
  WHERE created_by_coach_id IS NOT NULL;


-- ===========================================================================
-- 6. helm_lifting_nutrition_plan_assignments
--    Assigns a nutrition plan to a team, group, or individual athlete.
--    Tracks athlete acknowledgment.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_nutrition_plan_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL REFERENCES public.helm_lifting_nutrition_plans(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),

  assignment_type        text NOT NULL CHECK (assignment_type IN ('team', 'group', 'athlete')),
  team_id                uuid,                   -- SOFT ref; non-null when assignment_type='team'
  group_id               uuid REFERENCES public.helm_lifting_groups(id) ON DELETE SET NULL,
  athlete_id             uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE CASCADE,

  assigned_by_coach_id   uuid REFERENCES public.helm_lifting_coaches(id) ON DELETE SET NULL,
  assigned_at            timestamptz NOT NULL DEFAULT now(),

  -- athlete acknowledgment
  acknowledged_at        timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hlnpa_plan_idx
  ON public.helm_lifting_nutrition_plan_assignments (plan_id);
CREATE INDEX IF NOT EXISTS hlnpa_org_sport_idx
  ON public.helm_lifting_nutrition_plan_assignments (organization_id, sport);
CREATE INDEX IF NOT EXISTS hlnpa_athlete_idx
  ON public.helm_lifting_nutrition_plan_assignments (athlete_id)
  WHERE athlete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hlnpa_group_idx
  ON public.helm_lifting_nutrition_plan_assignments (group_id)
  WHERE group_id IS NOT NULL;


-- ===========================================================================
-- 7. Extend helm_lifting_readiness_checkins (additive only)
--    Both columns are nullable so existing rows need no backfill.
--    The table + its RLS is already live from 20260625000020_*.sql.
-- ===========================================================================

-- 7.1 soreness_status — 'ready_to_go' (one-tap fast path) or 'reported_soreness'
ALTER TABLE public.helm_lifting_readiness_checkins
  ADD COLUMN IF NOT EXISTS soreness_status text
  CHECK (
    soreness_status IS NULL
    OR soreness_status IN ('ready_to_go', 'reported_soreness')
  );

-- 7.2 submitted_from — where the athlete submitted from, for analytics
ALTER TABLE public.helm_lifting_readiness_checkins
  ADD COLUMN IF NOT EXISTS submitted_from text
  CHECK (
    submitted_from IS NULL
    OR submitted_from IN ('player_today', 'lift_session', 'coach_entry')
  );


-- ===========================================================================
-- 7.5 Access helper — head-coach-tier viewer
-- The lifting model has NO separate head-coach flag (helm_lifting_coaches has no
-- role column), so "head_coach_only" visibility is gated to coaches with EDIT
-- rights on the org (full/head coaches). View-only org_viewers and athletes are
-- excluded — satisfying the spec's "do not leak head-coach-only data to regular
-- staff." Defined here (idempotent) because the original draft referenced this
-- helper without creating it.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.helm_lifting_is_head_coach_viewer(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.helm_lifting_can_edit_org(p_org);
$function$;

REVOKE ALL ON FUNCTION public.helm_lifting_is_head_coach_viewer(uuid) FROM anon;

-- ===========================================================================
-- 8. Storage bucket — lifting-nutrition (private, 25 MB)
-- ===========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lifting-nutrition',
  'lifting-nutrition',
  false,
  26214400, -- 25 MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage object policies — coaches upload/read; athletes read their own assigned plans.
-- Path convention: lifting-nutrition/<org_id>/<plan_id>/<filename>
-- The org_id is the first path component, matching foldername(name)[1].

DROP POLICY IF EXISTS lifting_nutrition_coach_select ON storage.objects;
CREATE POLICY lifting_nutrition_coach_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lifting-nutrition'
    AND public.helm_lifting_can_view_org(
      ((storage.foldername(name))[1])::uuid,
      'baseball'  -- coaches cover all sports in an org; the helper returns true for any sport
    )
  );

DROP POLICY IF EXISTS lifting_nutrition_coach_insert ON storage.objects;
CREATE POLICY lifting_nutrition_coach_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lifting-nutrition'
    AND public.helm_lifting_can_edit_org(
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS lifting_nutrition_coach_update ON storage.objects;
CREATE POLICY lifting_nutrition_coach_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lifting-nutrition'
    AND public.helm_lifting_can_edit_org(
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS lifting_nutrition_coach_delete ON storage.objects;
CREATE POLICY lifting_nutrition_coach_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lifting-nutrition'
    AND public.helm_lifting_can_edit_org(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- Athletes may download the plan file when they have an active assignment.
-- We check via an EXISTS into the assignment table so an archived or deleted
-- assignment immediately revokes access without a migration.
DROP POLICY IF EXISTS lifting_nutrition_athlete_select ON storage.objects;
CREATE POLICY lifting_nutrition_athlete_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lifting-nutrition'
    AND EXISTS (
      SELECT 1
      FROM public.helm_lifting_nutrition_plan_assignments a
      JOIN public.helm_lifting_nutrition_plans p ON p.id = a.plan_id
      JOIN public.helm_lifting_athletes ath
        ON ath.id = a.athlete_id
        AND ath.user_id = auth.uid()
      WHERE p.storage_path LIKE ('%' || name)   -- plan's storage_path ends with the object name
        AND p.status = 'published'
        AND (
          a.athlete_id IS NOT NULL               -- direct assignment
          -- team/group assignment resolved by server actions at materialize time
        )
    )
  );


-- ===========================================================================
-- 9. ROW LEVEL SECURITY
-- ===========================================================================

-- ── 9.1 helm_lifting_soreness_check_schedules ─────────────────────────────
ALTER TABLE public.helm_lifting_soreness_check_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlscs_select ON public.helm_lifting_soreness_check_schedules;
DROP POLICY IF EXISTS hlscs_insert ON public.helm_lifting_soreness_check_schedules;
DROP POLICY IF EXISTS hlscs_update ON public.helm_lifting_soreness_check_schedules;
DROP POLICY IF EXISTS hlscs_delete ON public.helm_lifting_soreness_check_schedules;

-- Coaches and org-viewers may read schedules; head-coach-only gate respected
CREATE POLICY hlscs_select ON public.helm_lifting_soreness_check_schedules
  FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
    AND (
      visibility <> 'head_coach_only'
      OR public.helm_lifting_is_head_coach_viewer(organization_id)
    )
  );

CREATE POLICY hlscs_insert ON public.helm_lifting_soreness_check_schedules
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlscs_update ON public.helm_lifting_soreness_check_schedules
  FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlscs_delete ON public.helm_lifting_soreness_check_schedules
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ── 9.2 helm_lifting_soreness_check_requests ──────────────────────────────
ALTER TABLE public.helm_lifting_soreness_check_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlscr_select ON public.helm_lifting_soreness_check_requests;
DROP POLICY IF EXISTS hlscr_insert ON public.helm_lifting_soreness_check_requests;
DROP POLICY IF EXISTS hlscr_update ON public.helm_lifting_soreness_check_requests;
DROP POLICY IF EXISTS hlscr_delete ON public.helm_lifting_soreness_check_requests;

-- Athlete reads their OWN requests; coaches read all in org
CREATE POLICY hlscr_select ON public.helm_lifting_soreness_check_requests
  FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

-- Only staff materialize requests; athlete cannot INSERT requests themselves
CREATE POLICY hlscr_insert ON public.helm_lifting_soreness_check_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

-- Athlete may advance status on OWN request (submit ready_to_go / completed);
-- staff may update any (excuse, mark missed, etc.)
CREATE POLICY hlscr_update ON public.helm_lifting_soreness_check_requests
  FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- No client delete — staff archives via schedule status; no row purge at MVP
CREATE POLICY hlscr_delete ON public.helm_lifting_soreness_check_requests
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ── 9.3 helm_lifting_weight_checkin_schedules ─────────────────────────────
ALTER TABLE public.helm_lifting_weight_checkin_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlwcs_select ON public.helm_lifting_weight_checkin_schedules;
DROP POLICY IF EXISTS hlwcs_insert ON public.helm_lifting_weight_checkin_schedules;
DROP POLICY IF EXISTS hlwcs_update ON public.helm_lifting_weight_checkin_schedules;
DROP POLICY IF EXISTS hlwcs_delete ON public.helm_lifting_weight_checkin_schedules;

CREATE POLICY hlwcs_select ON public.helm_lifting_weight_checkin_schedules
  FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
    AND (
      visibility <> 'head_coach_only'
      OR public.helm_lifting_is_head_coach_viewer(organization_id)
    )
  );

CREATE POLICY hlwcs_insert ON public.helm_lifting_weight_checkin_schedules
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlwcs_update ON public.helm_lifting_weight_checkin_schedules
  FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlwcs_delete ON public.helm_lifting_weight_checkin_schedules
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ── 9.4 helm_lifting_weight_checkin_requests ──────────────────────────────
ALTER TABLE public.helm_lifting_weight_checkin_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlwcr_select ON public.helm_lifting_weight_checkin_requests;
DROP POLICY IF EXISTS hlwcr_insert ON public.helm_lifting_weight_checkin_requests;
DROP POLICY IF EXISTS hlwcr_update ON public.helm_lifting_weight_checkin_requests;
DROP POLICY IF EXISTS hlwcr_delete ON public.helm_lifting_weight_checkin_requests;

CREATE POLICY hlwcr_select ON public.helm_lifting_weight_checkin_requests
  FOR SELECT TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_view_org(organization_id, sport)
  );

-- Only staff materialize weight requests
CREATE POLICY hlwcr_insert ON public.helm_lifting_weight_checkin_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

-- Athlete advances status on OWN (submit weight); staff manages all
CREATE POLICY hlwcr_update ON public.helm_lifting_weight_checkin_requests
  FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

CREATE POLICY hlwcr_delete ON public.helm_lifting_weight_checkin_requests
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ── 9.5 helm_lifting_nutrition_plans ──────────────────────────────────────
ALTER TABLE public.helm_lifting_nutrition_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlnp_select ON public.helm_lifting_nutrition_plans;
DROP POLICY IF EXISTS hlnp_insert ON public.helm_lifting_nutrition_plans;
DROP POLICY IF EXISTS hlnp_update ON public.helm_lifting_nutrition_plans;
DROP POLICY IF EXISTS hlnp_delete ON public.helm_lifting_nutrition_plans;

-- Athletes may read PUBLISHED plans assigned to them (via assignments join).
-- Staff read all plans for the org (draft + published + archived) with visibility gate.
CREATE POLICY hlnp_select ON public.helm_lifting_nutrition_plans
  FOR SELECT TO authenticated
  USING (
    -- staff path
    (
      public.helm_lifting_can_view_org(organization_id, sport)
      AND (
        visibility <> 'head_coach_only'
        OR public.helm_lifting_is_head_coach_viewer(organization_id)
      )
    )
    OR
    -- athlete path: published, non-head-coach-only, and they have an assignment
    (
      status = 'published'
      AND visibility <> 'head_coach_only'
      AND EXISTS (
        SELECT 1
        FROM public.helm_lifting_nutrition_plan_assignments a
        JOIN public.helm_lifting_athletes ath ON ath.id = a.athlete_id
        WHERE a.plan_id        = public.helm_lifting_nutrition_plans.id
          AND ath.user_id      = auth.uid()
          AND a.assignment_type = 'athlete'
      )
    )
  );

CREATE POLICY hlnp_insert ON public.helm_lifting_nutrition_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlnp_update ON public.helm_lifting_nutrition_plans
  FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlnp_delete ON public.helm_lifting_nutrition_plans
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ── 9.6 helm_lifting_nutrition_plan_assignments ───────────────────────────
ALTER TABLE public.helm_lifting_nutrition_plan_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlnpa_select ON public.helm_lifting_nutrition_plan_assignments;
DROP POLICY IF EXISTS hlnpa_insert ON public.helm_lifting_nutrition_plan_assignments;
DROP POLICY IF EXISTS hlnpa_update ON public.helm_lifting_nutrition_plan_assignments;
DROP POLICY IF EXISTS hlnpa_delete ON public.helm_lifting_nutrition_plan_assignments;

-- Athletes read their OWN direct assignments; coaches read all in org
CREATE POLICY hlnpa_select ON public.helm_lifting_nutrition_plan_assignments
  FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
    OR (
      assignment_type = 'athlete'
      AND public.helm_lifting_is_my_athlete(athlete_id)
    )
  );

CREATE POLICY hlnpa_insert ON public.helm_lifting_nutrition_plan_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

-- Athletes may acknowledge their own assignment (acknowledged_at); coaches may re-assign
CREATE POLICY hlnpa_update ON public.helm_lifting_nutrition_plan_assignments
  FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_can_edit_org(organization_id)
    OR (
      assignment_type = 'athlete'
      AND public.helm_lifting_is_my_athlete(athlete_id)
    )
  )
  WITH CHECK (
    public.helm_lifting_can_edit_org(organization_id)
    OR (
      assignment_type = 'athlete'
      AND public.helm_lifting_is_my_athlete(athlete_id)
    )
  );

CREATE POLICY hlnpa_delete ON public.helm_lifting_nutrition_plan_assignments
  FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));


-- ===========================================================================
-- 10. GRANTS — REVOKE anon; grant authenticated + service_role
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'helm_lifting_soreness_check_schedules',
    'helm_lifting_soreness_check_requests',
    'helm_lifting_weight_checkin_schedules',
    'helm_lifting_weight_checkin_requests',
    'helm_lifting_nutrition_plans',
    'helm_lifting_nutrition_plan_assignments'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ===========================================================================
-- ROLLBACK NOTES (do NOT run in production without a full data assessment):
--
--   -- remove storage bucket + policies
--   delete from storage.buckets where id = 'lifting-nutrition';
--   drop policy if exists lifting_nutrition_coach_select  on storage.objects;
--   drop policy if exists lifting_nutrition_coach_insert  on storage.objects;
--   drop policy if exists lifting_nutrition_coach_update  on storage.objects;
--   drop policy if exists lifting_nutrition_coach_delete  on storage.objects;
--   drop policy if exists lifting_nutrition_athlete_select on storage.objects;
--
--   -- remove new tables (in reverse FK order)
--   drop table if exists public.helm_lifting_nutrition_plan_assignments;
--   drop table if exists public.helm_lifting_nutrition_plans;
--   drop table if exists public.helm_lifting_weight_checkin_requests;
--   drop table if exists public.helm_lifting_weight_checkin_schedules;
--   drop table if exists public.helm_lifting_soreness_check_requests;
--   drop table if exists public.helm_lifting_soreness_check_schedules;
--
--   -- remove added columns from readiness_checkins
--   alter table public.helm_lifting_readiness_checkins drop column if exists soreness_status;
--   alter table public.helm_lifting_readiness_checkins drop column if exists submitted_from;
-- ===========================================================================
