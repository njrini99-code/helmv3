-- ============================================================================
-- SLICE A — Admin dashboard rollup RPCs (C1 + C2 + C3 + C4)
-- ============================================================================
--
-- Collapses 51 ad-hoc `.from()` calls inside `getAdminDashboardData()` into 4
-- single-call RPCs:
--
--   C1  get_admin_rounds_rollup            — 17 golf_rounds queries → 1 scan
--   C2  get_admin_users_rollup             — users + coaches + players + cohorts
--   C3  get_admin_feature_adoption_rollup  — 14 feature count round-trips → 1
--   C4  get_admin_coachhelm_rollup         — insights/reviews/patterns/predictions
--
-- All functions:
--   * LANGUAGE plpgsql
--   * SECURITY DEFINER + SET search_path = public
--   * begin with an admin-role gate on auth.uid() (ERRCODE 42501 when denied)
--   * GRANT EXECUTE TO authenticated only
--
-- Column-name traps (caught in review, encoded below):
--   * users.last_seen                (NOT last_seen_at)
--   * golf_coaches.onboarding_completed (NOT onboarded_at)
--   * golf_coaches has organization_id, NOT team_id
--   * golf_players has NO team_id — player↔team via
--         golf_team_members(player_id, team_id, status='active')
-- ============================================================================


