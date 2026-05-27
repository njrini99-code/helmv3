-- =============================================================================
-- Performance fix for three admin rollup functions that were hitting Postgres
-- statement_timeout (code=57014) and crashing /golf/admin?tab=system.
--
-- Root cause: `WITH base AS (SELECT * FROM error_logs/admin_events ...)`
-- materialized every column — including large JSONB `context`/`metadata` and
-- text `stack` — into the CTE before aggregating over ~70k rows. Projecting
-- only the aggregated columns drops CTE memory pressure by ~90% and lets
-- GROUP BY / COUNT(DISTINCT) finish inside the timeout window.
--
-- Also: admin_error_events CTE inside get_admin_analytics_rollup had no time
-- bound and was scanning all 69k admin_events by severity across all history.
-- Scoped to p_ago30d (already a function parameter) to match the rest of the
-- function's 30-day window semantics. The downstream consumer
-- (rollup-c.ts) only uses this array for lastErrorAt / unresolvedErrors /
-- allClear — all "recent state" signals, so scoping preserves semantics.
--
-- Applied via Supabase MCP on 2026-04-24. File mirrors the remote migration
-- so `supabase db reset` reproduces the optimized functions.
-- =============================================================================

-- ---- 1. get_error_summary ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_error_summary(days_back integer DEFAULT 7)
RETURNS TABLE (
  by_severity    jsonb,
  top_errors     jsonb,
  daily_rate     jsonb,
  total_count    bigint,
  critical_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  cutoff timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH base AS (
    -- Projection trimmed from SELECT * — stack + context JSONB + url are not
    -- used by any downstream aggregate, and pulling them across 70k rows was
    -- the dominant cost.
    SELECT message, severity, user_id, created_at
    FROM error_logs
    WHERE created_at >= cutoff
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('severity', s.severity, 'count', s.cnt))
      FROM (SELECT b.severity, count(*) AS cnt FROM base b GROUP BY b.severity) s
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.cnt DESC)
      FROM (
        SELECT b.message,
               min(b.severity) AS severity,
               count(*)        AS cnt,
               min(b.created_at)::text AS first_seen,
               max(b.created_at)::text AS last_seen,
               count(DISTINCT b.user_id) AS affected_users
        FROM base b
        GROUP BY b.message
        ORDER BY count(*) DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d::text || 'T00:00:00+00:00', 'count', coalesce(dc.cnt, 0)
      ) ORDER BY d)
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT b.created_at::date AS day, count(*) AS cnt
        FROM base b
        GROUP BY 1
      ) dc ON dc.day = d
    ), '[]'::jsonb),
    (SELECT count(*) FROM base),
    (SELECT count(*) FROM base WHERE base.severity = 'critical');
END;
$function$;

