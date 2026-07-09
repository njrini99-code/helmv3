-- =============================================================================
-- BaseballHelm — save_baseball_full_box_score(): stop destructive rewrite,
-- surface real error detail on failure
-- Migration: 20260708150000_baseball_box_score_upsert_and_error_detail.sql
--
-- Context: the previous body of save_baseball_full_box_score()
-- (20260701009000_baseball_save_full_box_score_season_year.sql) did an
-- unconditional `DELETE FROM baseball_box_score_batting/pitching WHERE
-- game_id = ...` followed by a blind re-INSERT of every row from the
-- incoming payload. That is a delete-then-reinsert write path, which is
-- banned by the repo's "no destructive writes in save/submit/sync" rule:
-- every saved player's box-score row gets a new `id` and `created_at` on
-- every save, defeating row identity (FK references, audit history,
-- realtime diffing keyed on row id all break across a resave of an
-- unchanged game).
--
-- Fix (2 changes, everything else byte-identical to the prior body):
--
-- 1) Replace DELETE-then-INSERT with UPSERT. Both
--    baseball_box_score_batting and baseball_box_score_pitching already
--    carry a UNIQUE (game_id, player_id) constraint
--    (baseball_box_score_batting_game_id_player_id_key /
--    baseball_box_score_pitching_game_id_player_id_key — see
--    20260527000000_prod_public_baseline.sql lines ~11389/11399), so no
--    new constraint is added here. Each INSERT now carries
--    ON CONFLICT (game_id, player_id) DO UPDATE SET <every stat column>
--    = EXCLUDED.<...>, preserving the row's `id`/`created_at` for players
--    who already had a box-score row for this game. Rows for players who
--    are no longer present in the new payload are still removed, but via
--    a targeted DELETE ... WHERE game_id = p_game_id AND player_id <> ALL
--    (<incoming player_ids for that table>) run after the upserts, not a
--    blanket delete up front. If a payload argument is NULL/non-array,
--    its incoming-ids array is empty, so every existing row for that
--    table + game is treated as "no longer present" and removed — same
--    end state as before for that edge case, just expressed as a
--    targeted delete instead of an unconditional one.
--
-- 2) The top-level `EXCEPTION WHEN OTHERS` used to swallow SQLERRM and
--    return a generic 'Box score save failed', making failures
--    undiagnosable from the client. It now also returns `error_detail`
--    (SQLERRM) and `error_code` (SQLSTATE). Separately, the per-player
--    season-stats recalc loop is now wrapped in its own nested
--    BEGIN/EXCEPTION WHEN OTHERS that logs via RAISE WARNING and does
--    NOT re-raise, so a single player's recalc failing (e.g. a bad
--    season_year edge case) can no longer roll back an otherwise-valid
--    box-score write for the whole game.
--
-- Signature, season-year-from-game_date derivation, and season-stats
-- recalc calls are unchanged. CREATE OR REPLACE keeps this idempotent.
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
  v_batting_player_ids uuid[] := ARRAY[]::uuid[];
  v_pitching_player_ids uuid[] := ARRAY[]::uuid[];
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

  IF p_batting IS NOT NULL AND jsonb_typeof(p_batting) = 'array' THEN
    SELECT COALESCE(array_agg((elem->>'player_id')::uuid), ARRAY[]::uuid[])
    INTO v_batting_player_ids
    FROM jsonb_array_elements(p_batting) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

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
      )
      ON CONFLICT (game_id, player_id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        batting_order = EXCLUDED.batting_order,
        ab = EXCLUDED.ab,
        r = EXCLUDED.r,
        h = EXCLUDED.h,
        doubles = EXCLUDED.doubles,
        triples = EXCLUDED.triples,
        hr = EXCLUDED.hr,
        rbi = EXCLUDED.rbi,
        bb = EXCLUDED.bb,
        k = EXCLUDED.k,
        sb = EXCLUDED.sb,
        cs = EXCLUDED.cs,
        hbp = EXCLUDED.hbp,
        sac = EXCLUDED.sac,
        sf = EXCLUDED.sf,
        lob = EXCLUDED.lob,
        avg = EXCLUDED.avg,
        obp = EXCLUDED.obp,
        slg = EXCLUDED.slg,
        ops = EXCLUDED.ops;
    END LOOP;
  END IF;

  DELETE FROM public.baseball_box_score_batting
  WHERE game_id = p_game_id
    AND player_id <> ALL (v_batting_player_ids);

  IF p_pitching IS NOT NULL AND jsonb_typeof(p_pitching) = 'array' THEN
    SELECT COALESCE(array_agg((elem->>'player_id')::uuid), ARRAY[]::uuid[])
    INTO v_pitching_player_ids
    FROM jsonb_array_elements(p_pitching) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

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
      )
      ON CONFLICT (game_id, player_id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        ip = EXCLUDED.ip,
        h = EXCLUDED.h,
        r = EXCLUDED.r,
        er = EXCLUDED.er,
        bb = EXCLUDED.bb,
        k = EXCLUDED.k,
        hr = EXCLUDED.hr,
        pitch_count = EXCLUDED.pitch_count,
        strikes = EXCLUDED.strikes,
        result = EXCLUDED.result,
        era = EXCLUDED.era,
        whip = EXCLUDED.whip,
        k9 = EXCLUDED.k9,
        bb9 = EXCLUDED.bb9;
    END LOOP;
  END IF;

  DELETE FROM public.baseball_box_score_pitching
  WHERE game_id = p_game_id
    AND player_id <> ALL (v_pitching_player_ids);

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
    BEGIN
      PERFORM public.recalculate_baseball_season_stats(v_player_id, v_team_id, v_season_year);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'save_baseball_full_box_score: recalc failed for player % game % season %: % (SQLSTATE %)',
          v_player_id, p_game_id, v_season_year, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Box score save failed',
      'error_detail', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_baseball_full_box_score(uuid, jsonb, jsonb, integer, integer) TO service_role;
