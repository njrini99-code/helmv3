-- =============================================================================
-- BaseballHelm — fix save_baseball_full_box_score() wrong season_year bucket
-- Migration: 20260701009000_baseball_save_full_box_score_season_year.sql
--
-- Bug: v_season_year was derived from now() (the save timestamp) instead of
-- the game's own game_date. Backfilling/saving a prior-season game therefore
-- recalculated the WRONG season_year bucket in
-- recalculate_baseball_season_stats(), leaving the game's real season bucket
-- stale. Fix: derive v_season_year from public.baseball_games.game_date,
-- folded into the existing SELECT that fetches team_id. Everything else in
-- the function body is unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_baseball_full_box_score(
  p_game_id uuid,
  p_batting jsonb,
  p_pitching jsonb,
  p_our_score integer,
  p_opponent_score integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_team_id uuid;
  v_season_year integer;
  v_player_id uuid;
  v_bat jsonb;
  v_pit jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bc.id INTO v_coach_id
  FROM public.baseball_coaches bc
  WHERE bc.user_id = v_user_id;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coach profile not found');
  END IF;

  SELECT bg.team_id, EXTRACT(YEAR FROM bg.game_date)::integer
  INTO v_team_id, v_season_year
  FROM public.baseball_games bg
  WHERE bg.id = p_game_id;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = v_team_id
      AND tcs.coach_id = v_coach_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  DELETE FROM public.baseball_box_score_batting WHERE game_id = p_game_id;
  DELETE FROM public.baseball_box_score_pitching WHERE game_id = p_game_id;

  IF p_batting IS NOT NULL AND jsonb_typeof(p_batting) = 'array' THEN
    FOR v_bat IN SELECT * FROM jsonb_array_elements(p_batting)
    LOOP
      INSERT INTO public.baseball_box_score_batting (
        game_id, player_id, team_id, batting_order,
        ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf, lob,
        avg, obp, slg, ops
      ) VALUES (
        p_game_id,
        (v_bat->>'player_id')::uuid,
        v_team_id,
        NULLIF(v_bat->>'batting_order', '')::integer,
        COALESCE((v_bat->>'ab')::integer, 0),
        COALESCE((v_bat->>'r')::integer, 0),
        COALESCE((v_bat->>'h')::integer, 0),
        COALESCE((v_bat->>'doubles')::integer, 0),
        COALESCE((v_bat->>'triples')::integer, 0),
        COALESCE((v_bat->>'hr')::integer, 0),
        COALESCE((v_bat->>'rbi')::integer, 0),
        COALESCE((v_bat->>'bb')::integer, 0),
        COALESCE((v_bat->>'k')::integer, 0),
        COALESCE((v_bat->>'sb')::integer, 0),
        COALESCE((v_bat->>'cs')::integer, 0),
        COALESCE((v_bat->>'hbp')::integer, 0),
        COALESCE((v_bat->>'sac')::integer, 0),
        COALESCE((v_bat->>'sf')::integer, 0),
        COALESCE((v_bat->>'lob')::integer, 0),
        NULLIF(v_bat->>'avg', '')::numeric,
        NULLIF(v_bat->>'obp', '')::numeric,
        NULLIF(v_bat->>'slg', '')::numeric,
        NULLIF(v_bat->>'ops', '')::numeric
      );
    END LOOP;
  END IF;

  IF p_pitching IS NOT NULL AND jsonb_typeof(p_pitching) = 'array' THEN
    FOR v_pit IN SELECT * FROM jsonb_array_elements(p_pitching)
    LOOP
      INSERT INTO public.baseball_box_score_pitching (
        game_id, player_id, team_id,
        ip, h, r, er, bb, k, hr, pitch_count, strikes, result,
        era, whip, k9, bb9
      ) VALUES (
        p_game_id,
        (v_pit->>'player_id')::uuid,
        v_team_id,
        COALESCE(NULLIF(v_pit->>'ip', '')::numeric, 0),
        COALESCE((v_pit->>'h')::integer, 0),
        COALESCE((v_pit->>'r')::integer, 0),
        COALESCE((v_pit->>'er')::integer, 0),
        COALESCE((v_pit->>'bb')::integer, 0),
        COALESCE((v_pit->>'k')::integer, 0),
        COALESCE((v_pit->>'hr')::integer, 0),
        NULLIF(v_pit->>'pitch_count', '')::integer,
        NULLIF(v_pit->>'strikes', '')::integer,
        NULLIF(v_pit->>'result', ''),
        NULLIF(v_pit->>'era', '')::numeric,
        NULLIF(v_pit->>'whip', '')::numeric,
        NULLIF(v_pit->>'k9', '')::numeric,
        NULLIF(v_pit->>'bb9', '')::numeric
      );
    END LOOP;
  END IF;

  UPDATE public.baseball_games
  SET status = 'completed',
      our_score = p_our_score,
      opponent_score = p_opponent_score,
      updated_at = now()
  WHERE id = p_game_id;

  FOR v_player_id IN
    SELECT DISTINCT player_id FROM (
      SELECT player_id FROM public.baseball_box_score_batting WHERE game_id = p_game_id
      UNION
      SELECT player_id FROM public.baseball_box_score_pitching WHERE game_id = p_game_id
    ) players
  LOOP
    PERFORM public.recalculate_baseball_season_stats(v_player_id, v_team_id, v_season_year);
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Box score save failed');
END;
$$;

REVOKE ALL ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) TO service_role;
