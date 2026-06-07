-- Durability fix for the SG recalibration (migration 20260606140000).
--
-- PROBLEM: SG is stored in THREE places — golf_rounds.strokes_gained_*,
-- golf_round_stats_cache.strokes_gained_*, and golf_player_stats_cache — with
-- conflicting writers:
--   * recalculate_round_strokes_gained() computes SG from shots and writes ONLY
--     golf_round_stats_cache.
--   * The AFTER INSERT/UPDATE trigger trg_update_round_stats_cache copies
--     golf_rounds.strokes_gained_* -> golf_round_stats_cache.
--   * refresh_player_stats_cache() rebuilds golf_round_stats_cache FROM
--     golf_rounds.strokes_gained_*.
-- The cache->golf_rounds sync lived only in TS (golf-stats-calculator.ts step 3b),
-- so any SQL/admin/trigger path left golf_rounds.strokes_gained_* stale. After the
-- 140000 recalibration the caches were corrected but golf_rounds stayed at the old
-- values (-0.09 vs corrected -3.70), so the next round edit / cache refresh would
-- silently regress the fix.
--
-- FIX: make recalculate_round_strokes_gained() the single SG writer that updates
-- BOTH golf_round_stats_cache AND golf_rounds.strokes_gained_*, so every caller
-- keeps all stores consistent. (The AFTER trigger then re-copies identical values
-- to the cache — a harmless no-op, no recursion since the trigger never calls back
-- into recalculate.)
--
-- A one-time data backfill of golf_rounds.strokes_gained_* from the corrected
-- golf_round_stats_cache is run separately/idempotently after this migration.

CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id      UUID;
  v_shot_count     INTEGER;
  v_sg_off_tee     NUMERIC := 0;
  v_sg_approach    NUMERIC := 0;
  v_sg_around      NUMERIC := 0;
  v_sg_putting     NUMERIC := 0;
  v_sg_total       NUMERIC := 0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_shot_count
  FROM golf_shots gs
  WHERE gs.round_id = p_round_id
    AND gs.shot_type IS NOT NULL
    AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL
    AND gs.distance_to_hole_before > 0
    AND (
      gs.distance_to_hole_after IS NOT NULL
      OR gs.putt_made = TRUE
      OR gs.result IN ('holed', 'hole')
    );

  IF v_shot_count > 0 THEN
    WITH normalized AS (
      SELECT
        gs.shot_type,
        gs.shot_number,
        gh.par,
        CASE
          WHEN gs.shot_type = 'putting' THEN 'green'
          ELSE sg_normalize_lie(gs.lie_before)
        END AS lie_before_norm,
        CASE
          WHEN gs.shot_type = 'putting' THEN
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before
            END
          ELSE
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before
            END
        END AS dist_before_yards,
        (gs.putt_made = TRUE OR gs.result IN ('holed', 'hole')) AS is_holed,
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 0
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE
              WHEN gs.shot_type = 'putting' THEN
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
              ELSE
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
            END
          ELSE
            CASE
              WHEN LEAD(gs.distance_unit_before) OVER w = 'feet'
              THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0) / 3.0
              ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0)
            END
        END AS dist_after_yards,
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 'green'
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w)
        END AS lie_after_norm,
        COALESCE(gs.is_penalty, FALSE) AS is_penalty
      FROM golf_shots gs
      JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gs.round_id = p_round_id
        AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL
        AND gs.distance_to_hole_before > 0
      WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
    ),
    categorized AS (
      SELECT
        CASE
          WHEN is_penalty                   THEN NULL
          WHEN shot_type = 'putting'        THEN 'putting'
          WHEN shot_type = 'tee'            THEN 'off_tee'
          WHEN shot_type = 'around_green'   THEN 'around_green'
          ELSE                                   'approach'
        END AS category,
        sg_expected_strokes(lie_before_norm, dist_before_yards) AS exp_before,
        CASE
          WHEN is_holed        THEN 0
          WHEN dist_after_yards > 0
          THEN sg_expected_strokes(lie_after_norm, dist_after_yards)
          ELSE 0
        END AS exp_after,
        (is_holed OR dist_after_yards > 0) AS has_after
      FROM normalized
      WHERE dist_before_yards > 0
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category = 'off_tee'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'approach'     AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'around_green' AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'putting'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM categorized;

  ELSE
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM sg_estimate_from_holes(p_round_id);
  END IF;

  v_sg_total := ROUND((
    COALESCE(v_sg_off_tee,  0)
    + COALESCE(v_sg_approach, 0)
    + COALESCE(v_sg_around,   0)
    + COALESCE(v_sg_putting,  0)
  )::NUMERIC, 3);

  INSERT INTO golf_round_stats_cache (
    id, round_id, player_id,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_round_id, v_player_id,
    v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM golf_round_stats_cache WHERE round_id = p_round_id
  );

  UPDATE golf_round_stats_cache
  SET
    strokes_gained_total        = v_sg_total,
    strokes_gained_tee          = v_sg_off_tee,
    strokes_gained_approach     = v_sg_approach,
    strokes_gained_around_green = v_sg_around,
    strokes_gained_putting      = v_sg_putting,
    updated_at                  = now()
  WHERE round_id = p_round_id;

  -- Keep golf_rounds.strokes_gained_* in lockstep so refresh_player_stats_cache
  -- and trg_update_round_stats_cache (both read golf_rounds) never reintroduce
  -- stale SG. (Previously this sync lived only in TS step 3b.)
  UPDATE golf_rounds
  SET
    strokes_gained_total        = v_sg_total,
    strokes_gained_tee          = v_sg_off_tee,
    strokes_gained_approach     = v_sg_approach,
    strokes_gained_around_green = v_sg_around,
    strokes_gained_putting      = v_sg_putting
  WHERE id = p_round_id
    AND (
      strokes_gained_total        IS DISTINCT FROM v_sg_total
      OR strokes_gained_tee       IS DISTINCT FROM v_sg_off_tee
      OR strokes_gained_approach  IS DISTINCT FROM v_sg_approach
      OR strokes_gained_around_green IS DISTINCT FROM v_sg_around
      OR strokes_gained_putting   IS DISTINCT FROM v_sg_putting
    );
END;
$function$;
