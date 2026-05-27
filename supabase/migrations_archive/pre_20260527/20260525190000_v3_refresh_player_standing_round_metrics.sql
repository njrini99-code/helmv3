-- v3 Wave 24 prep — refresh_player_standing_round_metrics RPC
--
-- Companion to W11's refresh_player_standing (which only covers cache-
-- backed metrics). This function populates the 2 round-level v3 metrics:
--
--   practice_tournament_delta — avg score_to_par on tournament+qualifier
--     rounds minus avg score_to_par on practice rounds. Lower = better
--     (smaller pressure gap).
--
--   opening_hole_delta — avg (hole.score - hole.par) on hole 1 minus
--     the same on holes 2-18. Lower = better (less "warmup tax").
--
-- Why a separate function: the W11 RPC structure reads from
-- golf_player_stats_cache via a single CTE that joins on player_id.
-- These two metrics need joins on golf_rounds + golf_holes that don't
-- fit that shape cleanly. Splitting keeps both functions readable.
--
-- Same SECURITY DEFINER + EXECUTE-with-trusted-binding pattern as W11.
-- Returns the same (metric_id, rows_upserted) shape so the cron + backfill
-- routes can concatenate results from both functions.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT count(*), count(*) FILTER (WHERE round_type IN ('tournament','qualifier'))
--   FROM golf_rounds WHERE status='completed';
--   -> 184 rounds total, 135 competitive (133 tournament + 2 qualifier),
--      49 practice
--
--   SELECT count(*) FILTER (WHERE hole_number=1) FROM golf_holes
--   JOIN golf_rounds ON golf_rounds.id = golf_holes.round_id
--   WHERE golf_rounds.status='completed';
--   -> 187 hole-1 entries (one per completed round)
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.refresh_player_standing_round_metrics(uuid[]);

CREATE OR REPLACE FUNCTION public.refresh_player_standing_round_metrics(p_team_ids uuid[])
RETURNS TABLE (out_metric_id text, out_rows_upserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  ------------------------------------------------------------
  -- practice_tournament_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
        - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) > 0
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice') > 0
      AND COUNT(*) >= v_min_rounds
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      -- lower_better: invert percentile so higher pct = better player
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'practice_tournament_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'practice_tournament_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    r.team_pct,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'practice_tournament_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;

  -- The opening_hole_delta block below also writes its result via the
  -- same out_metric_id / out_rows_upserted OUT params.
  ------------------------------------------------------------
  -- opening_hole_delta
  ------------------------------------------------------------
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
        - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    JOIN public.golf_holes h
      ON h.round_id = r.id
     AND h.score IS NOT NULL
     AND h.par IS NOT NULL
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id
    HAVING
      COUNT(DISTINCT r.id) >= v_min_rounds
      AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
      AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'opening_hole_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'opening_hole_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    r.team_pct,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'opening_hole_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.refresh_player_standing_round_metrics(uuid[]) IS
  'v3 W24 prep. Round-level standing computation for practice_tournament_delta + opening_hole_delta. Companion to refresh_player_standing (W11) which only handles cache-backed metrics. Same (metric_id, rows_upserted) return shape.';
