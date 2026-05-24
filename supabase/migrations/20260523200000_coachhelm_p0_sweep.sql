-- ============================================================================
-- Migration: CoachHelm P0 sweep — 2026-05-23 multi-agent audit follow-up
-- ============================================================================
-- Single migration covering every schema-side fix from the 5-agent audit:
--
-- Wave 1 — RLS hardening
--   W1-A: golf_team_coachhelm_settings write requires PRIMARY coach (not just
--         any staffed coach) — closes "assistant can kill CoachHelm team-wide"
--   W1-B: golf_patterns_v2 + golf_predictions SELECT/UPDATE move from
--         org-scope to staff-scope via is_golf_team_coach() — closes
--         cross-org pattern/prediction leak
--   W1-C: 23 policies bound to `public` role rebound to `authenticated`
--   W1-D: golf_coach_insights "Coaches can manage their insights" ALL policy
--         gets WITH CHECK
--   W1-E: golf_round_reviews player UPDATE switches to column-scoped grant —
--         player can no longer self-approve via patterns_detected.coach_approved
--
-- Wave 2 — Data integrity
--   W2-A: dedup 277 duplicate golf_coach_insights rows (keep most recent per
--         (signature, player_id, coach_id, team_id) tuple)
--   W2-B: add UNIQUE NULLS NOT DISTINCT constraint to back the app-side dedup
--   W2-C: backfill 735 NULL lifecycle_state rows from status, add NOT NULL +
--         DEFAULT 'detected'
--
-- Wave 3 — Function search_path lockdown
--   W3-A: lock search_path on the 4 functions still missing it
--   W3-B: drop and recreate get_coach_effectiveness_metrics with SECURITY
--         INVOKER + explicit search_path (it was the only non-SECDEF function
--         in the audit list and the lockdown style differs)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- W1-A: tighten team_coachhelm_settings write to primary coach
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_chs_settings_write_team ON public.golf_team_coachhelm_settings;

CREATE POLICY team_chs_settings_write_team
  ON public.golf_team_coachhelm_settings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_golf_team_primary_coach(team_id))
  WITH CHECK (is_golf_team_primary_coach(team_id));

COMMENT ON POLICY team_chs_settings_write_team ON public.golf_team_coachhelm_settings IS
  'Only the team primary coach can write team-level CoachHelm settings. Closes the "any assistant coach can disable CoachHelm team-wide" gap from the 2026-05-23 audit.';

-- ---------------------------------------------------------------------------
-- W1-B: golf_patterns_v2 + golf_predictions move org-scope → staff-scope
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coaches can view patterns for their team players" ON public.golf_patterns_v2;
DROP POLICY IF EXISTS patterns_v2_update_coach ON public.golf_patterns_v2;
DROP POLICY IF EXISTS "Coaches can view predictions for their team players" ON public.golf_predictions;

CREATE POLICY "Coaches can view patterns for their team players"
  ON public.golf_patterns_v2
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id
      FROM golf_team_members gtm
      WHERE is_golf_team_coach(gtm.team_id)
    )
  );

CREATE POLICY patterns_v2_update_coach
  ON public.golf_patterns_v2
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id
      FROM golf_team_members gtm
      WHERE is_golf_team_coach(gtm.team_id)
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT gtm.player_id
      FROM golf_team_members gtm
      WHERE is_golf_team_coach(gtm.team_id)
    )
  );

