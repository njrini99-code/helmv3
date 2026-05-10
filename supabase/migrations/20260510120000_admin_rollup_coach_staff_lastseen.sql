-- =============================================================================
-- Migration: 20260510120000_admin_rollup_coach_staff_lastseen.sql
-- Purpose:   Fix two admin-dashboard data gaps that surface as missing
--            members/roles/last-active rows on /golf/admin → People tab.
--
-- Bug 1 — coaches missing from their team (or duplicated across teams):
--   src/app/golf/actions/admin/rollup-c.ts:511-538 attaches coaches to teams
--   via `coach.organization_id == team.organization_id`. That heuristic
--   double-counts coaches when an org runs >1 team (men's + women's golf)
--   and silently drops any coach whose organization_id is NULL. The
--   canonical relationship lives in `golf_team_coach_staff(team_id,
--   coach_id, role, is_primary)` — onboarding writes it (onboarding.ts:178)
--   but the rollup never read it. Surface that mapping in the RPC payload
--   so rollup-c.ts can replace the org_id heuristic with the real link.
--
-- Bug 2 — last_active reads "Never" for users who never open the dashboard:
--   `users.last_seen` is updated only by `LastSeenUpdater` mounted in the
--   golf dashboard layout (src/components/admin/LastSeenUpdater.tsx). Coaches
--   who go straight from login to /golf/admin or to onboarding never hit
--   that component, so their `last_seen` stays NULL even though they sign in
--   regularly. `auth.users.last_sign_in_at` is the authoritative signal and
--   is readable from this SECURITY DEFINER function. Use the GREATER of
--   `users.last_seen` and `auth.users.last_sign_in_at` so the admin view
--   reflects actual session activity, not just dashboard visits.
--
-- Backfill:
--   Bug 1 needs a one-time backfill so existing coaches with an org_id but
--   no staff row appear under their team after the rollup-c.ts change ships.
--   Insert head_coach rows for the (org_id → first team) pairing only when a
--   staff row doesn't already exist. Idempotent via NOT EXISTS guard.
--
-- Safety:
--   * CREATE OR REPLACE FUNCTION — safe to re-run.
--   * The backfill INSERT is idempotent (NOT EXISTS) — also safe to re-run.
--   * No DROP/ALTER on existing columns or indexes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Backfill golf_team_coach_staff for coaches who currently rely on the
--    org_id heuristic. We pick ONE team per org per coach (the lowest-id
--    team, deterministic) so we don't fan a single coach across every team
--    in their org. role='head_coach', is_primary=false (we don't presume
--    primary status in a backfill — onboarding writes is_primary=true for
--    new coaches and that path stays untouched).
-- ---------------------------------------------------------------------------
INSERT INTO golf_team_coach_staff (team_id, coach_id, role, is_primary)
SELECT t.id, c.id, 'head_coach', false
FROM golf_coaches c
JOIN LATERAL (
  SELECT id FROM golf_teams
  WHERE organization_id = c.organization_id
  ORDER BY id
  LIMIT 1
) t ON TRUE
WHERE c.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM golf_team_coach_staff s
    WHERE s.coach_id = c.id
  );

-- ---------------------------------------------------------------------------
-- 2) Rewrite the rollup function. Two changes vs. 20260506000000:
--    - Replace `users_json` to LEFT JOIN auth.users so last_seen is the
--      GREATER of public.users.last_seen and auth.users.last_sign_in_at.
--    - Add `team_coach_staff_json` and surface as `teamCoachStaff` in the
--      payload so rollup-c.ts can do staff-table-driven coach→team mapping.
-- ---------------------------------------------------------------------------
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
    -- NEW: team_coach_staff_json — canonical coach→team mapping used by the
    -- admin User Activity panel. role + is_primary surfaced so the UI can
    -- distinguish head/assistant coaches downstream if needed.
    team_coach_staff_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'team_id', team_id, 'coach_id', coach_id, 'role', role, 'is_primary', is_primary
      )), '[]'::jsonb) AS rows
      FROM golf_team_coach_staff
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
    -- CHANGED: last_seen now coalesces public.users.last_seen with the
    -- authoritative auth.users.last_sign_in_at. SECURITY DEFINER lets us
    -- read auth.users; admins are gated above. GREATEST returns NULL only
    -- when both sides are NULL (i.e. the user genuinely never signed in).
    users_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'role', u.role::text,
        'created_at', u.created_at,
        'last_seen', GREATEST(u.last_seen, au.last_sign_in_at)
      ) ORDER BY u.created_at DESC NULLS LAST), '[]'::jsonb) AS rows
      FROM users u
      LEFT JOIN auth.users au ON au.id = u.id
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
    'teamCoachStaff', (SELECT rows FROM team_coach_staff_json),
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
