-- =============================================================================
-- BaseballHelm — Performance / Lifting Lite
-- =============================================================================
-- Wave 9 / performance-lifting packet (P9.1).
--
-- Adds four ADDITIVE tables for a lightweight strength & conditioning surface:
--   1. baseball_exercises          — exercise library (global + per-team rows).
--   2. baseball_lift_assignments   — staff-prescribed lifts for a player or a
--                                    scoped group; carries a JSONB prescription.
--   3. baseball_lift_results       — player-logged set results (sets/reps/weight/
--                                    rpe). Source + import_run_id lineage columns
--                                    so an audited import can attribute / roll
--                                    back rows.
--   4. baseball_readiness_checkins — daily player wellness/readiness self-report
--                                    (sleep / energy / soreness / arm / mood).
--                                    Health-ADJACENT, never a medical diagnosis.
--
-- SECURITY MODEL (enforced by RLS below + has_baseball_staff_capability):
--   * Exercise library: global rows readable by any team staff; team rows scoped
--     to is_baseball_team_staff(team_id). Writes gated by
--     has_baseball_staff_capability(team_id,'can_manage_lifting').
--   * Assignments: staff with can_manage_lifting create/edit for scoped
--     groups/players (can_manage_baseball_lift_group). A player reads only their
--     OWN assignments (player_id = get_my_baseball_player_id()).
--   * Results: a player INSERTs/reads only their OWN results
--     (player_id = get_my_baseball_player_id()). Strength/head coach read scoped
--     results via can_manage_baseball_lift_group; OTHER players can NEVER read a
--     teammate's loads (staff-restricted).
--   * Readiness check-ins: a player INSERTs/updates/reads only their OWN
--     check-ins. Staff read only with can_view_medical (readiness/soreness is
--     health-adjacent; there is no can_view_readiness capability in the staff
--     model, so the nearest health gate is used). Never framed as a medical
--     diagnosis; other players can NEVER read.
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF
--     NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on all four tables with explicit policies. No GRANT to anon.
--   * Reuses SECURITY DEFINER helpers from
--     20260624000050_baseball_rls_helpers_and_policies.sql:
--       is_baseball_team_staff, has_baseball_staff_capability,
--       can_manage_baseball_lift_group, get_my_baseball_player_id.
--   * FK to public.baseball_import_runs(id) is created only when that table
--     exists (it ships in 20260624000020); otherwise the column is plain uuid.
--
-- We do NOT apply this migration here — production GolfHelm shares this DB.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. baseball_exercises — exercise library (global rows + per-team rows)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text,
  description text,
  is_global   boolean NOT NULL DEFAULT false,
  created_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A global row has no team; a team row must name its team.
  CONSTRAINT baseball_exercises_scope_ck
    CHECK ((is_global AND team_id IS NULL) OR (NOT is_global AND team_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS baseball_exercises_team_idx
  ON public.baseball_exercises (team_id);
CREATE INDEX IF NOT EXISTS baseball_exercises_global_idx
  ON public.baseball_exercises (is_global) WHERE is_global = true;

-- ----------------------------------------------------------------------------
-- 2. baseball_lift_assignments — prescribed lifts (player or scoped group)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_lift_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  group_scope uuid[],
  assigned_by_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  exercise_id uuid REFERENCES public.baseball_exercises(id) ON DELETE SET NULL,
  title       text,
  due_date    date,
  prescription jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'skipped', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS baseball_lift_assignments_team_idx
  ON public.baseball_lift_assignments (team_id);
CREATE INDEX IF NOT EXISTS baseball_lift_assignments_player_idx
  ON public.baseball_lift_assignments (player_id);
CREATE INDEX IF NOT EXISTS baseball_lift_assignments_due_idx
  ON public.baseball_lift_assignments (team_id, due_date);

-- ----------------------------------------------------------------------------
-- 3. baseball_lift_results — player-logged set results (with import lineage)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_lift_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.baseball_lift_assignments(id) ON DELETE SET NULL,
  exercise_id   uuid REFERENCES public.baseball_exercises(id) ON DELETE SET NULL,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  sets    integer,
  reps    integer,
  weight  numeric,
  rpe     numeric,
  notes   text,
  source  text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'system')),
  import_run_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Attach the import-lineage FK only when the lineage table exists (0020).
DO $$
BEGIN
  IF to_regclass('public.baseball_import_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'baseball_lift_results_import_run_id_fkey'
         AND conrelid = 'public.baseball_lift_results'::regclass
     ) THEN
    EXECUTE 'ALTER TABLE public.baseball_lift_results
             ADD CONSTRAINT baseball_lift_results_import_run_id_fkey
             FOREIGN KEY (import_run_id)
             REFERENCES public.baseball_import_runs(id) ON DELETE SET NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS baseball_lift_results_team_idx
  ON public.baseball_lift_results (team_id);