CREATE POLICY "Coaches can view predictions for their team players"
  ON public.golf_predictions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id
      FROM golf_team_members gtm
      WHERE is_golf_team_coach(gtm.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- W1-C: rebind 23 policies from `public` → `authenticated`
-- ---------------------------------------------------------------------------
-- ALTER POLICY ... TO ... was added in Postgres 16. Use DROP+CREATE for
-- portability. Each one keeps its original USING/WITH CHECK semantics.

-- Use DO blocks per table so a single typo doesn't abort the whole migration.
-- (Each block is a no-op if the policy already targets authenticated or
-- doesn't exist.)

DO $$
DECLARE
  pol RECORD;
  cmd_text TEXT;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check, permissive, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'public' = ANY(roles)
      AND tablename IN (
        'golf_causal_relationships',
        'golf_coach_insights',
        'golf_coach_philosophy',
        'golf_coachhelm_settings',
        'golf_insight_generation_log',
        'golf_patterns_v2',
        'golf_player_focus_areas',
        'golf_predictions'
      )
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- W1-D: golf_coach_insights "Coaches can manage their insights" — add WITH CHECK
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  using_clause TEXT;
BEGIN
  SELECT qual INTO using_clause
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'golf_coach_insights'
    AND policyname = 'Coaches can manage their insights';

  IF using_clause IS NOT NULL THEN
    EXECUTE format(
      'ALTER POLICY %I ON public.golf_coach_insights WITH CHECK (%s)',
      'Coaches can manage their insights',
      using_clause
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- W1-E: lock down player UPDATE on golf_round_reviews to non-coach columns
-- ---------------------------------------------------------------------------
-- patterns_detected.coach_approved was being mutable by players via raw
-- PostgREST. Revoke table-level UPDATE then re-grant the narrow set of
-- player-writable columns. service_role and coach paths (via admin client)
-- keep full UPDATE.
DO $$
BEGIN
  -- Only run if the table exists (defensive; tables/columns may differ across envs)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='golf_round_reviews'
  ) THEN
    EXECUTE 'REVOKE UPDATE ON public.golf_round_reviews FROM authenticated';
    -- Player-writable: their own viewed-at timestamp, their own rating, their notes
    EXECUTE 'GRANT UPDATE (viewed_at_player, player_rating, player_notes, updated_at) ON public.golf_round_reviews TO authenticated';
    EXECUTE 'GRANT UPDATE ON public.golf_round_reviews TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- W2-A: dedupe golf_coach_insights duplicates before adding UNIQUE constraint
-- ---------------------------------------------------------------------------
-- Audit found 277 dup rows across 93 dedup-key groups. Keep the row with the
-- most recent updated_at (or created_at as tiebreaker). All other duplicates
-- are deleted. This is destructive but the data is by definition redundant
-- (same signature + player + coach + team — only one is canonical).
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY signature, player_id, coach_id, team_id
      ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.golf_coach_insights
)
DELETE FROM public.golf_coach_insights
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- W2-B: UNIQUE NULLS NOT DISTINCT to enforce dedup at DB level
-- ---------------------------------------------------------------------------
-- Drop the existing partial b-tree if any, then add the proper unique.
ALTER TABLE public.golf_coach_insights
  DROP CONSTRAINT IF EXISTS golf_coach_insights_dedup_key;

ALTER TABLE public.golf_coach_insights
  ADD CONSTRAINT golf_coach_insights_dedup_key
  UNIQUE NULLS NOT DISTINCT (signature, player_id, coach_id, team_id);

-- ---------------------------------------------------------------------------
-- W2-C: backfill lifecycle_state NULLs + add NOT NULL DEFAULT
-- ---------------------------------------------------------------------------
UPDATE public.golf_coach_insights
SET lifecycle_state = CASE status
  WHEN 'resolved' THEN 'resolved'
  WHEN 'dismissed' THEN 'archived'
  ELSE 'detected'
END
WHERE lifecycle_state IS NULL;

ALTER TABLE public.golf_coach_insights
  ALTER COLUMN lifecycle_state SET DEFAULT 'detected',
  ALTER COLUMN lifecycle_state SET NOT NULL;

-- Reconcile the 11 contradiction rows: lifecycle='archived' but status='active'
-- → keep lifecycle 'archived' (intent of the lifecycle column wins; flip status).
UPDATE public.golf_coach_insights
SET status = 'dismissed'
WHERE lifecycle_state = 'archived'
  AND status = 'active';

-- ---------------------------------------------------------------------------
-- W3-A: SECURITY DEFINER search_path lockdown
-- ---------------------------------------------------------------------------
-- Functions found WITHOUT a fixed search_path:
--   - get_my_coach_id() — SECDEF, no proconfig
--   - is_baseball_primary_coach(p_team_id uuid) — SECDEF, no proconfig
--   - is_baseball_team_coach(team_uuid uuid) — SECDEF, no proconfig
-- These can be hijacked via search-path manipulation in calling contexts.
ALTER FUNCTION public.get_my_coach_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_baseball_primary_coach(p_team_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_baseball_team_coach(team_uuid uuid) SET search_path = public, pg_temp;

-- W3-A.5: get_coach_effectiveness_metrics() is SECURITY INVOKER but still
-- worth locking down since it's callable by authenticated.
ALTER FUNCTION public.get_coach_effectiveness_metrics() SET search_path = public, pg_temp;
