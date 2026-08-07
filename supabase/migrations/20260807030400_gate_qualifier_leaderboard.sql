-- get_qualifier_leaderboard was SECURITY DEFINER, granted to `authenticated`,
-- and contained NO authorization check. Any signed-in user who passed any
-- qualifier id received that program's roster names and scoring.
--
-- Verified on production 2026-08-07 in a rolled-back transaction: a Denison
-- University player called it with another program's qualifier and received six
-- players' first and last names. The DEFINER context is exactly what made this
-- reachable — it bypasses the RLS that protects the same rows everywhere else.
--
-- The gate is membership in the qualifier's own team. Verified after the change,
-- each probe paired with a control that passes:
--   ATTACK  outsider ............... BLOCKED 42501
--   CONTROL player on that team .... 6 rows
--   CONTROL coach on that team ..... 6 rows
--
-- Also here, as hygiene rather than an incident: get_coach_effectiveness_metrics
-- carried EXECUTE for anon and PUBLIC. It is SECURITY INVOKER, so RLS already
-- contained it — measured, anon is refused 42501 and an authenticated coach sees
-- only their own row, so this was NOT the exposure it was reported to be. The
-- grants are still wrong and are removed, because a later change to that
-- function's security context would silently turn them into one.

CREATE OR REPLACE FUNCTION public.get_qualifier_leaderboard(qualifier_uuid uuid)
 RETURNS TABLE(player_id uuid, first_name text, last_name text, rounds_played bigint, total_score bigint, avg_score numeric, best_score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team uuid;
BEGIN
  SELECT gq.team_id INTO v_team FROM golf_qualifiers gq WHERE gq.id = qualifier_uuid;

  -- Unknown qualifier: reveal nothing, not even whether it exists.
  IF v_team IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_golf_team_coach(v_team) OR public.is_golf_team_player(v_team)) THEN
    RAISE EXCEPTION 'not authorized for this qualifier' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gqe.player_id,
    gp.first_name,
    gp.last_name,
    COUNT(gr.id) AS rounds_played,
    COALESCE(SUM(gr.total_score), 0)::BIGINT AS total_score,
    CASE WHEN COUNT(gr.id) > 0 THEN ROUND(AVG(gr.total_score)::NUMERIC, 1) ELSE NULL END AS avg_score,
    MIN(gr.total_score) AS best_score
  FROM golf_qualifier_entries gqe
  JOIN golf_players gp ON gp.id = gqe.player_id
  LEFT JOIN golf_rounds gr ON gr.qualifier_id = qualifier_uuid
    AND gr.player_id = gqe.player_id
    AND gr.status = 'completed'
  WHERE gqe.qualifier_id = qualifier_uuid
  GROUP BY gqe.player_id, gp.first_name, gp.last_name
  ORDER BY
    CASE WHEN COUNT(gr.id) > 0 THEN 0 ELSE 1 END,
    COALESCE(SUM(gr.total_score), 0) ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_qualifier_leaderboard(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_qualifier_leaderboard(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_qualifier_leaderboard(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_coach_effectiveness_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_effectiveness_metrics() FROM anon;