CREATE INDEX IF NOT EXISTS baseball_lift_results_player_idx
  ON public.baseball_lift_results (player_id);
CREATE INDEX IF NOT EXISTS baseball_lift_results_assignment_idx
  ON public.baseball_lift_results (assignment_id);
CREATE INDEX IF NOT EXISTS baseball_lift_results_import_run_idx
  ON public.baseball_lift_results (import_run_id) WHERE import_run_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. baseball_readiness_checkins — daily player wellness self-report
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_readiness_checkins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id) ON DELETE CASCADE,
  check_date  date NOT NULL,
  sleep_hours numeric CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  energy_level   integer CHECK (energy_level IS NULL OR (energy_level BETWEEN 1 AND 5)),
  soreness_level integer CHECK (soreness_level IS NULL OR (soreness_level BETWEEN 1 AND 5)),
  arm_status  text CHECK (arm_status IS NULL OR arm_status IN ('fresh', 'normal', 'tight', 'sore', 'pain')),
  mood        text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- one check-in per player per day (enables idempotent upsert, no delete+insert)
  CONSTRAINT uq_baseball_readiness_checkins UNIQUE (player_id, check_date)
);

CREATE INDEX IF NOT EXISTS baseball_readiness_checkins_team_idx
  ON public.baseball_readiness_checkins (team_id);
CREATE INDEX IF NOT EXISTS baseball_readiness_checkins_player_idx
  ON public.baseball_readiness_checkins (player_id, check_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- All policies are TO authenticated; service_role bypasses RLS by design
-- (cron / AI / import writes). No policy ever targets anon.

-- ----------------------------------------------------------------------------
-- baseball_exercises  — global readable by staff; team rows staff-scoped;
--                       writes gated by can_manage_lifting.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_exercises_select" ON public.baseball_exercises;
DROP POLICY IF EXISTS "baseball_exercises_insert" ON public.baseball_exercises;
DROP POLICY IF EXISTS "baseball_exercises_update" ON public.baseball_exercises;
DROP POLICY IF EXISTS "baseball_exercises_delete" ON public.baseball_exercises;

-- Global rows readable by any authenticated team staff (on ANY team they staff);
-- team rows readable by that team's staff AND that team's players (so a player
-- can see the name of an exercise they were assigned).
CREATE POLICY "baseball_exercises_select" ON public.baseball_exercises
  FOR SELECT TO authenticated
  USING (
    (is_global = true AND EXISTS (
      SELECT 1 FROM public.baseball_team_coach_staff tcs
      WHERE tcs.coach_id = public.get_my_coach_id()
    ))
    OR (team_id IS NOT NULL AND public.is_baseball_team_staff(team_id))
    OR (team_id IS NOT NULL AND public.is_baseball_team_member(team_id))
  );

CREATE POLICY "baseball_exercises_insert" ON public.baseball_exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IS NOT NULL
    AND is_global = false
    AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
  );

CREATE POLICY "baseball_exercises_update" ON public.baseball_exercises
  FOR UPDATE TO authenticated
  USING (
    team_id IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
  )
  WITH CHECK (
    team_id IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
  );

CREATE POLICY "baseball_exercises_delete" ON public.baseball_exercises
  FOR DELETE TO authenticated
  USING (
    team_id IS NOT NULL
    AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
  );

-- ----------------------------------------------------------------------------
-- baseball_lift_assignments — player reads OWN; staff manage scoped groups.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_lift_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_lift_assignments_select" ON public.baseball_lift_assignments;
DROP POLICY IF EXISTS "baseball_lift_assignments_insert" ON public.baseball_lift_assignments;
DROP POLICY IF EXISTS "baseball_lift_assignments_update" ON public.baseball_lift_assignments;
DROP POLICY IF EXISTS "baseball_lift_assignments_delete" ON public.baseball_lift_assignments;

-- A player sees only their OWN assignment rows; staff see rows for players they
-- may view (can_manage_baseball_lift_group with NULL player => team-wide staff).
CREATE POLICY "baseball_lift_assignments_select" ON public.baseball_lift_assignments
  FOR SELECT TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id = public.get_my_baseball_player_id())
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  );

CREATE POLICY "baseball_lift_assignments_insert" ON public.baseball_lift_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));

