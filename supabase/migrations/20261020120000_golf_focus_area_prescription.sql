-- CoachHelm supercharge Slice 4, the closed loop: prescription fields on
-- golf_player_focus_areas (/mnt/project-files/coachhelm/supercharge/
-- 04-output-specs-and-examples.md §1.3, 03-usefulness-and-system-design.md
-- §4.2-§4.3, 07-system-architecture.md §3).
--
-- WRITTEN, NOT APPLIED. HELD in supabase/migrations/HELD.md until the owner
-- applies it. The app reads and writes these columns only behind the
-- coachhelm_verdicts_v1 flag (off), and treats a missing column (42703 /
-- PGRST204) as "feature not available", so main may deploy before or after
-- this file without breaking a focus-area create or the lifecycle cron.
--
-- Columns (all nullable, no default, no backfill; existing rows stay NULL,
-- which the app reads as "no prescription recorded"):
--   baseline_n          attempts behind the read's rate at assignment
--   baseline_shrunk     (n·y + κ·μ)/(n + κ): the rate regression to the mean
--                       alone would deliver (02 §4); proportion 0-1 for
--                       percent metrics
--   criterion           { direction, threshold, unit, basis } (threshold a
--                       proportion for unit 'pct')
--   horizon             { attempts } | { rounds }
--   check_after_rounds  checkpoint cadence, default 3 written by the app
--   assigned_by         'coach' | 'engine' | 'player'
--   verdict             { word, post: { value, made, n, window_start,
--                       window_end }, lower_bound_90, upper_bound_90,
--                       expected_without_coaching, threshold, horizon,
--                       computed_at } written once by the lifecycle cron
--   drill_ids           golf_drills ids (no FK: an array cannot carry one;
--                       the app validates)
--
-- RLS: the existing golf_player_focus_areas policies cover the whole row.
-- golf_player_focus_areas_update_player lets a player PATCH any column of
-- their own row, so a BEFORE UPDATE guard keeps the loop honest: under the
-- `authenticated` role only a coach on the player's active team may change
-- the prescription columns, and nobody may change `verdict` (the cron writes
-- it with the service role). service_role and owner writes pass untouched.
-- No existing column, policy or grant changes; existing app writes never
-- touch these columns, so the guard never fires for them.

-- golf_player_focus_areas is live; do not queue behind a long transaction.
SET lock_timeout = '5s';

ALTER TABLE "public"."golf_player_focus_areas"
ADD COLUMN IF NOT EXISTS "baseline_n" bigint,
ADD COLUMN IF NOT EXISTS "baseline_shrunk" numeric,
ADD COLUMN IF NOT EXISTS "criterion" jsonb,
ADD COLUMN IF NOT EXISTS "horizon" jsonb,
ADD COLUMN IF NOT EXISTS "check_after_rounds" bigint,
ADD COLUMN IF NOT EXISTS "assigned_by" text,
ADD COLUMN IF NOT EXISTS "verdict" jsonb,
ADD COLUMN IF NOT EXISTS "drill_ids" uuid[];

-- Plain (validated) CHECKs, not NOT VALID, as in
-- 20260929120000_golf_team_members_availability.sql: every column they
-- check is added above in this migration, so every row is NULL and the scan
-- (27 rows in production, read-only count 2026-10-20) under the lock this
-- transaction already holds rejects nothing.
ALTER TABLE "public"."golf_player_focus_areas"
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_baseline_n_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_baseline_n_check"
CHECK (baseline_n IS NULL OR baseline_n >= 0),
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_check_after_rounds_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_check_after_rounds_check"
CHECK (check_after_rounds IS NULL OR check_after_rounds > 0),
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_assigned_by_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_assigned_by_check"
CHECK (assigned_by IS NULL OR assigned_by IN ('coach', 'engine', 'player')),
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_criterion_object_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_criterion_object_check"
CHECK (criterion IS NULL OR jsonb_typeof(criterion) = 'object'),
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_horizon_object_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_horizon_object_check"
CHECK (horizon IS NULL OR jsonb_typeof(horizon) = 'object'),
DROP CONSTRAINT IF EXISTS "golf_player_focus_areas_verdict_object_check",
-- Validated: new all-NULL column, nothing for the scan to reject.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT "golf_player_focus_areas_verdict_object_check"
CHECK (verdict IS NULL OR jsonb_typeof(verdict) = 'object');