-- ---------------------------------------------------------------------------
-- C1 — golf_rounds mega-rollup
-- ---------------------------------------------------------------------------
-- Collapses lines 1574-1576, 1577, 1580-1581, 1597, 1599-1601, 1638-1639,
-- 1646, 1648-1649, 1689, 1695, 1697, 1634, 2142, 2144, 2148, 3224.
--
-- Returns a bounded `allRoundsMinimal` array (last 12 weeks) so Slice C can
-- drop the second full-table scan at L3224.
CREATE OR REPLACE FUNCTION public.get_admin_rounds_rollup(
  p_today   timestamptz,
  p_ago24h  timestamptz,
  p_ago7d   timestamptz,
  p_ago14d  timestamptz,
  p_ago30d  timestamptz,
  p_ago60d  timestamptz,
  p_ago12w  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      -- Active-user distinct sets (health.activeUsers{24h,7d,30d}).
      active_24h AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago24h
      ),
      active_7d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago7d
      ),
      active_30d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago30d
      ),
      -- Churn window: player sets active in [30d, 60d) vs [0, 30d).
      active_30_60 AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL
          AND created_at >= p_ago60d
          AND created_at <  p_ago30d
      ),
      -- Window + total counts.
      window_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)                      AS rounds_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                             AND created_at <  p_ago7d)                     AS rounds_last_week,
          COUNT(*) FILTER (WHERE created_at >= p_today)                      AS rounds_today,
          COUNT(*)                                                           AS total_rounds,
          COUNT(*) FILTER (WHERE status = 'completed')                       AS completed_rounds,
          COUNT(*) FILTER (WHERE total_score IS NOT NULL)                    AS verified_rounds,
          MAX(created_at)                                                    AS last_round_at
        FROM golf_rounds
      ),
      -- Weekly/type breakdown over last 12 weeks.
      by_week_type AS (
        SELECT
          date_trunc('week', created_at) AS week_start,
          COALESCE(round_type, 'unknown') AS round_type,
          COUNT(*)                        AS cnt
        FROM golf_rounds
        WHERE created_at >= p_ago12w
        GROUP BY 1, 2
      ),
      rounds_by_type AS (
        SELECT
          COALESCE(
            jsonb_object_agg(round_type, total),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT round_type, SUM(cnt)::int AS total
          FROM by_week_type
          GROUP BY round_type
        ) t
      ),
      rounds_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(week_start, 'YYYY-MM-DD'),
                'count', weekly_cnt
              )
              ORDER BY week_start ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT week_start, SUM(cnt)::int AS weekly_cnt
          FROM by_week_type
          GROUP BY week_start
        ) t
      ),
      -- Per-team rounds this week (team_id may be NULL — preserved for TS).
      team_rounds_this_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id',   team_id,
                'player_id', player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT team_id, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago7d
        ) t
      ),
      -- Completed-round scoring distribution (raw total_score list, TS buckets).
      scoring_dist AS (
        SELECT
          COALESCE(
            jsonb_agg(total_score),
            '[]'::jsonb
          ) AS arr
        FROM golf_rounds
        WHERE status = 'completed' AND total_score IS NOT NULL
      ),
      -- Best recent rounds: top 5 by score_to_par ASC among completed.
      best_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'total_score',  r.total_score,
                'score_to_par', r.score_to_par,
                'course_name',  r.course_name,
                'round_date',   r.round_date,
                'golf_players', CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.score_to_par ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, course_name, round_date
          FROM golf_rounds
          WHERE status = 'completed' AND total_score IS NOT NULL
          ORDER BY score_to_par ASC NULLS LAST
          LIMIT 5
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Most recent 10 rounds (for activity.recentRounds).
      recent_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',            r.id,
                'total_score',   r.total_score,
                'score_to_par',  r.score_to_par,
                'round_type',    r.round_type,
                'course_name',   r.course_name,
                'created_at',    r.created_at,
                'golf_players',  CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, round_type,
                 course_name, created_at
          FROM golf_rounds
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Round-count per player (replaces L2142 full scan).
      player_round_counts AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, COUNT(*)::int AS cnt
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Last round per player (replaces L2144 full scan).
      player_last_round AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, last_round_at),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, MAX(created_at) AS last_round_at
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Daily rounds over last 30 days (visitsByDay, engagement daily chart).
      rounds_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',        to_char(bucket, 'YYYY-MM-DD'),
                'player_id',   player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago30d
        ) t
      ),
      -- Bounded minimal rounds array Slice C consumes (last 12 weeks of
      -- player_id/created_at/team_id triples, ordered DESC).
      all_rounds_minimal AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',  player_id,
                'created_at', created_at,
                'team_id',    team_id
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT player_id, created_at, team_id
          FROM golf_rounds
          WHERE created_at >= p_ago12w
            AND player_id IS NOT NULL
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',            now(),
      'activeUsers24h',         (SELECT COUNT(*)::int FROM active_24h),
      'activeUsers7d',          (SELECT COUNT(*)::int FROM active_7d),
      'activeUsers30d',         (SELECT COUNT(*)::int FROM active_30d),
      'playerSetActive30d',     COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30d),
                                  '[]'::jsonb
                                ),
      'playerSetActive30_60d',  COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30_60),
                                  '[]'::jsonb
                                ),
      'playersThisWeek',        COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_7d),
                                  '[]'::jsonb
                                ),
      'roundsThisWeek',         (SELECT rounds_this_week  FROM window_counts),
      'roundsLastWeek',         (SELECT rounds_last_week  FROM window_counts),
      'roundsToday',            (SELECT rounds_today      FROM window_counts),
      'totalRounds',            (SELECT total_rounds      FROM window_counts),
      'completedRounds',        (SELECT completed_rounds  FROM window_counts),
      'verifiedRounds',         (SELECT verified_rounds   FROM window_counts),
      'lastRoundAt',            (SELECT last_round_at     FROM window_counts),
      'roundsByType',           (SELECT obj FROM rounds_by_type),
      'roundsByWeek',           (SELECT arr FROM rounds_by_week),
      'teamRoundsThisWeek',     (SELECT arr FROM team_rounds_this_week),
      'scoringDistribution',    (SELECT arr FROM scoring_dist),
      'recentBestRounds',       (SELECT arr FROM best_rounds),
      'recentRounds',           (SELECT arr FROM recent_rounds),
      'playerRoundCounts',      (SELECT obj FROM player_round_counts),
      'playerLastRound',        (SELECT obj FROM player_last_round),
      'roundsByDay30d',         (SELECT arr FROM rounds_by_day_30d),
      'allRoundsMinimal',       (SELECT arr FROM all_rounds_minimal)
    )
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- C2 — Users + onboarding + cohort rollup
-- ---------------------------------------------------------------------------
-- Collapses 11 queries at L1585-1594, 1633, 1644-1645, 1651-1654, 1704,
-- 2136-2140, 2146.
CREATE OR REPLACE FUNCTION public.get_admin_users_rollup(
  p_ago7d   timestamptz,
  p_ago14d  timestamptz,
  p_ago30d  timestamptz,
  p_ago12w  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Cohort boundaries: weeks 1..4 back from now. Week N covers the 7-day
  -- bucket that starts N*7 days ago and ends (N-1)*7 days ago.
  v_w4_start timestamptz := now() - interval '28 days';
  v_w4_end   timestamptz := now() - interval '21 days';
  v_w3_start timestamptz := now() - interval '21 days';
  v_w3_end   timestamptz := now() - interval '14 days';
  v_w2_start timestamptz := now() - interval '14 days';
  v_w2_end   timestamptz := now() - interval '7 days';
  v_w1_start timestamptz := now() - interval '7 days';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      user_counts AS (
        SELECT
          COUNT(*)::int                                                AS total_platform_users,
          COUNT(*) FILTER (WHERE role = 'admin')::int                  AS total_admins,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int           AS new_users_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                            AND created_at <  p_ago7d)::int            AS new_users_last_week
        FROM users
      ),
      signups_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM users
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      signups_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket,
                 COUNT(*)::int                  AS cnt
          FROM users
          WHERE created_at >= p_ago30d
          GROUP BY 1
        ) t
      ),
      coach_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_coaches,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS coaches_onboarded
        FROM golf_coaches
      ),
      player_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_players,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS players_onboarded,
          COUNT(*) FILTER (WHERE onboarding_completed IS NOT TRUE)::int AS players_pending
        FROM golf_players
      ),
      active_teams AS (
        SELECT
          COUNT(DISTINCT team_id)::int AS active_team_count
        FROM golf_team_members
        WHERE status = 'active'
      ),
      players_by_year AS (
        SELECT
          COALESCE(
            jsonb_object_agg(year_key, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT
            COALESCE(graduation_year::text, 'unknown') AS year_key,
            COUNT(*)::int                              AS cnt
          FROM golf_players
          GROUP BY 1
        ) t
      ),
      -- playersByStatus embeds graduation_year per-member so the TS layer can
      -- rebuild the status→graduation breakdown (matches the shape at L1644).
      players_by_status AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'status',          tm.status::text,
                'graduation_year', p.graduation_year
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_team_members tm
        LEFT JOIN golf_players p ON p.id = tm.player_id
        WHERE tm.status IS NOT NULL
      ),
      -- Latest 10 signups for activity.recentSignups.
      latest_signups AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, email, role, created_at
          FROM users
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Cohort retention: users who signed up in each of the last 4 weeks.
      cohort_w1 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w1_start
      ),
      cohort_w2 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w2_start AND created_at <= v_w2_end
      ),
      cohort_w3 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w3_start AND created_at <= v_w3_end
      ),
      cohort_w4 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w4_start AND created_at <= v_w4_end
      ),
      -- Directory: full users list ordered by created_at DESC.
      users_for_directory AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at,
                'last_seen',  last_seen
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM users
      ),
      -- Player detail map (id → id/user_id/name/grad/onboard).
      player_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'first_name',           first_name,
                'last_name',            last_name,
                'graduation_year',      graduation_year,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_players
      ),
      -- Coach detail map.
      coach_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'full_name',            full_name,
                'email',                email,
                'organization_id',      organization_id,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_coaches
      )

    SELECT jsonb_build_object(
      'generatedAt',          now(),
      'totalPlatformUsers',   (SELECT total_platform_users FROM user_counts),
      'totalAdmins',          (SELECT total_admins         FROM user_counts),
      'newUsersThisWeek',     (SELECT new_users_this_week  FROM user_counts),
      'newUsersLastWeek',     (SELECT new_users_last_week  FROM user_counts),
      'totalCoaches',         (SELECT total_coaches        FROM coach_counts),
      'coachesOnboarded',     (SELECT coaches_onboarded    FROM coach_counts),
      'totalPlayers',         (SELECT total_players        FROM player_counts),
      'playersOnboarded',     (SELECT players_onboarded    FROM player_counts),
      'playersPending',       (SELECT players_pending      FROM player_counts),
      'activeTeamCount',      (SELECT active_team_count    FROM active_teams),
      'signupsByWeek',        (SELECT arr FROM signups_by_week),
      'signupsByDay30d',      (SELECT arr FROM signups_by_day_30d),
      'playersByYear',        (SELECT obj FROM players_by_year),
      'playersByStatus',      (SELECT arr FROM players_by_status),
      'latestSignups',        (SELECT arr FROM latest_signups),
      'cohortWeeks', jsonb_build_object(
        'w1', (SELECT ids FROM cohort_w1),
        'w2', (SELECT ids FROM cohort_w2),
        'w3', (SELECT ids FROM cohort_w3),
        'w4', (SELECT ids FROM cohort_w4)
      ),
      'usersForDirectory',    (SELECT arr FROM users_for_directory),
      'playerMap',            (SELECT arr FROM player_map),
      'coachMap',             (SELECT arr FROM coach_map)
    )
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- C3 — Feature-adoption counts (all-time + last 30d)
-- ---------------------------------------------------------------------------
-- Collapses 14 sequential count-head calls at L1602-1616.
CREATE OR REPLACE FUNCTION public.get_admin_feature_adoption_rollup(
  p_ago30d timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generatedAt',   now(),
    'qualifiers', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_qualifiers),
      'last30d',  (SELECT COUNT(*)::int FROM golf_qualifiers  WHERE created_at >= p_ago30d)
    ),
    'events', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_events),
      'last30d',  (SELECT COUNT(*)::int FROM golf_events       WHERE created_at >= p_ago30d)
    ),
    'tasks', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_tasks),
      'last30d',  (SELECT COUNT(*)::int FROM golf_tasks        WHERE created_at >= p_ago30d)
    ),
    'announcements', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_announcements),
      'last30d',  (SELECT COUNT(*)::int FROM golf_announcements WHERE created_at >= p_ago30d)
    ),
    'messages', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_messages),
      'last30d',  (SELECT COUNT(*)::int FROM golf_messages     WHERE created_at >= p_ago30d)
    ),
    'documents', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_documents),
      'last30d',  (SELECT COUNT(*)::int FROM golf_documents    WHERE created_at >= p_ago30d)
    ),
    'travel', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_travel_itineraries),
      'last30d',  (SELECT COUNT(*)::int FROM golf_travel_itineraries WHERE created_at >= p_ago30d)
    )
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- C4 — CoachHelm analytics rollup
-- ---------------------------------------------------------------------------
-- Collapses L1579, L1582, L1619-1625, L1627-1630, L1635, L1662, L1699-1700,
-- L1702 (9+ queries). Keeps `insightPlayerRows` so Slice C's L3226 scan can
-- be dropped.
CREATE OR REPLACE FUNCTION public.get_admin_coachhelm_rollup(
  p_ago7d   timestamptz,
  p_ago30d  timestamptz,
  p_ago12w  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      igl_totals AS (
        SELECT
          MAX(created_at)                                                      AS last_insight_at,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int                   AS insights_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d
                            AND COALESCE(insights_generated, 0) = 0)::int     AS insights_failed_7d
        FROM golf_insight_generation_log
      ),
      igl_12w AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'created_at',         created_at,
                'insights_generated', COALESCE(insights_generated, 0)
              )
              ORDER BY created_at ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago12w
      ),
      igl_30d_count AS (
        SELECT COUNT(*)::int AS cnt
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago30d
      ),
      igl_by_week AS (
        -- Bucketed weekly insight series (12 weeks). Payload mirrors L1699.
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_insight_generation_log
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      latest_insights AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                  id,
                'insight_type',        insight_type,
                'insights_generated',  insights_generated,
                'created_at',          created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, insight_type, insights_generated, created_at
          FROM golf_insight_generation_log
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Covers L3226 (Slice C): (player_id, insights_generated) rows.
      insight_player_rows AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',          player_id,
                'insights_generated', insights_generated
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE player_id IS NOT NULL
      ),
      reviews_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_reviews_all_time,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int   AS reviews_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS reviews_30d
        FROM golf_round_reviews
      ),
      reviews_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_round_reviews
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      -- funnel.roundsReviewed denominator: distinct reviewed round_ids.
      reviewed_round_ids AS (
        SELECT
          COALESCE(
            jsonb_agg(DISTINCT round_id),
            '[]'::jsonb
          ) AS arr
        FROM golf_round_reviews
        WHERE round_id IS NOT NULL
      ),
      patterns_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_patterns,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS patterns_30d
        FROM golf_patterns_v2
      ),
      predictions_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_predictions,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS predictions_30d
        FROM golf_predictions
      ),
      philosophy_count AS (
        SELECT COUNT(*)::int AS cnt FROM golf_coach_philosophy
      ),
      model_performance AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'model_type',         model_type,
                'accuracy_rate',      accuracy_rate,
                'calibration_score',  calibration_score,
                'predictions_made',   predictions_made
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT model_type, accuracy_rate, calibration_score, predictions_made, period_end
          FROM golf_prediction_model_performance
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      insight_effectiveness AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'insight_type',         insight_type,
                'action_rate',          action_rate,
                'improvement_rate',     improvement_rate,
                'effectiveness_score',  effectiveness_score
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT insight_type, action_rate, improvement_rate, effectiveness_score, period_end
          FROM golf_insight_effectiveness
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',             now(),
      'lastInsightAt',           (SELECT last_insight_at     FROM igl_totals),
      'insightsThisWeek',        (SELECT insights_this_week  FROM igl_totals),
      'insightsFailed7d',        (SELECT insights_failed_7d  FROM igl_totals),
      'insightGenLog12w',        (SELECT arr FROM igl_12w),
      'insightGenLog30dCount',   (SELECT cnt FROM igl_30d_count),
      'insightsByWeek',          (SELECT arr FROM igl_by_week),
      'latestInsights',          (SELECT arr FROM latest_insights),
      'insightPlayerRows',       (SELECT arr FROM insight_player_rows),
      'totalReviewsAllTime',     (SELECT total_reviews_all_time FROM reviews_totals),
      'reviewsThisWeek',         (SELECT reviews_this_week      FROM reviews_totals),
      'reviews30d',              (SELECT reviews_30d            FROM reviews_totals),
      'reviewsByWeek',           (SELECT arr FROM reviews_by_week),
      'reviewedRoundIds',        (SELECT arr FROM reviewed_round_ids),
      'totalPatterns',           (SELECT total_patterns     FROM patterns_totals),
      'patterns30d',             (SELECT patterns_30d       FROM patterns_totals),
      'totalPredictions',        (SELECT total_predictions  FROM predictions_totals),
      'predictions30d',          (SELECT predictions_30d    FROM predictions_totals),
      'coachPhilosophyCount',    (SELECT cnt FROM philosophy_count),
      'modelPerformance',        (SELECT arr FROM model_performance),
      'insightEffectiveness',    (SELECT arr FROM insight_effectiveness)
    )
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- Grants — authenticated only; the admin-role gate inside each function
-- body provides the actual access control.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_admin_rounds_rollup(
  timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_users_rollup(
  timestamptz, timestamptz, timestamptz, timestamptz
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_feature_adoption_rollup(
  timestamptz
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_coachhelm_rollup(
  timestamptz, timestamptz, timestamptz
) TO authenticated;
