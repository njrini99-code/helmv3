-- Clubhouse Standing for this season: a season table with each row's own
-- round count (Clubhouse A+ row 104 window defect, rows 105 and 121,
-- 2026-10-24). AWAITING OWNER APPLY. Do not apply without the owner's
-- go-ahead.
--
-- DEPENDS ON the OD-01 chain (HELD.md apply queue, Step 7):
-- 20260924120000 creates golf_round_is_countable and
-- golf_round_is_score_countable, which this file calls. The DO block below
-- refuses to run without both. Apply this file after Step 7, then
-- 20261024150000 if it is not applied yet (either order works between those
-- two), then run the refresh under AFTER APPLY.
--
-- WHY.
--   * Window. Owner decision 9 (2026-10-24): "Standing window (B13.1): this
--     season (from 1 August, team time zone), labelled". golf_player_standing
--     mixes three windows: the 17 cache metrics are lifetime values from
--     golf_player_stats_cache (refresh_player_standing), the two pressure
--     metrics cover the last 90 days up to the database's CURRENT_DATE
--     (refresh_player_standing_round_metrics, v_window_days := 90), and
--     approach proximity covers every round on file
--     (refresh_player_standing_shot_metrics). No single label is true of it.
--   * Count. golf_player_standing has no per-player round count: level_n and
--     team_n are cohort sizes. Standing should say how many rounds each row
--     was built from.
--   * Fairway. golf_player_standing also feeds live Fairway (StandingBar,
--     genome, goals, focus areas and every CoachHelm generator). Changing its
--     window would change Fairway's numbers, so it stays exactly as it is.
--     Nothing in this file touches it or its three refresh functions (so the
--     OD-01 chain's md5 guards on those bodies are unaffected).
--
-- WHAT.
--   golf_season_start(tz, at)     new, STABLE: 1 August of the season `at`
--       falls in, on the wall clock of `tz`; a zone Postgres does not know
--       reads America/New_York (the product default). The SQL twin of
--       seasonStartDate in src/clubhouse/data/season.ts.
--   golf_player_standing_season   new table, the shape of
--       golf_player_standing plus rounds_n (the rounds this row's value was
--       built from) and season_start (the first day it covers).
--   refresh_player_standing_season(team_ids)  new SECURITY DEFINER RPC.
--       Writes the chunk's players' rows for every Standing metric over this
--       season only, from each player's team's season start (team time zone,
--       golf_team_settings.timezone; a player on two teams reads the earlier
--       start). Ranks against the team and the gender-scoped app-wide cohort
--       on the same rules as the three lifetime functions, then deletes the
--       chunk's players' rows it did not rewrite (a player who dropped under
--       a floor, or last season's rows once a new season starts).
--
-- HOW EACH METRIC IS COMPUTED (season rounds only, test rounds excluded):
--   strokes gained (5)   per-round mean of golf_round_stats_cache SG over
--       hole-countable rounds with SG (update_player_stats_complete's rule),
--       2 dp. rounds_n = rounds with SG.
--   GIR, sand saves      sum(hit) / sum(attempts) over hole-countable rounds,
--       2 dp. rounds_n = rounds with an attempt.
--   penalties per round  penalties / holes x 18 (rounds when no holes);
--       doubles or worse   (double + triple+) / all scored holes x 100.
--       rounds_n = hole-countable rounds.
--   par 3/4/5 scoring    mean hole score by par (golf_holes), 2 dp.
--       rounds_n = rounds with a scored hole of that par.
--   putts made by band   update_player_putt_make_pct's rule (putting shots,
--       distance clamped 0..120 ft, made = result 'hole' or putt_made), 1 dp.
--       rounds_n = rounds with a putt in the band.
--   The 17 above need 5 hole-countable rounds this season (the lifetime
--   gate is cache.rounds_played >= 5).
--   pressure gap         refresh_player_standing_round_metrics' rule (score
--       rule, 18-hole to-par basis, floors 3 / 3 / 5) over the season.
--       rounds_n = the tournament and practice rounds it compares.
--   opening hole gap     same function's rule (hole rule, 5 rounds).
--       rounds_n = rounds read.
--   approach proximity   refresh_player_standing_shot_metrics' all-shot rule
--       (completed rounds, lay-up split, floors 10 shots / 3 rounds, on-green
--       figure at 3 greens). rounds_n = rounds contributing.
--   Floors: team percentile at 5 teammates, cohort at 8 (the OD-01 chain's
--   values, 20260925120000). Tour value: tour = 'pga', newest season (the
--   lifetime functions do not filter tour; production's rows all carry the
--   PGA value, read-only check 2026-10-24).
--
-- SINGLE FLIGHT. The function takes a transaction advisory lock first, so
-- the nightly run and the short-interval dirty pass (20261024150000) never
-- upsert the same rows at once in different orders (40P01). They do not
-- queue indefinitely: a second caller waits only up to its role's
-- lock_timeout (authenticator: 8s) and then fails with 55P03. The dirty
-- pass treats 55P03 as a quiet skip (its marks stay, the next tick
-- retries); the nightly run logs it and the dirty pass covers marked teams.
--
-- SAFETY. New table, index and functions only; no existing object changes.
-- The player_id and metric_id foreign keys take SHARE ROW EXCLUSIVE locks on
-- golf_players and golf_metrics for the apply's transaction (writes to them
-- wait; reads do not); lock_timeout 3s caps that wait, so a busy table
-- fails the apply instead of queueing writes behind it. RLS is enabled with no policy and anon /
-- authenticated lose the default privileges, so only service_role reads or
-- writes the table (tighter than golf_player_standing, whose coach and
-- player read policies no caller of this table needs: the Clubhouse loader
-- reads it through the service client, scoped to the page's own player).
-- Both functions are revoked from PUBLIC, anon and authenticated and granted
-- to service_role; the RPC is SECURITY DEFINER with a pinned search_path.
--
-- AFTER APPLY (owner, service role), in the same session, once, so the table
-- is not empty until the next nightly run:
--   SELECT public.refresh_player_standing_season(ARRAY(SELECT id FROM public.golf_teams));
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.refresh_player_standing_season(uuid[]);
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_player_standing_season;
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_season_start(text, timestamptz);
-- ROLLBACK: (Clubhouse Standing then falls back to golf_player_standing, labelled "All time", with no row counts.)
--
-- VERIFY: select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'golf_player_standing_season' and c.relrowsecurity
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_player_standing_season', 'select') and not has_table_privilege('anon', 'public.golf_player_standing_season', 'select')
-- VERIFY: select 1 where has_function_privilege('service_role', 'public.refresh_player_standing_season(uuid[])', 'execute') and not has_function_privilege('authenticated', 'public.refresh_player_standing_season(uuid[])', 'execute')
-- VERIFY: select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_golf_player_standing_season_metric'
-- VERIFY: select 1 where public.golf_season_start('America/Los_Angeles', timestamptz '2026-08-01 05:00+00') = date '2025-08-01' and public.golf_season_start('America/New_York', timestamptz '2026-08-01 05:00+00') = date '2026-08-01'

DO $guard$
BEGIN
  IF to_regprocedure('public.golf_round_is_countable(text, integer, integer, integer, integer, integer, numeric)') IS NULL
     OR to_regprocedure('public.golf_round_is_score_countable(text, integer, integer, integer, integer, integer, numeric)') IS NULL THEN
    RAISE EXCEPTION 'season standing: golf_round_is_countable / golf_round_is_score_countable are missing. Apply the OD-01 chain (HELD.md Step 7) first.';
  END IF;
END
$guard$;

-- The foreign keys below take SHARE ROW EXCLUSIVE locks on golf_players and
-- golf_metrics for this transaction; cap the wait so writes are never queued.
set lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_season_start(p_tz text, p_at timestamptz DEFAULT now())
  RETURNS date
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public
AS $$
  WITH zone AS (
    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_tz) THEN p_tz
             ELSE 'America/New_York'
           END AS tz
  ),
  local_day AS (
    SELECT (p_at AT TIME ZONE zone.tz)::date AS d FROM zone
  )
  SELECT make_date(
           EXTRACT(YEAR FROM d)::integer - CASE WHEN EXTRACT(MONTH FROM d) >= 8 THEN 0 ELSE 1 END,
           8, 1)
    FROM local_day;
