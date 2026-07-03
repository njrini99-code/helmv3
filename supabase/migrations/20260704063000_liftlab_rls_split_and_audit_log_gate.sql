-- =============================================================================
-- Lift Lab RLS Split + Audit Log Admin Gate
-- Migration: 20260704063000_liftlab_rls_split_and_audit_log_gate.sql
--
-- NOT YET APPLIED TO PROD — morning-gated (auto-mode policy): apply via MCP after review.
--
-- Fixes three verified live-prod defects. All predicates below were copied
-- verbatim from `pg_policies.qual` / `pg_policies.with_check` on the current
-- prod database — no new access logic was invented.
--
-- -----------------------------------------------------------------------------
-- DEFECT 1 (high) — FOR ALL policies collapse SELECT-level access into DELETE
-- -----------------------------------------------------------------------------
-- supabase/migrations/20260625000010_helm_lifting_data_library_programs.sql
-- (hlw_all/hld_all/hlsec_all/hlpr_all, ~lines 421-478) and
-- supabase/migrations/20260625000020_helm_lifting_data_sessions_readiness.sql
-- (hlirw_all, ~lines 754-757) each define a single `FOR ALL` policy whose
-- USING clause is the *view* predicate (helm_lifting_can_view_org) but whose
-- WITH CHECK clause is the *edit* predicate (helm_lifting_can_edit_org).
-- Postgres never evaluates WITH CHECK for DELETE — only USING — so any
-- view-only org viewer (helm_lifting_can_view_org true, helm_lifting_can_edit_org
-- false) can DELETE rows from these tables despite having read-only access.
--
-- Confirmed via live pg_policies: of the tables named in the ticket
-- (programs/weeks/days/sections/exercises/prescriptions/exercise_substitutions),
-- only weeks/days/sections/prescriptions are still on the collapsed FOR ALL
-- policy — programs/exercises/exercise_substitutions were already split into
-- select/insert/update/delete in the same migration and need no change here.
-- helm_lifting_import_rows (hlirw_all) is a sibling table with the identical
-- defective pattern and is fixed for the same reason.
--
-- Fix: replace each FOR ALL policy with four policies — SELECT keeps the
-- existing view predicate; INSERT/UPDATE/DELETE all use the existing edit
-- predicate (UPDATE keeps both USING and WITH CHECK on it).
--
-- -----------------------------------------------------------------------------
-- DEFECT 2 (medium) — soreness_maps / readiness_checkins missing coach fallback
-- -----------------------------------------------------------------------------
-- supabase/migrations/20260625000020_helm_lifting_data_sessions_readiness.sql:609
-- helm_lifting_soreness_maps DELETE (hlsm_delete) and UPDATE (hlsm_update), and
-- helm_lifting_readiness_checkins DELETE (hlrc_delete) are gated only on
-- helm_lifting_is_my_athlete(athlete_id) — unlike their own INSERT/SELECT
-- siblings (and the UPDATE sibling on readiness_checkins), which also allow
-- helm_lifting_can_edit_org(organization_id). A coach correcting or removing
-- an athlete's soreness/readiness data therefore silently affects 0 rows.
--
-- Fix: add the `OR helm_lifting_can_edit_org(organization_id)` fallback to
-- these three policies, keeping the existing athlete-self predicate.
--
-- -----------------------------------------------------------------------------
-- DEFECT 3 (critical) — get_audit_log_recent() has no admin check
-- -----------------------------------------------------------------------------
-- public.get_audit_log_recent(limit_count integer DEFAULT 50) is
-- SECURITY DEFINER, STABLE, SET search_path = 'public', and EXECUTE is
-- granted to `authenticated` (confirmed live: has_function_privilege
-- ('authenticated', 'public.get_audit_log_recent(integer)', 'EXECUTE') = true;
-- `anon` has no grant). Its body (from pg_proc.prosrc) performs zero access
-- checks before selecting the full audit_log joined to users.email — any
-- logged-in user (coach, player, org viewer) can read the entire audit trail
-- for every organization, including other users' emails.
--
-- Fix: CREATE OR REPLACE with an identical signature/return/search_path,
-- prefixed with the same admin-check pattern already used elsewhere in this
-- codebase (see supabase/migrations/20260527000000_prod_public_baseline.sql
-- lines 245-248, 488-491, 771-774, 995-998): `IF NOT EXISTS (SELECT 1 FROM
-- users WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION
-- 'Forbidden' USING ERRCODE = '42501'; END IF;`. Grants are left unchanged
-- (authenticated keeps EXECUTE; anon still has none) — the function itself
-- now refuses non-admins.
-- =============================================================================

-- ===========================================================================
-- DEFECT 1 — split FOR ALL policies
-- ===========================================================================

-- helm_lifting_weeks --------------------------------------------------------
DROP POLICY IF EXISTS hlw_all ON public.helm_lifting_weeks;
DROP POLICY IF EXISTS hlw_select ON public.helm_lifting_weeks;
DROP POLICY IF EXISTS hlw_insert ON public.helm_lifting_weeks;
DROP POLICY IF EXISTS hlw_update ON public.helm_lifting_weeks;
DROP POLICY IF EXISTS hlw_delete ON public.helm_lifting_weeks;

CREATE POLICY hlw_select ON public.helm_lifting_weeks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ));

CREATE POLICY hlw_insert ON public.helm_lifting_weeks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlw_update ON public.helm_lifting_weeks FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlw_delete ON public.helm_lifting_weeks FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_programs p
    WHERE p.id = program_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

