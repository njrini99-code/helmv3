-- =============================================================================
-- Migration: 20260506120000_admin_rollup_explicit_caller.sql
-- Purpose:   Add an explicit-caller variant of the admin rollup RPCs so they
--            can be invoked from inside `unstable_cache` (Next.js 16) without
--            the service_role identity nullifying `auth.uid()` and tripping
--            the in-function admin gate (code=42501).
--
-- Background:
--   `cachedAdminDashboardData` in src/app/golf/actions/admin-data.ts wraps
--   `get_admin_dashboard_rollup` in `unstable_cache`. The cache body forbids
--   reading request-scoped state (cookies), so the user-scoped supabase-ssr
--   client cannot be constructed there — admin-data.ts uses
--   `createAdminClient()` (service_role) instead. Service_role JWTs leave
--   `auth.uid()` NULL, so the function's `users WHERE id = auth.uid() AND
--   role = 'admin'` predicate matches zero rows and the function aborts with
--   `RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'`. Production logs
--   showed 509 occurrences in ~1.5h after the perf fix unblocked the path.
--
-- Fix:
--   Both the dashboard and analytics rollups gain an overloaded variant that
--   accepts an explicit `p_user_id uuid` parameter. The admin gate uses that
--   parameter directly; the caller is responsible for supplying a verified
--   admin user_id (admin-data.ts already runs an outer auth gate via the
--   user-scoped client BEFORE entering the cache, so the verified id is in
--   hand).
--
--   The original zero-arg / auth.uid()-gated functions are kept so any
--   surface that already authenticates via the user JWT (e.g. direct
--   PostgREST RPC from a logged-in admin in dev tools) continues to work
--   unchanged. This migration is additive.
--
-- Idempotent:
--   * CREATE OR REPLACE FUNCTION — safe to re-run.
--
-- DO NOT APPLY YET — this migration is staged for review.  The accompanying
-- TypeScript change in admin-data.ts / rollup-c.ts must land in the same
-- deploy as this migration; deploying one without the other will either (a)
-- still 42501 (TS deployed without SQL) or (b) call a function that does not
-- exist (SQL behind on the runner).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dashboard rollup with explicit caller id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_rollup(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Delegate to the canonical zero-arg implementation by inlining a single
  -- temp setting trick: SECURITY DEFINER + SET LOCAL would let us spoof
  -- auth.uid(), but Postgres has no portable way to override `auth.uid()`
  -- inside a definer function. Instead we re-run the same body the zero-arg
  -- variant would run, but with the gate already cleared above.
  --
  -- We get there by calling the zero-arg variant with the gate disabled via
  -- a session-scoped GUC. A simpler approach: just call the zero-arg fn —
  -- but that re-evaluates auth.uid(). So we duplicate the SELECT block
  -- structurally by selecting from the same rollup CTEs the zero-arg fn
  -- builds, using the same query text. To keep this migration minimal and
  -- avoid drifting the two bodies, we instead set `request.jwt.claim.sub`
  -- inside the txn so auth.uid() resolves to p_user_id when we recurse.
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  SELECT public.get_admin_dashboard_rollup() INTO v_payload;
  RETURN v_payload;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_rollup(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_rollup(uuid) FROM anon, public;

COMMENT ON FUNCTION public.get_admin_dashboard_rollup(uuid) IS
  'Cached-path variant: takes an explicit caller user_id so the gate does not '
  'rely on auth.uid() (which is NULL when invoked via the service_role JWT '
  'from inside Next.js unstable_cache). Caller MUST verify admin role with '
  'the user-scoped client BEFORE entering the cache.';

-- ---------------------------------------------------------------------------
-- 2. Analytics rollup with explicit caller id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_analytics_rollup(
  p_user_id uuid,
  p_ago7d  timestamp with time zone,
  p_ago30d timestamp with time zone,
  p_ago12w timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Same pattern as get_admin_dashboard_rollup(uuid): set the JWT sub so the
  -- canonical 3-arg variant's auth.uid()-based gate resolves to the verified
  -- caller, then delegate. Avoids duplicating the long CTE body and keeps
  -- the two bodies from drifting.
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  SELECT public.get_admin_analytics_rollup(p_ago7d, p_ago30d, p_ago12w)
    INTO v_payload;

  RETURN v_payload;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_rollup(
  uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone
) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics_rollup(
  uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone
) FROM anon, public;

COMMENT ON FUNCTION public.get_admin_analytics_rollup(
  uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone
) IS
  'Explicit-caller variant — see get_admin_dashboard_rollup(uuid) for the '
  'same rationale. Caller MUST verify admin role with the user-scoped client '
  'before invoking.';