$$;

COMMENT ON FUNCTION public.golf_season_start(text, timestamptz) IS 'Owner decision 9 (2026-10-24): the golf season starts 1 August on the team''s wall clock. Returns that date for the season p_at falls in, read in p_tz; a zone Postgres does not know reads America/New_York, the product default. SQL twin of seasonStartDate (src/clubhouse/data/season.ts).';

CREATE TABLE IF NOT EXISTS public.golf_player_standing_season (
  player_id uuid NOT NULL REFERENCES public.golf_players (id) ON DELETE CASCADE,
  metric_id text NOT NULL REFERENCES public.golf_metrics (metric_id) ON DELETE RESTRICT,
  player_value numeric NOT NULL,
  team_avg numeric,
  -- A row count bounded by one team or level; never near 32 bits.
  -- squawk-ignore prefer-bigint-over-int
  team_n integer NOT NULL DEFAULT 0,
  team_pct numeric,
  level_avg numeric,
  -- A row count bounded by one team or level; never near 32 bits.
  -- squawk-ignore prefer-bigint-over-int
  level_n integer NOT NULL DEFAULT 0,
  level_pct numeric,
  pga_value numeric NOT NULL,
  pga_delta numeric,
  basis text,
  on_green_proximity_feet numeric,
  -- A count of one player's season shots; never near 32 bits.
  -- squawk-ignore prefer-bigint-over-int
  layup_excluded_n integer,
  -- A count of one player's season rounds; never near 32 bits.
  -- squawk-ignore prefer-bigint-over-int
  rounds_n integer NOT NULL,
  season_start date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_player_standing_season_pkey PRIMARY KEY (player_id, metric_id),
  CONSTRAINT golf_player_standing_season_basis_check CHECK (basis IS NULL OR basis IN ('on_green', 'all_shot')),
  CONSTRAINT golf_player_standing_season_rounds_n_check CHECK (rounds_n >= 0)
);

