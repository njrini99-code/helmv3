-- Platform-wide stat averages for the admin dashboard.
--
-- Root cause: admin/rollup-b.ts computed platformScoringAvg / FairwayPct /
-- GirPct / PuttsPerRound from `player_stats_top50` — the top-50 players by
-- scoring_average (ORDER BY scoring_average ASC LIMIT 50 in
-- get_admin_teams_scoring_rollup). That biased every platform average toward
-- the best performers (lower scoring avg, higher GIR/fairway, fewer putts).
--
-- The canonical "platform average" is the mean over ALL players with a
-- non-null value for each stat — exactly what AVG() does (it ignores NULLs
-- per column). This mirrors the existing strokes_gained platform averages,
-- which already AVG over the full golf_player_stats_cache.
--
-- Kept as a small, isolated, gated RPC so the large teams/scoring rollup is
-- untouched; rollup-b.ts falls back to the (biased) top-50 calc only if this
-- RPC degrades.
CREATE OR REPLACE FUNCTION public.get_admin_platform_stat_averages()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  SELECT jsonb_build_object(
    'scoring_average',             AVG(scoring_average),
    'driving_accuracy_percentage', AVG(driving_accuracy_percentage),
    'gir_percentage',              AVG(gir_percentage),
    'putts_per_round',             AVG(putts_per_round),
    'player_count',                COUNT(*) FILTER (WHERE scoring_average IS NOT NULL)
  )
  INTO v
  FROM golf_player_stats_cache;

  RETURN COALESCE(v, '{}'::jsonb);
END;
$function$;
