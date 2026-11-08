-- Division cohort: the mean of each standing metric over the college players on Helm at one level (Division I, II or III), by gender.
--
-- HELD (supabase/migrations/HELD.md): written for Ask's level comparison, not applied anywhere.
--
-- WHY
-- ---
-- golf_pga_standards' division columns hold figures with no traceable basis (an internal "college trend" note, Shot Scope's 0-handicap
-- players, or nothing), so Ask no longer states them. The level reference is instead Helm's own data: the mean of the players on Helm whose
-- team plays at the same level. golf_player_standing already holds a gender-wide cohort (level_avg / level_n / level_pct, floor 8) but not one
-- per division, and a player cannot read other players' rows, so a per-division mean has to be computed on the server and exposed as an
-- aggregate only.
--
-- WHAT
-- ----
--   1. public.college_level_of(text): the SQL twin of levelFromDivision() in src/lib/coachhelm/v3/chat/benchmark-reads.ts ('d1' | 'd2' | 'd3',
--      null for NAIA / junior college / unset).
--   2. public.golf_division_cohort: one row per (gender, level, metric_id): cohort_avg and cohort_n. A row exists only for a cohort of at least
--      8 players, so no row can describe a handful of individuals. SELECT for signed-in users (aggregates, no player column); writes only
--      through refresh_division_cohort() (service role).
--   3. public.refresh_division_cohort(): rebuilds the table from golf_player_standing.player_value (the very values the gender cohort and the
--      places are built from), for the players on an active team whose level (newest golf_team_seasons.division, else organizations.division)
--      is known. A player on two teams of different levels counts once at each.
--
-- HOW ASK USES IT
-- ---------------
-- The caller leaves themself out: mean_without_me = (cohort_avg * cohort_n - my_value) / (cohort_n - 1), and states it only if cohort_n - 1 >= 8.
-- The table carries no player column, so nothing here reveals any one player's figure.
--
-- SAFETY: additive (one table, two functions); no existing object is changed. refresh_division_cohort is SECURITY DEFINER with search_path
-- pinned, executable by service_role only. Until a cron calls it (after the standing refresh), the table stays as this file leaves it: the
-- statement at the end fills it once.
--
-- VERIFY (after apply):
--   SELECT gender, level, count(*) AS metrics, min(cohort_n) AS smallest_cohort FROM public.golf_division_cohort GROUP BY 1, 2;  -- smallest_cohort >= 8
--   SELECT public.college_level_of('NCAA Division II'), public.college_level_of('d3'), public.college_level_of('NAIA'), public.college_level_of(NULL);  -- d2, d3, NULL, NULL
--   -- as an authenticated user: SELECT * FROM public.golf_division_cohort LIMIT 1;  -- allowed; INSERT / UPDATE / DELETE denied.
--
-- ROLLBACK: DROP FUNCTION public.refresh_division_cohort(); DROP TABLE public.golf_division_cohort; DROP FUNCTION public.college_level_of(text);
--   Nothing else reads them until Ask's code does, and the code treats a missing table as "no division cohort" and falls back to the
--   gender-wide college cohort.

