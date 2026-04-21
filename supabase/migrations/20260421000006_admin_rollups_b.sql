-- ============================================================================
-- Migration: 20260421000006_admin_rollups_b.sql
-- Purpose: Slice B of the getAdminDashboardData() refactor.
--
--   * C5 — get_admin_baseball_rollup(p_ago30d)        — 14 baseball queries → 1 RPC
--   * C6 — get_admin_errors_rollup(p_ago7d,p_ago24h)  — 9  errors/events queries → 1 RPC
--            (wraps existing get_error_summary + get_admin_event_summary)
--   * C7 — get_admin_teams_scoring_rollup(p_ago7d)    — 9  teams/scoring queries → 1 RPC
--
-- Design notes:
--   * All three functions are SECURITY DEFINER, set search_path = public, and
--     begin with an admin-role gate that also accepts the service_role JWT
--     used by createAdminClient() from the server action layer.
--   * baseball_* tables are guarded with to_regclass() so the RPC is safe on
--     environments where baseball hasn't been provisioned yet (dev, preview).
--   * C6 preserves the resilient try-catch semantics of the TS caller: if
--     get_error_summary / get_admin_event_summary ever raise, the wrapper
--     catches and returns null for that sub-object so the TS layer can set
--     errorSummaryDegraded / adminEventSummaryDegraded flags. It does NOT
--     throw the outer RPC — degraded-but-functional is the goal.
--   * C6 returns RAW error_logs + admin_events rows. The TS post-processor
--     (buildDashboardErrorContext / normalizeIncidentKey / deriveIncidentNarrative
--     in admin-data.ts L714-987) still runs unchanged on top of the RPC payload.
-- ============================================================================

-- Reusable admin-gate helper: caller must be an admin user OR using the
-- service_role JWT (createAdminClient from the server action layer).
CREATE OR REPLACE FUNCTION public.__admin_rollup_b_gate()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.__admin_rollup_b_gate() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.__admin_rollup_b_gate() TO authenticated, service_role;