CREATE POLICY "baseball_lift_assignments_update" ON public.baseball_lift_assignments
  FOR UPDATE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id))
  WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id));

CREATE POLICY "baseball_lift_assignments_delete" ON public.baseball_lift_assignments
  FOR DELETE TO authenticated
  USING (public.can_manage_baseball_lift_group(team_id, player_id));

-- ----------------------------------------------------------------------------
-- baseball_lift_results — player INSERTs/reads OWN; staff read scoped; OTHER
--                         players can NEVER read a teammate's loads.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_lift_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_lift_results_select" ON public.baseball_lift_results;
DROP POLICY IF EXISTS "baseball_lift_results_insert" ON public.baseball_lift_results;
DROP POLICY IF EXISTS "baseball_lift_results_update" ON public.baseball_lift_results;
DROP POLICY IF EXISTS "baseball_lift_results_delete" ON public.baseball_lift_results;

-- SELECT: the row's own player, OR a strength/head coach scoped to that player.
-- A non-owning player can never satisfy can_manage_baseball_lift_group (it
-- requires can_manage_lifting), so teammates' loads stay private.
CREATE POLICY "baseball_lift_results_select" ON public.baseball_lift_results
  FOR SELECT TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  );

-- INSERT: the player logs only their OWN results (and only on their team), OR a
-- managing coach logs on a scoped player's behalf.
CREATE POLICY "baseball_lift_results_insert" ON public.baseball_lift_results
  FOR INSERT TO authenticated
  WITH CHECK (
    (player_id = public.get_my_baseball_player_id()
      AND public.is_baseball_team_member(team_id))
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  );

-- UPDATE: the owning player corrects their own log, OR a managing coach edits.
CREATE POLICY "baseball_lift_results_update" ON public.baseball_lift_results
  FOR UPDATE TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  )
  WITH CHECK (
    player_id = public.get_my_baseball_player_id()
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  );

-- DELETE: the owning player removes their own log, OR a managing coach.
CREATE POLICY "baseball_lift_results_delete" ON public.baseball_lift_results
  FOR DELETE TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR public.can_manage_baseball_lift_group(team_id, player_id)
  );

-- ----------------------------------------------------------------------------
-- baseball_readiness_checkins — player owns; staff read only with can_view_medical.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_readiness_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins;
DROP POLICY IF EXISTS "baseball_readiness_checkins_insert" ON public.baseball_readiness_checkins;
DROP POLICY IF EXISTS "baseball_readiness_checkins_update" ON public.baseball_readiness_checkins;
DROP POLICY IF EXISTS "baseball_readiness_checkins_delete" ON public.baseball_readiness_checkins;

-- SELECT: the owning player, OR staff WITH the can_view_medical health gate who
-- may view that player. Other players can never read (no path matches).
CREATE POLICY "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins
  FOR SELECT TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR (
      public.has_baseball_staff_capability(team_id, 'can_view_medical')
      AND public.can_view_baseball_player(team_id, player_id)
    )
  );

-- INSERT: a player records only their OWN check-in, on their own team.
CREATE POLICY "baseball_readiness_checkins_insert" ON public.baseball_readiness_checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id = public.get_my_baseball_player_id()
    AND public.is_baseball_team_member(team_id)
  );

-- UPDATE: a player edits only their OWN check-in (supports daily upsert).
CREATE POLICY "baseball_readiness_checkins_update" ON public.baseball_readiness_checkins
  FOR UPDATE TO authenticated
  USING (player_id = public.get_my_baseball_player_id())
  WITH CHECK (player_id = public.get_my_baseball_player_id());

-- DELETE: a player removes only their OWN check-in.
CREATE POLICY "baseball_readiness_checkins_delete" ON public.baseball_readiness_checkins
  FOR DELETE TO authenticated
  USING (player_id = public.get_my_baseball_player_id());

-- ============================================================================
-- GRANTS — authenticated (app) + service_role (cron/import). NEVER anon.
-- ============================================================================
REVOKE ALL ON public.baseball_exercises          FROM anon;
REVOKE ALL ON public.baseball_lift_assignments   FROM anon;
REVOKE ALL ON public.baseball_lift_results        FROM anon;
REVOKE ALL ON public.baseball_readiness_checkins FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_exercises          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_lift_assignments   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_lift_results        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_readiness_checkins TO authenticated;

GRANT ALL ON public.baseball_exercises          TO service_role;
GRANT ALL ON public.baseball_lift_assignments   TO service_role;
GRANT ALL ON public.baseball_lift_results        TO service_role;
GRANT ALL ON public.baseball_readiness_checkins TO service_role;
