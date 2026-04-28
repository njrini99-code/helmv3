-- =============================================================================
-- Admin Shot Data Quality RPC — 2026-04-28
--
-- Collapses four `head: true` count round-trips on `golf_shots` into a single
-- conditional-aggregation SELECT. The admin dashboard's data-quality block
-- previously issued:
--   1. count(*) of all shots
--   2. count(*) where distance_to_hole_before IS NOT NULL
--   3. count(*) where lie_before IS NOT NULL
--   4. count(*) where club_type IS NOT NULL
-- which meant four separate scans of golf_shots on every dashboard load.
-- This RPC returns the same numbers (rephrased as missing counts so the SELECT
-- is symmetric) in one round-trip.
--
-- Caller (admin-data.ts) derives shotsWithX = total - missingX, preserving the
-- existing assembleAdminDashboardData / dataQuality shape.
--
-- SECURITY DEFINER + admin gate mirroring get_db_telemetry (see
-- 20260428200000_get_db_telemetry.sql). Service-role JWT bypasses the user
-- check; authenticated callers must have role='admin' in public.users.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_shot_data_quality()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_total bigint;
  v_missing_distance bigint;
  v_missing_lie bigint;
  v_missing_club bigint;
BEGIN
  -- Auth gate: allow service_role unconditionally; otherwise require admin.
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Single scan of golf_shots with conditional aggregation. Postgres evaluates
  -- the FILTER predicates against each row exactly once, so this is strictly
  -- cheaper than the four separate count(head=true) queries the action layer
  -- used to issue.
  SELECT
    count(*),
    count(*) FILTER (WHERE distance_to_hole_before IS NULL),
    count(*) FILTER (WHERE lie_before IS NULL),
    count(*) FILTER (WHERE club_type IS NULL)
  INTO v_total, v_missing_distance, v_missing_lie, v_missing_club
  FROM golf_shots;

  RETURN jsonb_build_object(
    'total_shots',             COALESCE(v_total, 0),
    'missing_distance_before', COALESCE(v_missing_distance, 0),
    'missing_lie_before',      COALESCE(v_missing_lie, 0),
    'missing_club_type',       COALESCE(v_missing_club, 0)
  );
END;
$$;

-- Lock down execution. Only authenticated callers (admin gate inside body) and
-- service_role may execute. anon/public are denied at the GRANT layer too.
REVOKE ALL ON FUNCTION public.get_shot_data_quality() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shot_data_quality() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_shot_data_quality() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_shot_data_quality() TO service_role;

COMMENT ON FUNCTION public.get_shot_data_quality() IS
  'Admin-only shot telemetry data-quality counts: total shots plus rows '
  'missing distance_to_hole_before / lie_before / club_type. One scan of '
  'golf_shots via conditional aggregation; replaces four head-count queries '
  'that admin-data.ts used to issue per dashboard load. Service role bypasses '
  'the user-role gate.';