-- Metric-wide reads (a cohort across players) without a scan.
CREATE INDEX IF NOT EXISTS idx_golf_player_standing_season_metric ON public.golf_player_standing_season (metric_id);

ALTER TABLE public.golf_player_standing_season ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.golf_player_standing_season FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.golf_player_standing_season TO service_role;

COMMENT ON TABLE public.golf_player_standing_season IS 'Clubhouse Standing for this season (owner decision 9, 2026-10-24): one row per (player_id, metric_id), every metric over the rounds since 1 August in the team''s time zone. Same shape as golf_player_standing plus rounds_n and season_start. Written by refresh_player_standing_season (nightly standing-refresh cron and its dirty pass). service_role only. golf_player_standing (lifetime, Fairway) is unchanged.';
COMMENT ON COLUMN public.golf_player_standing_season.rounds_n IS 'Rounds this row''s value was built from (not a cohort size: team_n and level_n are those).';
COMMENT ON COLUMN public.golf_player_standing_season.season_start IS 'The first day this row covers: 1 August of the current season in the player''s team''s time zone (the earlier start when the player is on two teams).';

CREATE OR REPLACE FUNCTION public.refresh_player_standing_season(p_team_ids uuid[])
  RETURNS TABLE (out_metric_id text, out_rows_upserted bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_min_rounds constant int := 5;         -- cache-metric gate (cache.rounds_played >= 5)
  v_min_team_n constant int := 5;         -- team percentile floor (20260925120000)
  v_min_cohort_n constant int := 8;       -- cohort floor
  v_min_attempts constant int := 10;      -- approach proximity: shots
  v_min_shot_rounds constant int := 3;    -- approach proximity: rounds
  v_min_greens constant int := 3;         -- approach proximity: on-green figure
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Single flight: the nightly run and the dirty pass queue behind each other.
  PERFORM pg_advisory_xact_lock(hashtext('public.refresh_player_standing_season'));

  RETURN QUERY
  WITH
  -- golf_season_start reads pg_timezone_names (tens to hundreds of ms a
  -- call), so it runs once per distinct zone and once for the default, never
  -- per member (MATERIALIZED, so neither is inlined and re-run per row).
  zones AS MATERIALIZED (
    SELECT tz.timezone, public.golf_season_start(tz.timezone) AS season_start
      FROM (SELECT DISTINCT s.timezone FROM public.golf_team_settings s) tz
  ),
  default_start AS MATERIALIZED (
    SELECT public.golf_season_start('America/New_York') AS d
  ),
  -- Every active membership app-wide: the cohort is app-wide.
  members AS (
    SELECT tm.player_id, tm.team_id, COALESCE(t.gender, 'mens') AS gender,
           COALESCE(z.season_start, ds.d) AS season_start
      FROM public.golf_team_members tm
      JOIN public.golf_teams t ON t.id = tm.team_id
      CROSS JOIN default_start ds
      LEFT JOIN public.golf_team_settings s ON s.team_id = tm.team_id
      LEFT JOIN zones z ON z.timezone IS NOT DISTINCT FROM s.timezone
     WHERE tm.status = 'active'::public.team_member_status
  ),
  player_season AS (
    SELECT m.player_id, MIN(m.season_start) AS season_start
      FROM members m
     GROUP BY m.player_id
  ),
  season_rounds AS (
    SELECT r.id, r.player_id, r.status, r.round_type, r.score_to_par, r.holes_played,
           public.golf_round_is_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total) AS hole_ok,
           public.golf_round_is_score_countable(r.status, r.holes_played, r.total_score, r.front_nine, r.back_nine, r.total_putts, r.strokes_gained_total) AS score_ok,
           (r.status = 'completed' AND r.total_score IS NOT NULL) AS putt_ok
      FROM public.golf_rounds r
      JOIN player_season ps ON ps.player_id = r.player_id
     WHERE r.round_date >= ps.season_start
       AND NOT r.is_test
  ),
  -- golf_round_stats_cache over hole-countable season rounds
  -- (update_player_stats_complete's sums, season-bounded).
  rsc AS (
    SELECT sr.player_id,
           COUNT(*) AS rounds,
           COALESCE(SUM(COALESCE(sr.holes_played, 18)), 0) AS holes,
           SUM(c.greens_hit) AS greens_hit, SUM(c.greens_total) AS greens_total,
           SUM(c.sand_saves) AS sand_saves, SUM(c.sand_attempts) AS sand_attempts,
           SUM(c.penalty_strokes) AS penalties,
           SUM(COALESCE(c.eagles, 0) + COALESCE(c.birdies, 0) + COALESCE(c.pars, 0) + COALESCE(c.bogeys, 0) + COALESCE(c.double_bogeys, 0) + COALESCE(c.triple_plus, 0)) AS scored_holes,
           SUM(COALESCE(c.double_bogeys, 0) + COALESCE(c.triple_plus, 0)) AS big_holes,
           AVG(c.strokes_gained_total) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_total,
           AVG(c.strokes_gained_tee) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_ott,
           AVG(c.strokes_gained_approach) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_approach,
           AVG(c.strokes_gained_around_green) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_around_green,
           AVG(c.strokes_gained_putting) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_putting,
           COUNT(*) FILTER (WHERE c.strokes_gained_total IS NOT NULL) AS sg_n,
           COUNT(*) FILTER (WHERE c.greens_total > 0) AS gir_n,
           COUNT(*) FILTER (WHERE c.sand_attempts > 0) AS sand_n
      FROM season_rounds sr
      JOIN public.golf_round_stats_cache c ON c.round_id = sr.id
     WHERE sr.hole_ok
     GROUP BY sr.player_id
  ),
  par_scoring AS (
    SELECT sr.player_id,
           AVG(h.score) FILTER (WHERE h.par = 3) AS par3, COUNT(DISTINCT sr.id) FILTER (WHERE h.par = 3 AND h.score IS NOT NULL) AS par3_n,
           AVG(h.score) FILTER (WHERE h.par = 4) AS par4, COUNT(DISTINCT sr.id) FILTER (WHERE h.par = 4 AND h.score IS NOT NULL) AS par4_n,
           AVG(h.score) FILTER (WHERE h.par = 5) AS par5, COUNT(DISTINCT sr.id) FILTER (WHERE h.par = 5 AND h.score IS NOT NULL) AS par5_n
      FROM season_rounds sr
      JOIN public.golf_holes h ON h.round_id = sr.id
     WHERE sr.hole_ok
     GROUP BY sr.player_id
  ),
  putts AS (
    SELECT sr.player_id, sr.id AS round_id,
           LEAST(GREATEST(gs.distance_to_hole_before, 0), 120) AS feet,
           (gs.result = 'hole' OR gs.putt_made IS TRUE) AS made
      FROM season_rounds sr
      JOIN public.golf_shots gs ON gs.round_id = sr.id
     WHERE sr.hole_ok AND sr.putt_ok
       AND lower(gs.shot_type) = 'putting'
       AND gs.distance_to_hole_before IS NOT NULL
  ),
  putt_bands AS (
    SELECT p.player_id, b.metric_id,
           ROUND(100.0 * COUNT(*) FILTER (WHERE p.made) / NULLIF(COUNT(*), 0), 1) AS player_value,
           COUNT(DISTINCT p.round_id) AS rounds_n
      FROM putts p
      JOIN (VALUES
              ('putts_made_3_5ft_pct',      3::numeric,  5::numeric),
              ('putts_made_5_10ft_pct',     5::numeric,  10::numeric),
              ('putts_made_10_15ft_pct',    10::numeric, 15::numeric),
              ('putts_made_15_25ft_pct',    15::numeric, 25::numeric),
              ('putts_made_25_plus_ft_pct', 25::numeric, 1000::numeric)
           ) AS b(metric_id, lo, hi)
        ON p.feet > b.lo AND p.feet <= b.hi
     GROUP BY p.player_id, b.metric_id
  ),
  -- The 17 cache metrics, gated at 5 hole-countable season rounds.
  cache_vals AS (
    SELECT x.player_id, x.metric_id, x.player_value, x.rounds_n
      FROM rsc
      LEFT JOIN par_scoring ps ON ps.player_id = rsc.player_id
      CROSS JOIN LATERAL (VALUES
        (rsc.player_id, 'sg_total',               ROUND(rsc.sg_total, 2),        rsc.sg_n),
        (rsc.player_id, 'sg_ott',                 ROUND(rsc.sg_ott, 2),          rsc.sg_n),
        (rsc.player_id, 'sg_approach',            ROUND(rsc.sg_approach, 2),     rsc.sg_n),
        (rsc.player_id, 'sg_around_green',        ROUND(rsc.sg_around_green, 2), rsc.sg_n),
        (rsc.player_id, 'sg_putting',             ROUND(rsc.sg_putting, 2),      rsc.sg_n),
        (rsc.player_id, 'gir_pct',                CASE WHEN rsc.greens_total > 0 THEN ROUND(100.0 * rsc.greens_hit / rsc.greens_total, 2) END, rsc.gir_n),
        (rsc.player_id, 'scrambling_pct_sand',    CASE WHEN rsc.sand_attempts > 0 THEN ROUND(100.0 * rsc.sand_saves / rsc.sand_attempts, 2) END, rsc.sand_n),
        (rsc.player_id, 'penalty_rate_per_round', CASE WHEN rsc.holes > 0 THEN ROUND(rsc.penalties::numeric / rsc.holes * 18, 2)
                                                       WHEN rsc.rounds > 0 THEN ROUND(rsc.penalties::numeric / rsc.rounds, 2) END, rsc.rounds),
        (rsc.player_id, 'big_number_rate',        CASE WHEN rsc.scored_holes > 0 THEN 100.0 * rsc.big_holes / rsc.scored_holes END, rsc.rounds),
        (rsc.player_id, 'scoring_par_3',          ROUND(ps.par3, 2), COALESCE(ps.par3_n, 0)),
        (rsc.player_id, 'scoring_par_4',          ROUND(ps.par4, 2), COALESCE(ps.par4_n, 0)),
        (rsc.player_id, 'scoring_par_5',          ROUND(ps.par5, 2), COALESCE(ps.par5_n, 0))
      ) AS x(player_id, metric_id, player_value, rounds_n)
     WHERE rsc.rounds >= v_min_rounds
    UNION ALL
    SELECT pb.player_id, pb.metric_id, pb.player_value, pb.rounds_n
      FROM putt_bands pb
      JOIN rsc ON rsc.player_id = pb.player_id AND rsc.rounds >= v_min_rounds
  ),
  -- Pressure gap: refresh_player_standing_round_metrics' rule over the season.
  pressure_vals AS (
    SELECT sr.player_id, 'practice_tournament_delta'::text AS metric_id,
           AVG(sr.score_to_par::numeric * 18 / NULLIF(COALESCE(sr.holes_played, 18), 0)) FILTER (WHERE sr.round_type IN ('tournament', 'qualifier', 'qualifying'))
             - AVG(sr.score_to_par::numeric * 18 / NULLIF(COALESCE(sr.holes_played, 18), 0)) FILTER (WHERE sr.round_type = 'practice') AS player_value,
           COUNT(*) FILTER (WHERE sr.round_type IN ('tournament', 'qualifier', 'qualifying', 'practice') AND sr.score_to_par IS NOT NULL) AS rounds_n
      FROM season_rounds sr
     WHERE sr.score_ok
     GROUP BY sr.player_id
    HAVING COUNT(*) FILTER (WHERE sr.round_type IN ('tournament', 'qualifier', 'qualifying') AND sr.score_to_par IS NOT NULL) >= 3
       AND COUNT(*) FILTER (WHERE sr.round_type = 'practice' AND sr.score_to_par IS NOT NULL) >= 3
       AND COUNT(*) >= v_min_rounds
  ),
  -- Opening hole gap: the same function's rule over the season.
  opening_vals AS (
    SELECT sr.player_id, 'opening_hole_delta'::text AS metric_id,
           AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
             - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) AS player_value,
           COUNT(DISTINCT sr.id) AS rounds_n
      FROM season_rounds sr
      JOIN public.golf_holes h ON h.round_id = sr.id AND h.score IS NOT NULL AND h.par IS NOT NULL
     WHERE sr.hole_ok
     GROUP BY sr.player_id
    HAVING COUNT(DISTINCT sr.id) >= v_min_rounds
       AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
       AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
  ),
  -- Approach proximity: refresh_player_standing_shot_metrics' all-shot rule
  -- over the season.
  shots AS (
    SELECT sr.player_id, sr.id AS round_id, b.metric_id, h.par,
           (lower(coalesce(s.result, '')) IN ('green', 'hole', 'gir') OR lower(coalesce(s.lie_after, '')) = 'green') AS on_green,
           (CASE WHEN lower(coalesce(s.distance_unit_after, 'feet')) = 'yards' THEN s.distance_to_hole_after * 3.0 ELSE s.distance_to_hole_after END) AS after_ft
      FROM season_rounds sr
      JOIN public.golf_shots s
        ON s.round_id = sr.id
       AND s.shot_type = 'approach'
       AND s.distance_to_hole_before IS NOT NULL
       AND s.distance_to_hole_after IS NOT NULL
      JOIN (VALUES
              ('approach_proximity_50_125ft',    50::numeric,  125::numeric),
              ('approach_proximity_125_175ft',   125::numeric, 175::numeric),
              ('approach_proximity_175_plus_ft', 175::numeric, 100000::numeric)
           ) AS b(metric_id, lo, hi)
        ON (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet' THEN s.distance_to_hole_before / 3.0 ELSE s.distance_to_hole_before END) >= b.lo
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet' THEN s.distance_to_hole_before / 3.0 ELSE s.distance_to_hole_before END) < b.hi
      LEFT JOIN public.golf_holes h ON h.id = s.hole_id
     WHERE sr.status = 'completed'
  ),
  shot_tagged AS (
    SELECT sh.*,
           (sh.metric_id = 'approach_proximity_175_plus_ft' AND sh.par IS NOT DISTINCT FROM 5 AND NOT sh.on_green) AS is_likely_layup
      FROM shots sh
  ),
  shot_vals AS (
    SELECT st.player_id, st.metric_id,
           AVG(st.after_ft) FILTER (WHERE NOT st.is_likely_layup) AS player_value,
           COUNT(DISTINCT st.round_id) FILTER (WHERE NOT st.is_likely_layup) AS rounds_n,
           CASE WHEN COUNT(*) FILTER (WHERE NOT st.is_likely_layup AND st.on_green) >= v_min_greens
                THEN AVG(st.after_ft) FILTER (WHERE NOT st.is_likely_layup AND st.on_green) END AS on_green_avg,
           COUNT(*) FILTER (WHERE st.is_likely_layup) AS layup_n
      FROM shot_tagged st
     GROUP BY st.player_id, st.metric_id
    HAVING COUNT(*) FILTER (WHERE NOT st.is_likely_layup) >= v_min_attempts
       AND COUNT(DISTINCT st.round_id) FILTER (WHERE NOT st.is_likely_layup) >= v_min_shot_rounds
  ),
  vals AS (
    SELECT cv.player_id, cv.metric_id, cv.player_value, cv.rounds_n::int AS rounds_n,
           NULL::text AS basis, NULL::numeric AS on_green_avg, NULL::int AS layup_n
      FROM cache_vals cv
     WHERE cv.player_value IS NOT NULL
    UNION ALL
    SELECT pv.player_id, pv.metric_id, pv.player_value, pv.rounds_n::int, NULL, NULL, NULL
      FROM pressure_vals pv
     WHERE pv.player_value IS NOT NULL
    UNION ALL
    SELECT ov.player_id, ov.metric_id, ov.player_value, ov.rounds_n::int, NULL, NULL, NULL
      FROM opening_vals ov
     WHERE ov.player_value IS NOT NULL
    UNION ALL
    SELECT sv.player_id, sv.metric_id, sv.player_value, sv.rounds_n::int, 'all_shot', sv.on_green_avg, sv.layup_n::int
      FROM shot_vals sv
     WHERE sv.player_value IS NOT NULL
  ),
  -- Direction, as the lifetime functions rank: higher is better unless listed.
  lower_better (metric_id) AS (
    VALUES ('penalty_rate_per_round'), ('big_number_rate'), ('scoring_par_3'), ('scoring_par_4'), ('scoring_par_5'),
           ('practice_tournament_delta'), ('opening_hole_delta'),
           ('approach_proximity_50_125ft'), ('approach_proximity_125_175ft'), ('approach_proximity_175_plus_ft')
  ),
  vals_team AS (
    SELECT v.*, m.team_id, m.gender,
           CASE WHEN lb.metric_id IS NOT NULL THEN -v.player_value ELSE v.player_value END AS rank_value
      FROM vals v
      JOIN members m ON m.player_id = v.player_id
      LEFT JOIN lower_better lb ON lb.metric_id = v.metric_id
  ),
  team_ranked AS (
    SELECT vt.*,
           AVG(vt.player_value) OVER (PARTITION BY vt.team_id, vt.metric_id) AS team_avg,
           COUNT(*) OVER (PARTITION BY vt.team_id, vt.metric_id) AS team_n,
           100 * PERCENT_RANK() OVER (PARTITION BY vt.team_id, vt.metric_id ORDER BY vt.rank_value ASC) AS team_pct
      FROM vals_team vt
     WHERE vt.team_id = ANY (p_team_ids)
  ),
  -- One row per (player, metric) even for a player on two chunk teams: the
  -- larger team, then the lower team id.
  chosen AS (
    SELECT DISTINCT ON (tr.player_id, tr.metric_id) tr.*
      FROM team_ranked tr
     ORDER BY tr.player_id, tr.metric_id, tr.team_n DESC, tr.team_id
  ),
  population AS (
    SELECT DISTINCT vt.player_id, vt.gender, vt.metric_id, vt.player_value, vt.rank_value
      FROM vals_team vt
  ),
  pop_stats AS (
    SELECT p.gender, p.metric_id, AVG(p.player_value) AS level_avg, COUNT(*) AS level_n
      FROM population p
     GROUP BY p.gender, p.metric_id
  ),
  pop_ranked AS (
    SELECT p.player_id, p.gender, p.metric_id,
           100 * PERCENT_RANK() OVER (PARTITION BY p.gender, p.metric_id ORDER BY p.rank_value ASC) AS level_pct
      FROM population p
  ),
  upserted AS (
    INSERT INTO public.golf_player_standing_season AS s (
      player_id, metric_id, player_value, team_avg, team_n, team_pct,
      level_avg, level_n, level_pct, pga_value, pga_delta,
      basis, on_green_proximity_feet, layup_excluded_n, rounds_n, season_start, computed_at
    )
    SELECT c.player_id, c.metric_id, c.player_value, c.team_avg, c.team_n::int,
           CASE WHEN c.team_n >= v_min_team_n THEN c.team_pct END,
           CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg END,
           ps.level_n::int,
           CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct END,
           pga.value,
           c.player_value - pga.value,
           c.basis, c.on_green_avg, c.layup_n, c.rounds_n, pse.season_start, now()
      FROM chosen c
      JOIN player_season pse ON pse.player_id = c.player_id
      JOIN pop_stats ps ON ps.gender = c.gender AND ps.metric_id = c.metric_id
      LEFT JOIN pop_ranked pr ON pr.player_id = c.player_id AND pr.gender = c.gender AND pr.metric_id = c.metric_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(g.pga_tour_value, g.pga_p50) AS value
          FROM public.golf_pga_standards g
         WHERE g.metric_id = c.metric_id AND g.tour = 'pga'
         ORDER BY g.season DESC
         LIMIT 1
      ) pga
     WHERE pga.value IS NOT NULL
    ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
          level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta,
          basis = EXCLUDED.basis, on_green_proximity_feet = EXCLUDED.on_green_proximity_feet,
          layup_excluded_n = EXCLUDED.layup_excluded_n, rounds_n = EXCLUDED.rounds_n,
          season_start = EXCLUDED.season_start, computed_at = now()
    RETURNING s.metric_id
  )
  SELECT u.metric_id, COUNT(*)::bigint
    FROM upserted u
   GROUP BY u.metric_id
   ORDER BY u.metric_id;

  -- The chunk's players' rows this run did not rewrite: under a floor now,
  -- last season's, or a member who is no longer active on any team. now() is
  -- this transaction's start, so every row written above carries it. A
  -- player inactive here but active on a team outside the chunk keeps their
  -- rows (that team's run writes them).
  DELETE FROM public.golf_player_standing_season s
   WHERE s.computed_at < now()
     AND (
       s.player_id IN (
         SELECT tm.player_id
           FROM public.golf_team_members tm
          WHERE tm.team_id = ANY (p_team_ids)
            AND tm.status = 'active'::public.team_member_status
       )
       OR (
         s.player_id IN (SELECT tm.player_id FROM public.golf_team_members tm WHERE tm.team_id = ANY (p_team_ids))
         AND NOT EXISTS (
           SELECT 1 FROM public.golf_team_members a
            WHERE a.player_id = s.player_id
              AND a.status = 'active'::public.team_member_status
         )
       )
     );
END;
$$;

COMMENT ON FUNCTION public.refresh_player_standing_season(uuid[]) IS 'Clubhouse Standing for this season (owner decision 9, 2026-10-24). For the given team chunk, writes golf_player_standing_season: every Standing metric over the rounds since 1 August in the team''s time zone (golf_season_start), with rounds_n per row, ranked against the team (MIN_TEAM_N=5) and the gender-scoped app-wide cohort (MIN_COHORT_N=8) on the lifetime functions'' rules; then deletes the chunk players'' rows it did not rewrite. Takes a transaction advisory lock (single flight). Returns (metric, rows upserted). SECURITY DEFINER, service_role only. golf_player_standing is not touched.';

REVOKE ALL ON FUNCTION public.golf_season_start(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_player_standing_season(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_season_start(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_player_standing_season(uuid[]) TO service_role;