CREATE OR REPLACE FUNCTION public.golf_focus_area_prescription_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- Only end-user writes are checked; the service role (cron, admin client)
  -- and the table owner pass.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.verdict IS DISTINCT FROM OLD.verdict THEN
    RAISE EXCEPTION 'golf_player_focus_areas.verdict is written by the engine only'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.baseline_n, NEW.baseline_shrunk, NEW.criterion, NEW.horizon,
      NEW.check_after_rounds, NEW.assigned_by, NEW.drill_ids)
     IS DISTINCT FROM
     (OLD.baseline_n, OLD.baseline_shrunk, OLD.criterion, OLD.horizon,
      OLD.check_after_rounds, OLD.assigned_by, OLD.drill_ids)
     AND NOT EXISTS (
       SELECT 1
       FROM public.golf_team_members gtm
       WHERE gtm.player_id = NEW.player_id
         AND gtm.status = 'active'
         AND public.is_golf_team_coach(gtm.team_id)
     ) THEN
    RAISE EXCEPTION 'golf_player_focus_areas prescription fields are set by the coach or the engine'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.golf_focus_area_prescription_guard() FROM public;

DROP TRIGGER IF EXISTS golf_focus_area_prescription_guard
ON public.golf_player_focus_areas;
CREATE TRIGGER golf_focus_area_prescription_guard
BEFORE UPDATE ON public.golf_player_focus_areas
FOR EACH ROW
EXECUTE FUNCTION public.golf_focus_area_prescription_guard();

COMMENT ON COLUMN "public"."golf_player_focus_areas"."baseline_n"
IS 'CoachHelm Slice 4: attempts (or rounds) behind baseline_value at assignment from a read. NULL = no prescription recorded.'; -- noqa: LT05
COMMENT ON COLUMN "public"."golf_player_focus_areas"."baseline_shrunk"
IS 'CoachHelm Slice 4: (n*y + kappa*mu)/(n + kappa), the rate regression to the mean alone would deliver; the verdict baseline. Proportion 0-1 for percent metrics.'; -- noqa: LT05
COMMENT ON COLUMN "public"."golf_player_focus_areas"."criterion"
IS 'CoachHelm Slice 4: { direction, threshold, unit, basis }. threshold is a proportion for unit pct.'; -- noqa: LT05
COMMENT ON COLUMN "public"."golf_player_focus_areas"."horizon"
IS 'CoachHelm Slice 4: { attempts } or { rounds } at which the verdict is computed.'; -- noqa: LT05
COMMENT ON COLUMN "public"."golf_player_focus_areas"."check_after_rounds"
IS 'CoachHelm Slice 4: checkpoint cadence in countable rounds (default 3).';
COMMENT ON COLUMN "public"."golf_player_focus_areas"."assigned_by"
IS 'CoachHelm Slice 4: coach | engine | player.';
COMMENT ON COLUMN "public"."golf_player_focus_areas"."verdict"
IS 'CoachHelm Slice 4: written once by the lifecycle cron at the horizon (one-sided 90% bound vs baseline_shrunk). Engine-only: a guard trigger refuses end-user changes.'; -- noqa: LT05
COMMENT ON COLUMN "public"."golf_player_focus_areas"."drill_ids"
IS 'CoachHelm Slice 4: golf_drills ids prescribed with the area (no FK; app-validated).'; -- noqa: LT05

-- ROLLBACK: DROP TRIGGER IF EXISTS golf_focus_area_prescription_guard ON public.golf_player_focus_areas; DROP FUNCTION IF EXISTS public.golf_focus_area_prescription_guard(); ALTER TABLE public.golf_player_focus_areas DROP COLUMN IF EXISTS baseline_n, DROP COLUMN IF EXISTS baseline_shrunk, DROP COLUMN IF EXISTS criterion, DROP COLUMN IF EXISTS horizon, DROP COLUMN IF EXISTS check_after_rounds, DROP COLUMN IF EXISTS assigned_by, DROP COLUMN IF EXISTS verdict, DROP COLUMN IF EXISTS drill_ids; -- noqa: LT05

-- VERIFY: select count(*) = 8 from information_schema.columns where table_schema = 'public' and table_name = 'golf_player_focus_areas' and column_name in ('baseline_n', 'baseline_shrunk', 'criterion', 'horizon', 'check_after_rounds', 'assigned_by', 'verdict', 'drill_ids'); -- noqa: LT05
-- VERIFY: select 1 from pg_trigger where tgname = 'golf_focus_area_prescription_guard' and tgrelid = 'public.golf_player_focus_areas'::regclass; -- noqa: LT05
-- VERIFY: select count(*) = 6 from pg_constraint where conrelid = 'public.golf_player_focus_areas'::regclass and conname in ('golf_player_focus_areas_baseline_n_check', 'golf_player_focus_areas_check_after_rounds_check', 'golf_player_focus_areas_assigned_by_check', 'golf_player_focus_areas_criterion_object_check', 'golf_player_focus_areas_horizon_object_check', 'golf_player_focus_areas_verdict_object_check'); -- noqa: LT05
-- VERIFY: select count(*) = 0 from public.golf_player_focus_areas where verdict is not null or criterion is not null; -- noqa: LT05
