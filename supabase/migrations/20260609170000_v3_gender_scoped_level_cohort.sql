-- Gender-scoped level_avg cohort for refresh_player_standing (audit P3).
--
-- WHY
-- ---
-- refresh_player_standing's population_values CTE pools EVERY active college
-- player across all teams into ONE app-wide cohort (level_avg / level_n /
-- level_pct), with NO gender split. As a result a women's-team player (Grace,
-- team gender='womens') and a men's-team player (Tyler, gender='mens') share
-- the IDENTICAL level_avg (audit P3: both carry par_4 level_avg 4.3076923,
-- level_n 13). That mixed cohort is the counterfactual's primary target, so a
-- women's player's CF impact + priority are computed against a partly-men's
-- baseline. golf_teams.gender (migration 20260607160000, text 'mens'/'womens',
-- NOT NULL DEFAULT 'mens', CHECK constraint) makes the split trivial and exact:
-- college golf teams are single-gender.
--
-- WHAT CHANGED (vs 20260606180000_standing_putt_band_binding_fix.sql — the prior
-- canonical body; v_bindings are byte-for-byte identical):
--   1. team_values + population_values now also carry the player's team gender
--      (tm.team_id -> golf_teams.gender), defaulted to 'mens' for safety.
--   2. pop_stats / pop_ranked are GENDER-PARTITIONED: level_avg/level_n are
--      grouped BY gender; level_pct is PERCENT_RANK() OVER (PARTITION BY gender).
--   3. The INSERT joins each ranked player to the pop_stats / pop_ranked row for
--      THEIR OWN gender (pop_stats ps ON ps.gender = r.gender), instead of a
--      blind CROSS JOIN to the single pooled aggregate.
-- Everything else (team_avg/team_pct, MIN_COHORT_N=8 / MIN_TEAM_N=3 guards, PGA
-- join, ON CONFLICT upsert, dynamic v_bindings loop) is unchanged.
--
-- SAFETY: pure CREATE OR REPLACE of an existing SECURITY DEFINER function;
-- identical signature (uuid[]) -> TABLE(metric_id text, rows_upserted bigint),
-- search_path pinned to 'public', lock-free (Squawk-safe). Grants re-asserted
-- below to preserve the anon/authenticated/service_role surface verbatim.
--
-- VERIFIED: <pending orchestrator apply — run the verification queries below>
--   -- after apply + a standing-refresh cron pass, women & men must NOT share level_avg:
--   --   SELECT s.metric_id, t.gender, COUNT(DISTINCT s.level_avg) AS distinct_level_avgs
--   --   FROM public.golf_player_standing s
--   --   JOIN public.golf_team_members tm ON tm.player_id = s.player_id AND tm.status='active'
--   --   JOIN public.golf_teams t ON t.id = tm.team_id
--   --   WHERE s.metric_id = 'scoring_par_4'
--   --   GROUP BY s.metric_id, t.gender;   -- expect a DIFFERENT level_avg per gender
--   -- men's-team level_avg must be UNCHANGED vs the pre-migration pooled value
--   --   only if the population happened to be all-men; otherwise it tightens to men-only.
--
-- ROLLBACK: re-apply 20260606180000_standing_putt_band_binding_fix.sql verbatim
--   (it is the prior CREATE OR REPLACE of this exact function/signature). No data
--   migration is needed — the next standing-refresh cron pass overwrites
--   level_avg/level_pct via the ON CONFLICT upsert.

