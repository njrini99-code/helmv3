-- v3 Wave 11 — refresh_player_standing(p_team_ids uuid[]) RPC
--
-- The body of work the nightly /api/cron/v3/standing-refresh route invokes.
-- Loops over a hard-coded array of (metric_id, value_expr, direction)
-- triples and runs an upsert per metric scoped to the given team chunk.
--
-- All value expressions come from this function body (no user input).
-- EXECUTE is safe because the dynamic part of each statement is the
-- pre-trusted value expression; team_ids + metric_id are passed via
-- parameter substitution.
--
-- Per master plan Part VII.2 + cold-start rule Part VII.3:
--   - Only players with golf_player_stats_cache.rounds_played >= 5 enter.
--   - team_pct is the player's percentile within their team via PERCENT_RANK().
--   - Metrics with direction='lower_better' have the rank inverted so
--     higher team_pct always means "better."
--   - When a metric has no pga_tour_value (and no pga_p50 fallback), no
--     row is written for that (player, metric) pair — pga_value is NOT
--     NULL and we don't write rows without a real reference.
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT proname FROM pg_proc p
--   JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='refresh_player_standing';
--   -> [] (function does not exist; safe to create)
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.refresh_player_standing(uuid[]);

CREATE OR REPLACE FUNCTION public.refresh_player_standing(p_team_ids uuid[])
RETURNS TABLE (metric_id text, rows_upserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- (metric_id, value_expr, direction) — value_expr is plain SQL,
  -- evaluated against `golf_player_stats_cache cache`. Trusted at
  -- function-creation time; not derived from caller input.
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
    ['scoring_par_5',             'cache.par5_average',                'lower_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int;
  v_metric text;
  v_expr text;
  v_dir text;
  v_rank_order text;
  v_sql text;
  v_rows bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];

    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;

    v_sql := format($q$
      WITH team_values AS (
        SELECT
          p.id AS player_id,
          tm.team_id,
          (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm
          ON tm.player_id = p.id
         AND tm.status = 'active'::team_member_status
        JOIN public.golf_player_stats_cache cache
          ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1)
          AND cache.rounds_played >= 5
          AND (%s) IS NOT NULL
      ),
      team_stats AS (
        SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
        FROM team_values
        GROUP BY team_id
      ),
      ranked AS (
        SELECT
          tv.player_id,
          tv.team_id,
          tv.player_value,
          ts.team_avg,
          ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv
        JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      pga AS (
        SELECT pga_tour_value, pga_p50
        FROM public.golf_pga_standards
        WHERE metric_id = $2
        ORDER BY season DESC
        LIMIT 1
      )
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value,
        team_avg, team_n, team_pct,
        pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value,
        r.team_avg, r.team_n::int, r.team_pct,
        COALESCE(pga.pga_tour_value, pga.pga_p50),
        r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
        now()
      FROM ranked r
      CROSS JOIN pga
      WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
      ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value,
          team_avg = EXCLUDED.team_avg,
          team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct,
          pga_value = EXCLUDED.pga_value,
          pga_delta = EXCLUDED.pga_delta,
          computed_at = now();
    $q$, v_expr, v_expr, v_rank_order);

    EXECUTE v_sql USING p_team_ids, v_metric;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    metric_id := v_metric;
    rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.refresh_player_standing(uuid[]) IS
  'v3 W11. Loops over 15 metric bindings and upserts golf_player_standing rows for the given team chunk. Trusted SECURITY DEFINER — value expressions come from the function body, not the caller. Returns one (metric_id, rows_upserted) row per metric processed.';