-- ---- 2. get_admin_event_summary (initial projection-trim pass) -------------
-- Intermediate step — further optimized by the 20260424015417 migration,
-- which rewrites the CTE structure entirely. Left here for migration-log
-- fidelity; the next migration supersedes this function body.
CREATE OR REPLACE FUNCTION public.get_admin_event_summary(p_days_back integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  cutoff timestamptz := now() - (p_days_back || ' days')::interval;
  result jsonb;
BEGIN
  WITH base AS (
    SELECT event_type, severity, resolved, created_at
    FROM admin_events
    WHERE created_at >= cutoff
  )
  SELECT jsonb_build_object(
    'total_events',    (SELECT count(*) FROM base),
    'error_count',     (SELECT count(*) FROM base WHERE severity::text = 'error'),
    'critical_count',  (SELECT count(*) FROM base WHERE severity::text = 'critical'),
    'unresolved_count',(SELECT count(*) FROM base WHERE NOT resolved),
    'events_by_type', coalesce((
      SELECT jsonb_object_agg(event_type, cnt)
      FROM (SELECT event_type, count(*) AS cnt FROM base GROUP BY event_type) t
    ), '{}'::jsonb),
    'events_by_severity', coalesce((
      SELECT jsonb_object_agg(severity::text, cnt)
      FROM (SELECT severity, count(*) AS cnt FROM base GROUP BY severity) t
    ), '{}'::jsonb),
    'events_by_day', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', d::text, 'count', coalesce(dc.cnt, 0)) ORDER BY d)
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT b.created_at::date AS day, count(*) AS cnt
        FROM base b
        GROUP BY 1
      ) dc ON dc.day = d
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

-- ---- 3. get_admin_analytics_rollup (admin_error_events CTE scoped to 30d) --
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
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
    analytics_raw AS (
      SELECT event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms
      FROM admin_analytics_events
      WHERE created_at >= p_ago7d
    ),
    analytics_events_json AS (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'event_type', event_type, 'page_path', page_path, 'feature_name', feature_name,
          'session_id', session_id, 'user_id', user_id, 'created_at', created_at, 'duration_ms', duration_ms
        )),
        '[]'::jsonb
      ) AS events
      FROM analytics_raw
    ),
    coach_insight_rollup AS (
      SELECT coach_id, COUNT(*)::int AS total_insights, MAX(created_at) AS last_insight_at
      FROM golf_coach_insights
      WHERE coach_id IS NOT NULL
      GROUP BY coach_id
    ),
    coach_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'total_insights', total_insights, 'last_insight_at', last_insight_at
      )), '[]'::jsonb) AS rows
      FROM coach_insight_rollup
    ),
    round_reviews_joined AS (
      SELECT rr.published_by, rr.round_id, rr.created_at AS review_at,
             gr.player_id, gr.created_at AS round_at
      FROM golf_round_reviews rr
      LEFT JOIN golf_rounds gr ON gr.id = rr.round_id
    ),
    coach_review_rollup AS (
      SELECT published_by AS coach_id, COUNT(*)::int AS reviews,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0)
            FILTER (WHERE round_at IS NOT NULL AND review_at IS NOT NULL
              AND review_at >= round_at
              AND EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0 < 720),
          NULL
        ) AS avg_response_hours
      FROM round_reviews_joined
      WHERE published_by IS NOT NULL
      GROUP BY published_by
    ),
    coach_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'reviews', reviews,
        'avg_response_hours', CASE WHEN avg_response_hours IS NULL THEN NULL
          ELSE ROUND(avg_response_hours::numeric, 2) END
      )), '[]'::jsonb) AS rows
      FROM coach_review_rollup
    ),
    player_review_rollup AS (
      SELECT player_id, COUNT(*)::int AS reviews
      FROM round_reviews_joined
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ),
    player_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'reviews', reviews)), '[]'::jsonb) AS rows
      FROM player_review_rollup
    ),
    players_with_reviews_json AS (
      SELECT COALESCE(jsonb_agg(DISTINCT player_id), '[]'::jsonb) AS ids
      FROM round_reviews_joined
      WHERE player_id IS NOT NULL
    ),
    player_insight_rollup AS (
      SELECT player_id, SUM(COALESCE(insights_generated, 1))::int AS insights
      FROM golf_insight_generation_log
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ),
    player_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'insights', insights)), '[]'::jsonb) AS rows
      FROM player_insight_rollup
    ),
    teams_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'season', season, 'organization_id', organization_id
      )), '[]'::jsonb) AS rows
      FROM golf_teams
    ),
    team_members_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'team_id', team_id)), '[]'::jsonb) AS rows
      FROM golf_team_members
      WHERE status = 'active'
    ),
    players_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'first_name', first_name, 'last_name', last_name,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows
      FROM golf_players
    ),
    coaches_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'full_name', full_name,
        'organization_id', organization_id,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows
      FROM golf_coaches
    ),
    users_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'role', role::text,
        'created_at', created_at, 'last_seen', last_seen
      ) ORDER BY created_at DESC NULLS LAST), '[]'::jsonb) AS rows
      FROM users
    ),
    philosophy_coach_ids AS (
      SELECT COALESCE(jsonb_agg(DISTINCT coach_id), '[]'::jsonb) AS ids
      FROM golf_coach_philosophy
      WHERE coach_id IS NOT NULL
    ),
    player_stats_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'first_name', gp.first_name, 'last_name', gp.last_name,
        'scoring_average', scoring_average, 'driving_accuracy', driving_accuracy_percentage,
        'gir_percentage', gir_percentage, 'putts_per_round', putts_per_round,
        'rounds_played', rounds_played
      )), '[]'::jsonb) AS rows
      FROM golf_player_stats_cache psc
      LEFT JOIN golf_players gp ON gp.id = psc.player_id
    ),
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
      -- WAS: scanned all_time admin_events by severity (69k rows w/o time bound).
      -- Now bounded to p_ago30d — matches the dashboard "recent" semantics
      -- (allClear / lastErrorAt / unresolvedErrors are all current-state signals).
      SELECT id, event_type, severity::text AS severity,
             COALESCE(resolved, false) AS resolved, created_at
      FROM admin_events
      WHERE severity::text IN ('error', 'critical')
        AND created_at >= p_ago30d
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
$function$;