-- ============================================================================
-- C5: Baseball counts rollup
-- ============================================================================
-- Returns JSONB shape matching AdminDashboardData.baseball (see admin-data.ts
-- L456-L472). Tables may not exist on every env; to_regclass guards keep this
-- a safe 0 in dev/preview branches that predate baseball provisioning.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_baseball_rollup(
  p_ago30d timestamptz DEFAULT (now() - interval '30 days')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_players          bigint := 0;
  v_total_coaches          bigint := 0;
  v_players_onboarded      bigint := 0;
  v_coaches_onboarded      bigint := 0;
  v_recruiting_activated   bigint := 0;
  v_watchlist_stages       jsonb  := '{}'::jsonb;
  v_videos30d              bigint := 0;
  v_engagement30d          bigint := 0;
  v_messages30d            bigint := 0;
  v_conversations30d       bigint := 0;
  v_total_teams            bigint := 0;
  v_total_events           bigint := 0;
  v_total_camps            bigint := 0;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  IF to_regclass('public.baseball_players') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_players' INTO v_total_players;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE onboarding_completed = TRUE$q$ INTO v_players_onboarded;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE recruiting_activated = TRUE$q$ INTO v_recruiting_activated;
  END IF;

  IF to_regclass('public.baseball_coaches') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_coaches' INTO v_total_coaches;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_coaches WHERE onboarding_completed = TRUE$q$ INTO v_coaches_onboarded;
  END IF;

  IF to_regclass('public.baseball_watchlists') IS NOT NULL THEN
    EXECUTE
      $q$SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
         FROM (
           SELECT COALESCE(pipeline_stage::text, 'unknown') AS stage,
                  COUNT(*)::int AS cnt
           FROM baseball_watchlists
           GROUP BY 1
         ) s$q$
      INTO v_watchlist_stages;
  END IF;

  IF to_regclass('public.baseball_videos') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_videos WHERE created_at >= $1'
      INTO v_videos30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_player_engagement_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_player_engagement_events WHERE created_at >= $1'
      INTO v_engagement30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_messages') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_messages WHERE created_at >= $1'
      INTO v_messages30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_conversations') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_conversations WHERE created_at >= $1'
      INTO v_conversations30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_teams') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_teams' INTO v_total_teams;
  END IF;

  IF to_regclass('public.baseball_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_events' INTO v_total_events;
  END IF;

  IF to_regclass('public.baseball_camps') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_camps' INTO v_total_camps;
  END IF;

  RETURN jsonb_build_object(
    'total_players',               v_total_players,
    'total_coaches',               v_total_coaches,
    'watchlist_stages',            v_watchlist_stages,
    'recruiting_activated_players', v_recruiting_activated,
    'videos_30d',                  v_videos30d,
    'engagement_events_30d',       v_engagement30d,
    'messages_30d',                v_messages30d,
    'conversations_30d',           v_conversations30d,
    'players_onboarded',           v_players_onboarded,
    'coaches_onboarded',           v_coaches_onboarded,
    'total_teams',                 v_total_teams,
    'total_events',                v_total_events,
    'total_camps',                 v_total_camps
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_baseball_rollup(timestamptz) IS
  'Slice B / C5 — collapses 14 baseball_* admin dashboard count queries into a '
  'single JSONB rollup. Resilient: missing baseball_* tables return 0.';

REVOKE EXECUTE ON FUNCTION public.get_admin_baseball_rollup(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_baseball_rollup(timestamptz) TO authenticated, service_role;

-- ============================================================================
-- C6: Admin events + error_logs rollup
-- ============================================================================
-- Wraps get_error_summary() and get_admin_event_summary() with individual
-- BEGIN/EXCEPTION blocks so the outer RPC never fails when a sub-rollup is
-- unavailable (matches the resilient try-catch pattern in the TS caller).
-- Returns RAW error_logs + admin_events rows — the TS post-processor still
-- runs narrative synthesis on top (buildDashboardErrorContext +
-- deriveIncidentNarrative, admin-data.ts L714-987).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_errors_rollup(
  p_ago7d  timestamptz DEFAULT (now() - interval '7 days'),
  p_ago24h timestamptz DEFAULT (now() - interval '24 hours')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_logs_recent       jsonb := '[]'::jsonb;
  v_error_logs_total_7d     bigint := 0;
  v_error_logs_critical_7d  bigint := 0;
  v_error_logs_count_24h    bigint := 0;
  v_error_summary           jsonb := NULL;
  v_audit_recent            jsonb := '[]'::jsonb;
  v_audit_total_7d          bigint := 0;
  v_login_recent            jsonb := '[]'::jsonb;
  v_login_locked_count      bigint := 0;
  v_admin_events_recent     jsonb := '[]'::jsonb;
  v_admin_events_unresolved jsonb := '[]'::jsonb;
  v_admin_events_error_only jsonb := '[]'::jsonb;
  v_admin_event_summary     jsonb := NULL;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  -- ---- error_logs: recent 500 + counts ----
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         e.id,
        'message',    e.message,
        'severity',   e.severity,
        'stack',      e.stack,
        'url',        e.url,
        'user_id',    e.user_id,
        'context',    e.context,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_error_logs_recent
  FROM (
    SELECT id, message, severity, stack, url, user_id, context, created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COUNT(*)::bigint INTO v_error_logs_total_7d
    FROM error_logs WHERE created_at >= p_ago7d;
  SELECT COUNT(*)::bigint INTO v_error_logs_critical_7d
    FROM error_logs WHERE created_at >= p_ago7d AND severity = 'critical';
  SELECT COUNT(*)::bigint INTO v_error_logs_count_24h
    FROM error_logs WHERE created_at >= p_ago24h;

  -- ---- error_summary via existing RPC (resilient) ----
  BEGIN
    SELECT jsonb_build_object(
      'by_severity',    by_severity,
      'top_errors',     top_errors,
      'daily_rate',     daily_rate,
      'total_count',    total_count,
      'critical_count', critical_count
    )
    INTO v_error_summary
    FROM public.get_error_summary(7);
  EXCEPTION WHEN OTHERS THEN
    v_error_summary := NULL; -- TS sets errorSummaryDegraded = true
  END;

  -- ---- audit_log: recent 50 via existing RPC (resilient) + 7d count ----
  BEGIN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',         a.id,
          'user_id',    a.user_id,
          'user_email', a.user_email,
          'action',     a.action,
          'table_name', a.table_name,
          'record_id',  a.record_id,
          'old_data',   a.old_data,
          'new_data',   a.new_data,
          'created_at', a.created_at
        )
      ),
      '[]'::jsonb
    )
    INTO v_audit_recent
    FROM public.get_audit_log_recent(50) a;
  EXCEPTION WHEN OTHERS THEN
    v_audit_recent := '[]'::jsonb;
  END;

  SELECT COUNT(*)::bigint INTO v_audit_total_7d
    FROM audit_log WHERE created_at >= p_ago7d;

  -- ---- login_attempts: recent 20 + locked count ----
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'email',           l.email,
        'failed_attempts', l.failed_attempts,
        'last_attempt',    l.last_attempt,
        'locked_until',    l.locked_until
      )
      ORDER BY l.last_attempt DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_login_recent
  FROM (
    SELECT email, failed_attempts, last_attempt, locked_until
    FROM login_attempts
    ORDER BY last_attempt DESC NULLS LAST
    LIMIT 20
  ) l;

  SELECT COUNT(*)::bigint INTO v_login_locked_count
    FROM login_attempts WHERE locked_until >= now();

  -- ---- admin_events: recent 500 (no metadata) ----
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          e.id,
        'event_type',  e.event_type,
        'severity',    e.severity::text,
        'title',       e.title,
        'message',     e.message,
        'user_id',     e.user_id,
        'user_email',  e.user_email,
        'url',         e.url,
        'resolved',    e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at',  e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_recent
  FROM (
    SELECT id, event_type, severity, title, message, user_id, user_email,
           url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  -- ---- admin_events: unresolved critical/error ----
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         e.id,
        'event_type', e.event_type,
        'severity',   e.severity::text,
        'title',      e.title,
        'message',    e.message,
        'resolved',   e.resolved,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_unresolved
  FROM (
    SELECT id, event_type, severity, title, message, resolved, created_at
    FROM admin_events
    WHERE resolved = FALSE
      AND severity IN ('critical', 'error')
    ORDER BY created_at DESC
    LIMIT 20
  ) e;

  -- ---- admin_events: error-type only WITH metadata (for incident narrative) ----
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          e.id,
        'event_type',  e.event_type,
        'severity',    e.severity::text,
        'title',       e.title,
        'message',     e.message,
        'metadata',    e.metadata,
        'user_id',     e.user_id,
        'user_email',  e.user_email,
        'url',         e.url,
        'resolved',    e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at',  e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_error_only
  FROM (
    SELECT id, event_type, severity, title, message, metadata, user_id,
           user_email, url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    WHERE event_type = 'error'
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  -- ---- admin_event_summary via existing RPC (resilient) ----
  BEGIN
    SELECT jsonb_build_object(
      'total_events',        total_events,
      'error_count',         error_count,
      'critical_count',      critical_count,
      'unresolved_count',    unresolved_count,
      'events_by_type',      events_by_type,
      'events_by_severity',  events_by_severity,
      'events_by_day',       events_by_day
    )
    INTO v_admin_event_summary
    FROM public.get_admin_event_summary(7);
  EXCEPTION WHEN OTHERS THEN
    v_admin_event_summary := NULL; -- TS sets adminEventSummaryDegraded = true
  END;

  RETURN jsonb_build_object(
    'error_logs', jsonb_build_object(
      'recent',       v_error_logs_recent,
      'total_7d',     v_error_logs_total_7d,
      'critical_7d',  v_error_logs_critical_7d,
      'count_24h',    v_error_logs_count_24h
    ),
    'error_summary', v_error_summary,
    'audit_log', jsonb_build_object(
      'recent',   v_audit_recent,
      'total_7d', v_audit_total_7d
    ),
    'login_security', jsonb_build_object(
      'recent',        v_login_recent,
      'locked_count',  v_login_locked_count
    ),
    'admin_events', jsonb_build_object(
      'recent',              v_admin_events_recent,
      'unresolved_critical', v_admin_events_unresolved,
      'error_only',          v_admin_events_error_only,
      'summary',             v_admin_event_summary
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_errors_rollup(timestamptz, timestamptz) IS
  'Slice B / C6 — rollup of error_logs + audit_log + login_attempts + '
  'admin_events. Wraps get_error_summary and get_admin_event_summary with '
  'exception handlers so their failure degrades gracefully (TS sets '
  'errorSummaryDegraded / adminEventSummaryDegraded flags).';

REVOKE EXECUTE ON FUNCTION public.get_admin_errors_rollup(timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_errors_rollup(timestamptz, timestamptz) TO authenticated, service_role;

-- ============================================================================
-- C7: Teams / rosters / scoring rollup
-- ============================================================================
-- Collapses the 9 .from() queries in Batch 2 that cover:
--   golf_teams, golf_team_members (×2), golf_rounds (team-week),
--   golf_player_stats_cache (top50 + strokes-gained + last-updated),
--   golf_coaches, golf_announcements, golf_announcement_acknowledgements,
--   golf_messages, golf_conversations, golf_rounds (best-rounds + scoring-dist),
--   demo_requests (all + pending + recent).
--
-- Note: coaches link to teams via organization_id (NOT team_id) — the canonical
-- ownership join from migration 20260328000000.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_teams_scoring_rollup(
  p_ago7d timestamptz DEFAULT (now() - interval '7 days')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teams                    jsonb := '[]'::jsonb;
  v_team_members             jsonb := '[]'::jsonb;
  v_team_rounds_week         jsonb := '[]'::jsonb;
  v_player_stats_top50       jsonb := '[]'::jsonb;
  v_player_team_map          jsonb := '[]'::jsonb;
  v_coach_orgs               jsonb := '[]'::jsonb;
  v_scoring_distribution     jsonb := '[]'::jsonb;
  v_recent_best_rounds       jsonb := '[]'::jsonb;
  v_strokes_gained           jsonb := NULL;
  v_stats_cache_last_updated text  := NULL;
  v_demo_total               bigint := 0;
  v_demo_pending             bigint := 0;
  v_demo_recent              jsonb := '[]'::jsonb;
  v_announcements_total      bigint := 0;
  v_ack_count                bigint := 0;
  v_messages_total           bigint := 0;
  v_conversations_total      bigint := 0;
  v_attendance_pcts          jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  -- Teams + org name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',              t.id,
        'name',            t.name,
        'organization_id', t.organization_id,
        'org_name',        o.name
      )
      ORDER BY t.name
    ),
    '[]'::jsonb
  )
  INTO v_teams
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id;

  -- Active team members joined to player name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id',    m.team_id,
        'player_id',  m.player_id,
        'first_name', p.first_name,
        'last_name',  p.last_name
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_members
  FROM golf_team_members m
  LEFT JOIN golf_players p ON p.id = m.player_id
  WHERE m.status = 'active';

  -- player_id ↔ team (for team-name resolution on topPerformers / directory)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', m.player_id,
        'team_id',   t.id,
        'team_name', t.name
      )
    ),
    '[]'::jsonb
  )
  INTO v_player_team_map
  FROM golf_team_members m
  JOIN golf_teams t ON t.id = m.team_id
  WHERE m.status = 'active';

  -- Rounds this week per team (raw rows — TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', r.player_id,
        'team_id',   r.team_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_rounds_week
  FROM golf_rounds r
  WHERE r.created_at >= p_ago7d;

  -- Top 50 performers by scoring_average (with player name)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id',                    s.player_id,
        'scoring_average',              s.scoring_average,
        'driving_accuracy_percentage',  s.driving_accuracy_percentage,
        'gir_percentage',               s.gir_percentage,
        'putts_per_round',              s.putts_per_round,
        'rounds_played',                s.rounds_played,
        'first_name',                   p.first_name,
        'last_name',                    p.last_name
      )
      ORDER BY s.scoring_average ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_player_stats_top50
  FROM (
    SELECT player_id, scoring_average, driving_accuracy_percentage,
           gir_percentage, putts_per_round, rounds_played
    FROM golf_player_stats_cache
    WHERE scoring_average IS NOT NULL
    ORDER BY scoring_average ASC
    LIMIT 50
  ) s
  LEFT JOIN golf_players p ON p.id = s.player_id;

  -- Coach organization ids (for team.coachCount resolution)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('organization_id', c.organization_id)),
    '[]'::jsonb
  )
  INTO v_coach_orgs
  FROM golf_coaches c
  WHERE c.organization_id IS NOT NULL;

  -- Scoring distribution: raw total_score rows (TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(r.total_score),
    '[]'::jsonb
  )
  INTO v_scoring_distribution
  FROM golf_rounds r
  WHERE r.total_score IS NOT NULL
    AND r.status = 'completed';

  -- Recent 5 best rounds
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'total_score',  r.total_score,
        'score_to_par', r.score_to_par,
        'course_name',  r.course_name,
        'round_date',   r.round_date,
        'first_name',   p.first_name,
        'last_name',    p.last_name
      )
      ORDER BY r.score_to_par ASC
    ),
    '[]'::jsonb
  )
  INTO v_recent_best_rounds
  FROM (
    SELECT player_id, total_score, score_to_par, course_name, round_date
    FROM golf_rounds
    WHERE total_score IS NOT NULL
      AND status = 'completed'
    ORDER BY score_to_par ASC
    LIMIT 5
  ) r
  LEFT JOIN golf_players p ON p.id = r.player_id;

  -- Platform strokes-gained averages (single pass)
  SELECT jsonb_build_object(
    'sg_total',        AVG(strokes_gained_total),
    'sg_tee',          AVG(strokes_gained_tee),
    'sg_approach',     AVG(strokes_gained_approach),
    'sg_around_green', AVG(strokes_gained_around_green),
    'sg_putting',      AVG(strokes_gained_putting)
  )
  INTO v_strokes_gained
  FROM golf_player_stats_cache
  WHERE strokes_gained_total IS NOT NULL;

  -- Stats cache last updated (single row)
  SELECT MAX(updated_at)::text INTO v_stats_cache_last_updated
  FROM golf_player_stats_cache;

  -- Demo requests: total + pending + recent 10
  SELECT COUNT(*)::bigint INTO v_demo_total FROM demo_requests;
  SELECT COUNT(*)::bigint INTO v_demo_pending
    FROM demo_requests WHERE status = 'pending';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name',          d.name,
        'email',         d.email,
        'organization',  d.organization,
        'interest_type', d.interest_type,
        'status',        d.status,
        'created_at',    d.created_at
      )
      ORDER BY d.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_demo_recent
  FROM (
    SELECT name, email, organization, interest_type, status, created_at
    FROM demo_requests
    ORDER BY created_at DESC
    LIMIT 10
  ) d;

  -- Golf communication counts
  SELECT COUNT(*)::bigint INTO v_announcements_total FROM golf_announcements;
  SELECT COUNT(*)::bigint INTO v_ack_count FROM golf_announcement_acknowledgements;
  SELECT COUNT(*)::bigint INTO v_messages_total FROM golf_messages;
  SELECT COUNT(*)::bigint INTO v_conversations_total FROM golf_conversations;

  -- Attendance percentages (if table present)
  IF to_regclass('public.golf_attendance_summary') IS NOT NULL THEN
    EXECUTE $q$SELECT COALESCE(jsonb_agg(attendance_percentage), '[]'::jsonb)
              FROM golf_attendance_summary
              WHERE attendance_percentage IS NOT NULL$q$
      INTO v_attendance_pcts;
  END IF;

  RETURN jsonb_build_object(
    'teams',                    v_teams,
    'team_members',             v_team_members,
    'team_rounds_week',         v_team_rounds_week,
    'player_stats_top50',       v_player_stats_top50,
    'player_team_map',          v_player_team_map,
    'coach_orgs',               v_coach_orgs,
    'scoring_distribution',     v_scoring_distribution,
    'recent_best_rounds',       v_recent_best_rounds,
    'strokes_gained',           v_strokes_gained,
    'stats_cache_last_updated', v_stats_cache_last_updated,
    'demo_requests', jsonb_build_object(
      'total',   v_demo_total,
      'pending', v_demo_pending,
      'recent',  v_demo_recent
    ),
    'golf_communication', jsonb_build_object(
      'total_announcements', v_announcements_total,
      'ack_count',           v_ack_count,
      'total_messages',      v_messages_total,
      'total_conversations', v_conversations_total
    ),
    'attendance_percentages', v_attendance_pcts
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_teams_scoring_rollup(timestamptz) IS
  'Slice B / C7 — single rollup for teams, rosters, scoring, strokes-gained, '
  'demo_requests and golf_communication admin-dashboard data.';

REVOKE EXECUTE ON FUNCTION public.get_admin_teams_scoring_rollup(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_teams_scoring_rollup(timestamptz) TO authenticated, service_role;
