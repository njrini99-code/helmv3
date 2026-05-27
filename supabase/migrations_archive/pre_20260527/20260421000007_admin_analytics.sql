-- ============================================================================
-- Migration: 20260421000007_admin_analytics.sql
-- Purpose:   Slice C of the getAdminDashboardData() refactor.
--            Consolidates Batch-5 enhanced-analytics queries (L3195-L4640 in
--            admin-data.ts) into ONE RPC: get_admin_analytics_rollup.
--
-- Scope (the tables this RPC owns):
--   * admin_analytics_events    — session heatmap, feature usage, dead features
--   * golf_coach_insights       — coach intelligence (insights viewed)
--   * golf_round_reviews        — coach intelligence (review rate, response time)
--   * golf_insight_generation_log — per-player insight counts
--   * golf_teams                — team.season lookup for userActivity
--   * admin_events              — errorDetection (error/critical severities)
--   * error_logs                — 24h error count (detailed groupings stay in
--                                 Slice B / caller — we only need the 24h number)
--
-- Deliberately NOT scanned here (Slice A's C1 RPC already scans these):
--   * golf_rounds               — caller passes `allRoundsMinimal` for the
--                                 last 12 weeks; no second full-table scan.
--
-- Supporting joins we DO need (required to assemble userActivity, freshnessAlerts,
-- benchmarks, coachIntelligence WITHOUT leaning on Slice A's TS-side maps):
--   * users                     — email / role / last_seen / created_at
--   * golf_players              — first/last name, onboarding, user_id
--   * golf_coaches              — name, org_id, onboarding, user_id
--   * golf_team_members (status='active') — player→team assignment
--   * golf_player_stats_cache   — per-player scoring_average, driving_accuracy,
--                                 gir, putts_per_round
--   * golf_coach_philosophy     — AI-configured coach set
--   * organizations             — team.organization_id name resolution (future)
--
-- Schema traps honored:
--   * golf_coaches has NO team_id. Link via organization_id == golf_teams.organization_id.
--   * golf_players has NO team_id. Link via golf_team_members (active).
--   * admin_events.severity uses admin_event_severity enum ('error','critical',…).
--   * error_logs.created_at is nullable; filter accordingly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_analytics_rollup(
  p_ago7d  timestamptz,
  p_ago30d timestamptz,
  p_ago12w timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Admin-role gate (mirrors migration 00004's pattern).
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
    -- ---------------------------------------------------------------------
    -- 1. ANALYTICS EVENTS (raw, last 7d) — session heatmap is too complex
    --    to aggregate purely in SQL (session duration requires min/max per
    --    session across thousands of rows). Return raw rows bounded to 7d
    --    so TS post-processing handles the complex grouping.
    -- ---------------------------------------------------------------------
    analytics_raw AS (
      SELECT
        event_type,
        page_path,
        feature_name,
        session_id,
        user_id,
        created_at,
        duration_ms
      FROM admin_analytics_events
      WHERE created_at >= p_ago7d
    ),
    analytics_events_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'event_type',   event_type,
            'page_path',    page_path,
            'feature_name', feature_name,
            'session_id',   session_id,
            'user_id',      user_id,
            'created_at',   created_at,
            'duration_ms',  duration_ms
          )
        ),
        '[]'::jsonb
      ) AS events
      FROM analytics_raw
    ),

    -- ---------------------------------------------------------------------
    -- 2. COACH INSIGHTS VIEWED (per coach: total + last-at)
    -- ---------------------------------------------------------------------
    coach_insight_rollup AS (
      SELECT
        coach_id,
        COUNT(*)::int     AS total_insights,
        MAX(created_at)   AS last_insight_at
      FROM golf_coach_insights
      WHERE coach_id IS NOT NULL
      GROUP BY coach_id
    ),
    coach_insight_rollup_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'coach_id',        coach_id,
            'total_insights',  total_insights,
            'last_insight_at', last_insight_at
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM coach_insight_rollup
    ),

    -- ---------------------------------------------------------------------
    -- 3. ROUND REVIEWS (with round join for response time, capped at 30 days)
    --    We emit per-coach review counts + response-time arrays, plus per-
    --    player review counts (used by userActivity).
    -- ---------------------------------------------------------------------
    round_reviews_joined AS (
      SELECT
        rr.published_by,
        rr.round_id,
        rr.created_at AS review_at,
        gr.player_id,
        gr.created_at AS round_at
      FROM golf_round_reviews rr
      LEFT JOIN golf_rounds gr ON gr.id = rr.round_id
    ),
    coach_review_rollup AS (
      SELECT
        published_by                                                  AS coach_id,
        COUNT(*)::int                                                 AS reviews,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0)
            FILTER (
              WHERE round_at IS NOT NULL
                AND review_at IS NOT NULL
                AND review_at >= round_at
                AND EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0 < 720
            ),
          NULL
        )                                                             AS avg_response_hours
      FROM round_reviews_joined
      WHERE published_by IS NOT NULL
      GROUP BY published_by
    ),
    coach_review_rollup_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'coach_id',           coach_id,
            'reviews',            reviews,
            'avg_response_hours', CASE
              WHEN avg_response_hours IS NULL THEN NULL
              ELSE ROUND(avg_response_hours::numeric, 2)
            END
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM coach_review_rollup
    ),
    player_review_rollup AS (
      SELECT
        player_id,
        COUNT(*)::int AS reviews
      FROM round_reviews_joined
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ),
    player_review_rollup_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('player_id', player_id, 'reviews', reviews)
        ),
        '[]'::jsonb
      ) AS rows
      FROM player_review_rollup
    ),
    players_with_reviews_json AS (
      SELECT COALESCE(
        jsonb_agg(DISTINCT player_id),
        '[]'::jsonb
      ) AS ids
      FROM round_reviews_joined
      WHERE player_id IS NOT NULL
    ),

    -- ---------------------------------------------------------------------
    -- 4. INSIGHT GENERATION LOG — per-player insight counts
    -- ---------------------------------------------------------------------
    player_insight_rollup AS (
      SELECT
        player_id,
        SUM(COALESCE(insights_generated, 1))::int AS insights
      FROM golf_insight_generation_log
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ),
    player_insight_rollup_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('player_id', player_id, 'insights', insights)
        ),
        '[]'::jsonb
      ) AS rows
      FROM player_insight_rollup
    ),

    -- ---------------------------------------------------------------------
    -- 5. TEAMS + seasons
    -- ---------------------------------------------------------------------
    teams_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',              id,
            'name',            name,
            'season',          season,
            'organization_id', organization_id
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM golf_teams
    ),

    -- ---------------------------------------------------------------------
    -- 6. ACTIVE TEAM MEMBERSHIPS — player→team map (current roster)
    -- ---------------------------------------------------------------------
    team_members_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('player_id', player_id, 'team_id', team_id)
        ),
        '[]'::jsonb
      ) AS rows
      FROM golf_team_members
      WHERE status = 'active'
    ),

    -- ---------------------------------------------------------------------
    -- 7. PLAYERS / COACHES / USERS — needed to assemble team rosters + user
    --    activity + funnel without relying on Slice A's TS-side maps.
    -- ---------------------------------------------------------------------
    players_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',                   id,
            'user_id',              user_id,
            'first_name',           first_name,
            'last_name',            last_name,
            'onboarding_completed', COALESCE(onboarding_completed, false)
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM golf_players
    ),
    coaches_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',                   id,
            'user_id',              user_id,
            'full_name',            full_name,
            'organization_id',      organization_id,
            'onboarding_completed', COALESCE(onboarding_completed, false)
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM golf_coaches
    ),
    users_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',         id,
            'email',      email,
            'role',       role::text,
            'created_at', created_at,
            'last_seen',  last_seen
          )
          ORDER BY created_at DESC NULLS LAST
        ),
        '[]'::jsonb
      ) AS rows
      FROM users
    ),

    -- ---------------------------------------------------------------------
    -- 8. COACH PHILOSOPHY — AI-configured coach IDs (for philosophyConfigured
    --    flag on coachIntelligence + aiCorrelation sets).
    -- ---------------------------------------------------------------------
    philosophy_coach_ids AS (
      SELECT COALESCE(
        jsonb_agg(DISTINCT coach_id),
        '[]'::jsonb
      ) AS ids
      FROM golf_coach_philosophy
      WHERE coach_id IS NOT NULL
    ),

    -- ---------------------------------------------------------------------
    -- 9. PLAYER STATS CACHE — scoring_average + key pct stats for benchmarks.
    -- ---------------------------------------------------------------------
    player_stats_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'player_id',          player_id,
            'first_name',         gp.first_name,
            'last_name',          gp.last_name,
            'scoring_average',    scoring_average,
            'driving_accuracy',   driving_accuracy_percentage,
            'gir_percentage',     gir_percentage,
            'putts_per_round',    putts_per_round,
            'rounds_played',      rounds_played
          )
        ),
        '[]'::jsonb
      ) AS rows
      FROM golf_player_stats_cache psc
      LEFT JOIN golf_players gp ON gp.id = psc.player_id
    ),

    -- ---------------------------------------------------------------------
    -- 10. ERROR DETECTION — 24h error count, and admin_events (error/critical)
    --     recent slice. `rawErrorLogs` detailed grouping stays in Slice B.
    -- ---------------------------------------------------------------------
    error_count_24h AS (
      SELECT COUNT(*)::int AS errors_24h
      FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= (now() - interval '24 hours')
    ),
    error_count_7d AS (
      SELECT COUNT(*)::int AS errors_7d
      FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= p_ago7d
    ),
    admin_error_events AS (
      SELECT
        id,
        event_type,
        severity::text AS severity,
        COALESCE(resolved, false) AS resolved,
        created_at
      FROM admin_events
      WHERE severity::text IN ('error', 'critical')
    ),
    admin_error_events_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id',         id,
            'event_type', event_type,
            'severity',   severity,
            'resolved',   resolved,
            'created_at', created_at
          )
        ),
        '[]'::jsonb
      ) AS rows,
      COALESCE(
        SUM(CASE WHEN NOT resolved THEN 1 ELSE 0 END),
        0
      )::int AS unresolved
      FROM admin_error_events
    )

  SELECT jsonb_build_object(
    'generated_at',            now(),
    'ago7d',                   p_ago7d,
    'ago30d',                  p_ago30d,
    'ago12w',                  p_ago12w,
    'analyticsEvents',         (SELECT events FROM analytics_events_json),
    'coachInsightRollup',      (SELECT rows   FROM coach_insight_rollup_json),
    'coachReviewRollup',       (SELECT rows   FROM coach_review_rollup_json),
    'playerReviewRollup',      (SELECT rows   FROM player_review_rollup_json),
    'playersWithReviews',      (SELECT ids    FROM players_with_reviews_json),
    'playerInsightRollup',     (SELECT rows   FROM player_insight_rollup_json),
    'teams',                   (SELECT rows   FROM teams_json),
    'teamMembers',             (SELECT rows   FROM team_members_json),
    'players',                 (SELECT rows   FROM players_json),
    'coaches',                 (SELECT rows   FROM coaches_json),
    'users',                   (SELECT rows   FROM users_json),
    'philosophyCoachIds',      (SELECT ids    FROM philosophy_coach_ids),
    'playerStats',             (SELECT rows   FROM player_stats_json),
    'errors24h',               (SELECT errors_24h FROM error_count_24h),
    'errors7d',                (SELECT errors_7d  FROM error_count_7d),
    'adminErrorEvents',        (SELECT rows FROM admin_error_events_json),
    'adminErrorEventsUnresolved', (SELECT unresolved FROM admin_error_events_json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_admin_analytics_rollup(timestamptz, timestamptz, timestamptz) IS
  'Slice C of admin dashboard refactor: consolidates Batch-5 enhanced analytics '
  '(admin_analytics_events, golf_coach_insights, golf_round_reviews, '
  'golf_insight_generation_log, golf_teams, admin_events, error_logs) into one '
  'JSONB payload. Caller supplies allRoundsMinimal separately to avoid a second '
  'golf_rounds scan (Slice A''s C1 RPC already emits it).';

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_rollup(timestamptz, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics_rollup(timestamptz, timestamptz, timestamptz) FROM anon, public;

-- Supporting indexes — keep the per-coach / per-player aggregations on
-- index scans even as volumes grow.
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_coach_created
  ON golf_coach_insights(coach_id, created_at DESC)
  WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_published_created
  ON golf_round_reviews(published_by, created_at DESC)
  WHERE published_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_gen_log_player
  ON golf_insight_generation_log(player_id)
  WHERE player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_analytics_events_created
  ON admin_analytics_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_events_severity_created
  ON admin_events(severity, created_at DESC);