-- helm_lifting_days -----------------------------------------------------------
DROP POLICY IF EXISTS hld_all ON public.helm_lifting_days;
DROP POLICY IF EXISTS hld_select ON public.helm_lifting_days;
DROP POLICY IF EXISTS hld_insert ON public.helm_lifting_days;
DROP POLICY IF EXISTS hld_update ON public.helm_lifting_days;
DROP POLICY IF EXISTS hld_delete ON public.helm_lifting_days;

CREATE POLICY hld_select ON public.helm_lifting_days FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ));

CREATE POLICY hld_insert ON public.helm_lifting_days FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hld_update ON public.helm_lifting_days FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hld_delete ON public.helm_lifting_days FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_weeks w
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE w.id = week_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

-- helm_lifting_sections -------------------------------------------------------
DROP POLICY IF EXISTS hlsec_all ON public.helm_lifting_sections;
DROP POLICY IF EXISTS hlsec_select ON public.helm_lifting_sections;
DROP POLICY IF EXISTS hlsec_insert ON public.helm_lifting_sections;
DROP POLICY IF EXISTS hlsec_update ON public.helm_lifting_sections;
DROP POLICY IF EXISTS hlsec_delete ON public.helm_lifting_sections;

CREATE POLICY hlsec_select ON public.helm_lifting_sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ));

CREATE POLICY hlsec_insert ON public.helm_lifting_sections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlsec_update ON public.helm_lifting_sections FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlsec_delete ON public.helm_lifting_sections FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_days d
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE d.id = lift_day_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

-- helm_lifting_prescriptions --------------------------------------------------
DROP POLICY IF EXISTS hlpr_all ON public.helm_lifting_prescriptions;
DROP POLICY IF EXISTS hlpr_select ON public.helm_lifting_prescriptions;
DROP POLICY IF EXISTS hlpr_insert ON public.helm_lifting_prescriptions;
DROP POLICY IF EXISTS hlpr_update ON public.helm_lifting_prescriptions;
DROP POLICY IF EXISTS hlpr_delete ON public.helm_lifting_prescriptions;

CREATE POLICY hlpr_select ON public.helm_lifting_prescriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_view_org(p.organization_id, p.sport)
  ));

CREATE POLICY hlpr_insert ON public.helm_lifting_prescriptions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlpr_update ON public.helm_lifting_prescriptions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

CREATE POLICY hlpr_delete ON public.helm_lifting_prescriptions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.helm_lifting_sections s
    JOIN public.helm_lifting_days d ON d.id = s.lift_day_id
    JOIN public.helm_lifting_weeks w ON w.id = d.week_id
    JOIN public.helm_lifting_programs p ON p.id = w.program_id
    WHERE s.id = section_id AND public.helm_lifting_can_edit_org(p.organization_id)
  ));

-- helm_lifting_import_rows (sibling FOR ALL pattern) ---------------------------
DROP POLICY IF EXISTS hlirw_all ON public.helm_lifting_import_rows;
DROP POLICY IF EXISTS hlirw_select ON public.helm_lifting_import_rows;
DROP POLICY IF EXISTS hlirw_insert ON public.helm_lifting_import_rows;
DROP POLICY IF EXISTS hlirw_update ON public.helm_lifting_import_rows;
DROP POLICY IF EXISTS hlirw_delete ON public.helm_lifting_import_rows;

CREATE POLICY hlirw_select ON public.helm_lifting_import_rows FOR SELECT TO authenticated
  USING (public.helm_lifting_can_view_org(organization_id, sport));

CREATE POLICY hlirw_insert ON public.helm_lifting_import_rows FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlirw_update ON public.helm_lifting_import_rows FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlirw_delete ON public.helm_lifting_import_rows FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- ===========================================================================
-- DEFECT 2 — add coach can_edit_org fallback to soreness_maps DELETE/UPDATE
-- and readiness_checkins DELETE
-- ===========================================================================

-- helm_lifting_soreness_maps ---------------------------------------------------
DROP POLICY IF EXISTS hlsm_update ON public.helm_lifting_soreness_maps;
CREATE POLICY hlsm_update ON public.helm_lifting_soreness_maps FOR UPDATE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  )
  WITH CHECK (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

DROP POLICY IF EXISTS hlsm_delete ON public.helm_lifting_soreness_maps;
CREATE POLICY hlsm_delete ON public.helm_lifting_soreness_maps FOR DELETE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- helm_lifting_readiness_checkins ----------------------------------------------
DROP POLICY IF EXISTS hlrc_delete ON public.helm_lifting_readiness_checkins;
CREATE POLICY hlrc_delete ON public.helm_lifting_readiness_checkins FOR DELETE TO authenticated
  USING (
    public.helm_lifting_is_my_athlete(athlete_id)
    OR public.helm_lifting_can_edit_org(organization_id)
  );

-- ===========================================================================
-- DEFECT 3 — gate get_audit_log_recent() to admins only
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_audit_log_recent(limit_count integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(a), '[]'::json) INTO result
  FROM (
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.table_name,
      al.record_id,
      al.old_data,
      al.new_data,
      al.ip_address,
      al.created_at,
      u.email as user_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT limit_count
  ) a;

  RETURN result;
END;
$function$;
-- Grants unchanged: authenticated keeps EXECUTE (confirmed live via
-- has_function_privilege); anon has never had a grant on this function.
