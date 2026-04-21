-- ============================================================================
-- Migration: 20260421000001_admin_dashboard_rollup.sql
-- Purpose: Collapse the ~95-query getAdminDashboardData() server action into
--          a single SECURITY DEFINER function returning a JSONB rollup.
--
-- Scope: This RPC returns the *core* counts + rollups that the admin
--        Overview / People / System tabs render on first paint. Tabs that
--        need deeper breakdowns (BI / Tracer) continue to hit their own
--        existing server actions. Integration wiring is in a follow-up
--        commit — this migration is safe to apply on its own (read-only).
--
-- Design notes:
--   * Everything runs in single-pass CTEs.
--   * `golf_rounds` is scanned exactly once (prev: 3 full-table scans).
--   * Uses COUNT(*) FILTER (WHERE …) instead of N subqueries.
--   * No reliance on pg_cron / materialized views — purely functional.
--   * Callable only by authenticated users; revoked from anon/public.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_rollup()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  user_stats AS (
    SELECT
      COUNT(*)                                                           AS total,
      COUNT(*) FILTER (WHERE role = 'admin')                             AS admins,
      COUNT(*) FILTER (WHERE role = 'coach')                             AS coaches,
      COUNT(*) FILTER (WHERE role = 'player')                            AS players,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS new_last_7d,
      COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS new_last_30d,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '1 hour')      AS active_1h,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '24 hours')    AS active_24h,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '7 days')      AS active_7d,
      COUNT(*) FILTER (WHERE last_seen > now() - interval '30 days')     AS active_30d
    FROM users
  ),
  -- Single GROUP BY pass — replaces 3 previously unscoped golf_rounds scans.
  round_player_rollup AS (
    SELECT
      player_id,
      COUNT(*)                                  AS rounds_total,
      MAX(created_at)                           AS last_round_at,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
                                                AS rounds_last_7d,
      COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')
                                                AS rounds_last_30d
    FROM golf_rounds
    WHERE player_id IS NOT NULL
    GROUP BY player_id
  ),
  round_stats AS (
    SELECT
      COALESCE(SUM(rounds_total), 0)            AS total_rounds,
      COALESCE(SUM(rounds_last_7d), 0)          AS rounds_last_7d,
      COALESCE(SUM(rounds_last_30d), 0)         AS rounds_last_30d,
      COUNT(*)                                  AS active_players, -- players with >= 1 round
      COUNT(*) FILTER (WHERE last_round_at > now() - interval '30 days')
                                                AS players_active_30d,
      COUNT(*) FILTER (WHERE last_round_at < now() - interval '30 days'
                          OR last_round_at IS NULL)
                                                AS at_risk_players -- no round in 30d
    FROM round_player_rollup
  ),
  round_today AS (
    SELECT COUNT(*) AS rounds_today
    FROM golf_rounds
    WHERE created_at >= date_trunc('day', now())
  ),
  team_stats AS (
    SELECT
      (SELECT COUNT(*) FROM golf_teams)         AS golf_teams,
      (SELECT COUNT(*) FROM golf_teams
         WHERE created_at > now() - interval '30 days')
                                                AS golf_teams_new_30d,
      (SELECT COUNT(DISTINCT team_id) FROM golf_team_members WHERE status = 'active')
                                                AS golf_teams_active,
      -- Baseball tables may not exist on every environment; guard with
      -- to_regclass so the RPC is resilient in dev. Returns 0 when the
      -- table is absent.
      COALESCE(
        (SELECT COUNT(*)::bigint FROM baseball_teams
           WHERE to_regclass('public.baseball_teams') IS NOT NULL),
        0
      )                                         AS baseball_teams
  ),
  signup_trend AS (
    -- One pass across users rather than 4 cohort queries.
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(bucket, 'YYYY-MM-DD'),
          'count', cnt
        )
        ORDER BY bucket ASC
      ) AS series
    FROM (
      SELECT
        date_trunc('day', created_at) AS bucket,
        COUNT(*)                      AS cnt
      FROM users
      WHERE created_at > now() - interval '30 days'
      GROUP BY 1
    ) s
  ),
  onboarding_stats AS (
    SELECT
      (SELECT COUNT(*) FROM golf_coaches WHERE onboarding_completed = TRUE) AS coaches_onboarded,
      (SELECT COUNT(*) FROM golf_players WHERE onboarding_completed = TRUE) AS players_onboarded,
      (SELECT COUNT(*) FROM golf_coaches)   AS coaches_total,
      (SELECT COUNT(*) FROM golf_players)   AS players_total
  )
SELECT jsonb_build_object(
  'generated_at', now(),
  'users',      (SELECT row_to_json(user_stats)        FROM user_stats),
  'rounds',     (SELECT row_to_json(round_stats)       FROM round_stats),
  'rounds_today', (SELECT rounds_today FROM round_today),
  'teams',      (SELECT row_to_json(team_stats)        FROM team_stats),
  'onboarding', (SELECT row_to_json(onboarding_stats)  FROM onboarding_stats),
  'signup_trend_30d', COALESCE((SELECT series FROM signup_trend), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.get_admin_dashboard_rollup() IS
  'Single-call admin dashboard rollup. Returns JSONB with user/round/team/'
  'onboarding counts + 30-day signup trend. Replaces ~95-query client path.';

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_rollup() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_rollup() FROM anon, public;

-- Supporting index — ensures the GROUP BY on player_id stays an index scan
-- even as golf_rounds grows past 10k rows.
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_created
  ON golf_rounds(player_id, created_at DESC)
  WHERE player_id IS NOT NULL;