CREATE OR REPLACE FUNCTION public.refresh_player_standing(p_team_ids uuid[])
 RETURNS TABLE(metric_id text, rows_upserted bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bindings text[][] := ARRAY[
    ['sg_total',                  'cache.sg_total_per_round',          'higher_better'],
    ['sg_ott',                    'cache.sg_tee_per_round',            'higher_better'],
    ['sg_approach',               'cache.sg_approach_per_round',       'higher_better'],
    ['sg_around_green',           'cache.sg_around_green_per_round',   'higher_better'],
    ['sg_putting',                'cache.sg_putting_per_round',        'higher_better'],
    ['putts_made_3_5ft_pct',      'cache.putt_make_pct_3_5ft',         'higher_better'],
    ['putts_made_5_10ft_pct',     'cache.putt_make_pct_5_10ft',        'higher_better'],
    ['putts_made_10_15ft_pct',    'cache.putt_make_pct_10_15ft',       'higher_better'],
    ['gir_pct',                   'cache.gir_percentage',              'higher_better'],
    ['scrambling_pct_sand',       'cache.sand_save_percentage',        'higher_better'],
    ['penalty_rate_per_round',    'cache.penalty_strokes_per_round',   'lower_better'],
    ['big_number_rate',           'CASE WHEN COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0) > 0 THEN 100.0 * (COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0))::numeric / (COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0)) ELSE NULL END',
                                                                       'lower_better'],
    ['scoring_par_3',             'cache.par3_average',                'lower_better'],
    ['scoring_par_4',             'cache.par4_average',                'lower_better'],
    ['scoring_par_5',             'cache.par5_average',                'lower_better'],
    ['putts_made_15_25ft_pct',    'cache.putt_make_pct_15_25ft',       'higher_better'],
    ['putts_made_25_plus_ft_pct', 'cache.putt_make_pct_25_plus_ft',    'higher_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int; v_metric text; v_expr text; v_dir text; v_rank_order text; v_sql text; v_rows bigint;
  v_min_cohort_n constant int := 8;
  v_min_team_n constant int := 3;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN RETURN; END IF;
  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];
    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;
    v_sql := format($q$
      WITH team_values AS (
        SELECT p.id AS player_id, tm.team_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1) AND cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      team_stats AS (SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n FROM team_values GROUP BY team_id),
      ranked AS (
        SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      -- App-wide POPULATION, now carrying the player's team gender. DISTINCT so a
      -- player on >1 active team is counted once per (gender, value). Not filtered
      -- by p_team_ids — the cohort is app-wide WITHIN a gender.
      population_values AS (
        SELECT DISTINCT p.id AS player_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      -- Gender-scoped cohort aggregates (audit P3): one level_avg / level_n per gender.
      pop_stats AS (SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n FROM population_values GROUP BY gender),
      pop_ranked AS (SELECT player_id, gender, 100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value %s)) AS level_pct FROM population_values),
      pga AS (SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards WHERE metric_id = $2 ORDER BY season DESC LIMIT 1)
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value, team_avg, team_n, team_pct,
        level_avg, level_n, level_pct, pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value, r.team_avg, r.team_n::int,
        CASE WHEN r.team_n >= $4 THEN r.team_pct ELSE NULL END,
        CASE WHEN ps.level_n >= $3 THEN ps.level_avg ELSE NULL END,
        ps.level_n::int,
        CASE WHEN ps.level_n >= $3 THEN pr.level_pct ELSE NULL END,
        COALESCE(pga.pga_tour_value, pga.pga_p50),
        r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50), now()
      FROM ranked r
      JOIN pop_stats ps ON ps.gender = r.gender
      LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
      CROSS JOIN pga
      WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
      ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
          level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta, computed_at = now();
    $q$, v_expr, v_expr, v_rank_order, v_expr, v_expr, v_rank_order);
    EXECUTE v_sql USING p_team_ids, v_metric, v_min_cohort_n, v_min_team_n;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    metric_id := v_metric; rows_upserted := v_rows; RETURN NEXT;
    v_i := v_i + 1;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.refresh_player_standing(uuid[]) IS 'v3 W11 + gender-scoped level cohort (audit P3, 2026-06-09). Loops over the metric bindings and upserts golf_player_standing rows for the given team chunk. team_avg/team_pct per team (MIN_TEAM_N=3); level_avg/level_n/level_pct are now an app-wide cohort SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. Trusted SECURITY DEFINER — value expressions come from the function body, not the caller.';

-- Preserve the grant surface verbatim (matches 20260527000000_prod_public_baseline.sql).
-- SECURITY: service_role ONLY. This SECURITY DEFINER refresh RPC bypasses RLS
-- and mutates standing rows — anon/authenticated EXECUTE on it was the exact
-- P0 regression the 2026-06-06 audit closed (and caught re-shipping twice).
-- The grant-hardening pgTAP assertion (rpc_grant_hardening) locks this.
REVOKE EXECUTE ON FUNCTION public.refresh_player_standing(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_player_standing(uuid[]) TO service_role;