CREATE OR REPLACE FUNCTION public.college_level_of(p_division text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_division IS NULL THEN NULL
    -- Another association's divisions (NAIA, junior college) have no published college level.
    WHEN lower(p_division) ~ '(naia|njcaa|juco|junior|ccca|cccaa|nccaa)' THEN NULL
    ELSE (
      SELECT CASE m[1] WHEN '1' THEN 'd1' WHEN 'i' THEN 'd1' WHEN '2' THEN 'd2' WHEN 'ii' THEN 'd2' WHEN '3' THEN 'd3' WHEN 'iii' THEN 'd3' END
      FROM (
        SELECT COALESCE(
          -- "d1", "NCAA D1", "NCAA Division III", "div 2", "D-II"
          regexp_match(lower(p_division), '(?:division|div|d)[\s._-]*(iii|ii|i|1|2|3)(?![a-z0-9])'),
          -- a bare "1" / "iii"
          regexp_match(btrim(lower(p_division)), '^(iii|ii|i|1|2|3)$')
        ) AS m
      ) x
    )
  END
$function$;

COMMENT ON FUNCTION public.college_level_of(text) IS 'The college level of a division string: d1, d2, d3, or NULL (NAIA, junior college, unset). SQL twin of levelFromDivision() in src/lib/coachhelm/v3/chat/benchmark-reads.ts.';

CREATE TABLE IF NOT EXISTS public.golf_division_cohort (
  gender       text        NOT NULL CHECK (gender IN ('mens', 'womens')),
  level        text        NOT NULL CHECK (level IN ('d1', 'd2', 'd3')),
  metric_id    text        NOT NULL REFERENCES public.golf_metrics (metric_id) ON DELETE CASCADE,
  cohort_avg   numeric     NOT NULL,
  cohort_n     integer     NOT NULL CHECK (cohort_n >= 8),
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gender, level, metric_id)
);

COMMENT ON TABLE public.golf_division_cohort IS 'Mean of golf_player_standing.player_value over the players on Helm at one college level and gender, one row per metric, only for cohorts of 8 or more. Aggregates only: no player column. Rebuilt by refresh_division_cohort().';

ALTER TABLE public.golf_division_cohort ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_division_cohort_read ON public.golf_division_cohort;
CREATE POLICY golf_division_cohort_read ON public.golf_division_cohort FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.golf_division_cohort FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.golf_division_cohort TO authenticated;
GRANT ALL ON TABLE public.golf_division_cohort TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_division_cohort()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_rows integer;
BEGIN
  WITH team_level AS (
    SELECT t.id AS team_id,
           COALESCE(t.gender, 'mens') AS gender,
           -- The newest season row's division; failing that, the program's division (as Ask reads it).
           COALESCE(
             public.college_level_of((SELECT ts.division FROM public.golf_team_seasons ts WHERE ts.team_id = t.id ORDER BY ts.season DESC LIMIT 1)),
             public.college_level_of(o.division)
           ) AS level
    FROM public.golf_teams t
    LEFT JOIN public.organizations o ON o.id = t.organization_id
  ),
  members AS (
    SELECT DISTINCT tm.player_id, tl.gender, tl.level
    FROM public.golf_team_members tm
    JOIN team_level tl ON tl.team_id = tm.team_id
    WHERE tm.status = 'active'::team_member_status AND tl.level IS NOT NULL AND tl.gender IN ('mens', 'womens')
  ),
  agg AS (
    SELECT m.gender, m.level, s.metric_id, AVG(s.player_value) AS cohort_avg, COUNT(DISTINCT s.player_id)::integer AS cohort_n
    FROM members m
    JOIN public.golf_player_standing s ON s.player_id = m.player_id
    GROUP BY m.gender, m.level, s.metric_id
    HAVING COUNT(DISTINCT s.player_id) >= 8
  )
  INSERT INTO public.golf_division_cohort AS c (gender, level, metric_id, cohort_avg, cohort_n, computed_at)
  SELECT gender, level, metric_id, cohort_avg, cohort_n, now() FROM agg
  ON CONFLICT (gender, level, metric_id) DO UPDATE
  SET cohort_avg = EXCLUDED.cohort_avg, cohort_n = EXCLUDED.cohort_n, computed_at = EXCLUDED.computed_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- A cohort that fell under the floor (or lost its level) leaves no row behind.
  DELETE FROM public.golf_division_cohort WHERE computed_at < v_started;
  RETURN v_rows;
END;
$function$;

COMMENT ON FUNCTION public.refresh_division_cohort() IS 'Rebuilds golf_division_cohort from golf_player_standing. Trusted SECURITY DEFINER; service role only. Call after the standing refresh.';

REVOKE ALL ON FUNCTION public.refresh_division_cohort() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_division_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.college_level_of(text) TO authenticated, service_role;

SELECT public.refresh_division_cohort();
