-- =============================================================================
-- Migration: 20260506000000_admin_rollup_window_perf.sql
-- Purpose:   Reduce wall-time of public.get_admin_analytics_rollup which has
--            been hitting Postgres statement_timeout (code=57014, 13
--            occurrences in the latest incident window) when the admin
--            dashboard loads at /golf/admin.
--
-- Diagnosis:
--   The function previously aggregated golf_round_reviews JOIN golf_rounds,
--   golf_coach_insights, and golf_insight_generation_log over their entire
--   history. golf_round_reviews + golf_rounds is the dominant cost: it joins
--   ALL reviews to ALL rounds (no time bound) just to compute per-coach and
--   per-player counts and a 30-day average response time. As soon as those
--   tables crossed ~50k rows the join stopped fitting inside the 8000 ms
--   timeout. The 20260424015134 perf pass already scoped admin_error_events
--   to p_ago30d but left the review/insight rollups unbounded.
--
-- Fix:
--   1. Scope `round_reviews_joined` to p_ago12w (matches the 12-week window
--      the rest of the function already operates on — admin dashboard never
--      surfaces older review counts in a way the user can act on).
--   2. Scope `coach_insight_rollup` and `player_insight_rollup` to p_ago12w
--      for the same reason. last_insight_at within the window is what drives
--      the disengagedCoaches alert (which only flags >= 7 days idle anyway).
--   3. Add a supporting partial index on golf_round_reviews(created_at) so
--      the new time-bounded scan is index-driven instead of seq.
--
-- Idempotent:
--   * CREATE OR REPLACE FUNCTION — safe to re-run.
--   * CREATE INDEX CONCURRENTLY IF NOT EXISTS — safe to re-run.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction. If
-- the runner wraps this file in a single BEGIN/COMMIT it will fail with
-- 25001. Apply the function update and the index in separate statements
-- (the Supabase MCP `apply_migration` tool does this automatically).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_analytics_rollup(
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
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
    analytics_raw AS (
      SELECT event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms
      FROM admin_analytics_events WHERE created_at >= p_ago7d
    ),
    analytics_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'event_type', event_type, 'page_path', page_path, 'feature_name', feature_name,
        'session_id', session_id, 'user_id', user_id, 'created_at', created_at, 'duration_ms', duration_ms
      )), '[]'::jsonb) AS events FROM analytics_raw
    ),

    -- PERF FIX: scope coach insight rollup to last 12 weeks (matches the
    -- rest of the function's window; disengagedCoaches alert only acts on
    -- last_insight_at within recent activity).
    coach_insight_rollup AS (
      SELECT coach_id, COUNT(*)::int AS total_insights, MAX(created_at) AS last_insight_at
      FROM golf_coach_insights
      WHERE coach_id IS NOT NULL
        AND created_at >= p_ago12w
      GROUP BY coach_id
    ),
    coach_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'total_insights', total_insights, 'last_insight_at', last_insight_at
      )), '[]'::jsonb) AS rows FROM coach_insight_rollup
    ),

    -- PERF FIX: scope round_reviews_joined to last 12 weeks. Was previously
    -- joining ALL golf_round_reviews × golf_rounds (no time bound), which
    -- was the dominant cost in the function — pushing wall time over the
    -- 8000ms statement_timeout. The downstream consumers (per-coach review
    -- counts, per-player review counts, 30-day-bounded avg response time)
    -- all only need the recent window.
    round_reviews_joined AS (
      SELECT rr.published_by, rr.round_id, rr.created_at AS review_at,
             gr.player_id, gr.created_at AS round_at
      FROM golf_round_reviews rr
      LEFT JOIN golf_rounds gr ON gr.id = rr.round_id
      WHERE rr.created_at >= p_ago12w
    ),
    coach_review_rollup AS (
      SELECT published_by AS coach_id, COUNT(*)::int AS reviews,
        COALESCE(AVG(EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0)
          FILTER (WHERE round_at IS NOT NULL AND review_at IS NOT NULL
            AND review_at >= round_at
            AND EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0 < 720), NULL) AS avg_response_hours
      FROM round_reviews_joined WHERE published_by IS NOT NULL GROUP BY published_by
    ),
    coach_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'reviews', reviews,
        'avg_response_hours', CASE WHEN avg_response_hours IS NULL THEN NULL ELSE ROUND(avg_response_hours::numeric, 2) END
      )), '[]'::jsonb) AS rows FROM coach_review_rollup
    ),
    player_review_rollup AS (
      SELECT player_id, COUNT(*)::int AS reviews
      FROM round_reviews_joined WHERE player_id IS NOT NULL GROUP BY player_id
    ),
    player_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'reviews', reviews)), '[]'::jsonb) AS rows
      FROM player_review_rollup
    ),
    players_with_reviews_json AS (
      SELECT COALESCE(jsonb_agg(DISTINCT player_id), '[]'::jsonb) AS ids
      FROM round_reviews_joined WHERE player_id IS NOT NULL
    ),

    -- PERF FIX: scope insight generation log to last 12 weeks.
    player_insight_rollup AS (
      SELECT player_id, SUM(COALESCE(insights_generated, 1))::int AS insights
      FROM golf_insight_generation_log
      WHERE player_id IS NOT NULL
        AND created_at >= p_ago12w
      GROUP BY player_id
    ),
    player_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'insights', insights)), '[]'::jsonb) AS rows
      FROM player_insight_rollup
    ),
    teams_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'season', season, 'organization_id', organization_id)), '[]'::jsonb) AS rows
      FROM golf_teams
    ),
    team_members_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'team_id', team_id)), '[]'::jsonb) AS rows
      FROM golf_team_members WHERE status = 'active'
    ),
    players_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'first_name', first_name, 'last_name', last_name,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_players
    ),
    coaches_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'full_name', full_name, 'organization_id', organization_id,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_coaches
    ),
    users_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'role', role::text, 'created_at', created_at, 'last_seen', last_seen
      ) ORDER BY created_at DESC NULLS LAST), '[]'::jsonb) AS rows FROM users
    ),
    philosophy_coach_ids AS (
      SELECT COALESCE(jsonb_agg(DISTINCT coach_id), '[]'::jsonb) AS ids
      FROM golf_coach_philosophy WHERE coach_id IS NOT NULL
    ),
    player_stats_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'first_name', gp.first_name, 'last_name', gp.last_name,
        'scoring_average', scoring_average, 'driving_accuracy', driving_accuracy_percentage,
        'gir_percentage', gir_percentage, 'putts_per_round', putts_per_round, 'rounds_played', rounds_played
      )), '[]'::jsonb) AS rows
      FROM golf_player_stats_cache psc LEFT JOIN golf_players gp ON gp.id = psc.player_id
    ),
    error_count_24h AS (
      SELECT COUNT(*)::int AS errors_24h FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= (now() - interval '24 hours')
    ),
    error_count_7d AS (
      SELECT COUNT(*)::int AS errors_7d FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= p_ago7d
    ),
    admin_error_events AS (
      SELECT id, event_type, severity::text AS severity,
             COALESCE(resolved, false) AS resolved, created_at
      FROM admin_events
      WHERE severity::text IN ('error', 'critical') AND created_at >= p_ago30d
    ),
    admin_error_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'event_type', event_type, 'severity', severity,
        'resolved', resolved, 'created_at', created_at
      )), '[]'::jsonb) AS rows,
      COALESCE(SUM(CASE WHEN NOT resolved THEN 1 ELSE 0 END), 0)::int AS unresolved
      FROM admin_error_events
    )

  SELECT jsonb_build_object(
    'generated_at', now(), 'ago7d', p_ago7d, 'ago30d', p_ago30d, 'ago12w', p_ago12w,
    'analyticsEvents', (SELECT events FROM analytics_events_json),
    'coachInsightRollup', (SELECT rows FROM coach_insight_rollup_json),
    'coachReviewRollup', (SELECT rows FROM coach_review_rollup_json),
    'playerReviewRollup', (SELECT rows FROM player_review_rollup_json),
    'playersWithReviews', (SELECT ids FROM players_with_reviews_json),
    'playerInsightRollup', (SELECT rows FROM player_insight_rollup_json),
    'teams', (SELECT rows FROM teams_json),
    'teamMembers', (SELECT rows FROM team_members_json),
    'players', (SELECT rows FROM players_json),
    'coaches', (SELECT rows FROM coaches_json),
    'users', (SELECT rows FROM users_json),
    'philosophyCoachIds', (SELECT ids FROM philosophy_coach_ids),
    'playerStats', (SELECT rows FROM player_stats_json),
    'errors24h', (SELECT errors_24h FROM error_count_24h),
    'errors7d', (SELECT errors_7d FROM error_count_7d),
    'adminErrorEvents', (SELECT rows FROM admin_error_events_json),
    'adminErrorEventsUnresolved', (SELECT unresolved FROM admin_error_events_json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Supporting index for the new time-bounded round review scan. The existing
-- idx_golf_round_reviews_published_created (published_by, created_at DESC,
-- partial) helps coach-side rollups but not the new WHERE rr.created_at >=
-- p_ago12w predicate, since reviews without a published_by are still
-- relevant for player-side counts. A simple created_at index covers the
-- new time-bounded scan in both call paths.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_golf_round_reviews_created_at
  ON golf_round_reviews (created_at DESC);

-- Time-bounded scan on golf_insight_generation_log too. The existing
-- idx_golf_insight_gen_log_player and idx_golf_insight_generation_log_player_created
-- cover (player_id) and (player_id, created_at DESC) — the second one will
-- already serve the new GROUP BY player_id WHERE created_at >= p_ago12w
-- predicate, so no additional index is needed there.
