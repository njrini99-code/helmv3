-- update_player_stats_strokes_gained(uuid): average countable rounds only,
-- per 18 holes.
--
-- WHY: the live function (identical to the 20260527000000 baseline, checked
-- with pg_get_functiondef 2026-09-25) averaged SG over EVERY completed round
-- with an SG total. That included non-countable rounds, e.g. the 37-stroke
-- round logged as 18 holes (SG total +34.51, tee +17.89) for player 49ffe06d,
-- and it averaged a 9-hole round's raw SG next to 18-hole rounds.
--
-- WHAT: the same countable rule as src/lib/golf/round-countable.ts
-- (isCountableRound), expressed in SQL:
--   1. status = 'completed';
--   2. holes = coalesce(holes_played, 18) is 9 or 18;
--   3. recorded holes (front_nine / back_nine proxy: 9 each when non-null)
--      equals holes;
--   4. canonical total (front_nine + back_nine, else total_score) is not null
--      and >= greatest(ceil(holes * 50 / 18), holes + putts);
--   5. SG: Total <= +15 (one-sided ceiling, MAX_SG_TOTAL_PER_ROUND).
-- A 9-hole round's SG is scaled x2 to per-18 before summing/averaging, as
-- src/lib/coachhelm/root-map/area-trends.ts (areaRoundFromStored) does.
-- Per-area per-round values use AVG (nulls ignored), matching averageAreaSg.
--
-- When a player has no countable SG round, an existing cache row's SG columns
-- are cleared (NULL) instead of keeping a stale average of broken rounds.
--
-- Unchanged: signature, RETURNS void, SECURITY INVOKER, search_path
-- (public, pg_temp). CREATE OR REPLACE keeps the existing grants.
--
-- Dry-run (read-only, 2026-09-25, top 10 players by completed rounds): 5 of
-- 10 move; 49ffe06d goes tee 1.98 -> 1.068, putting -2.93 -> -4.087, total
-- -1.61 -> -3.779 (matches the root-map mirror test area-sg.test.ts).
--
-- NOT APPLIED by the author. Owner applies (see HELD.md). After applying,
-- rerun the function per player to refresh the cache:
--   SELECT public.update_player_stats_strokes_gained(id) FROM public.golf_players;

CREATE OR REPLACE FUNCTION public.update_player_stats_strokes_gained(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count          INTEGER;
  v_sg_total       NUMERIC;
  v_sg_tee         NUMERIC;
  v_sg_approach    NUMERIC;
  v_sg_around      NUMERIC;
  v_sg_putting     NUMERIC;
  v_avg_total      NUMERIC;
  v_avg_tee        NUMERIC;
  v_avg_approach   NUMERIC;
  v_avg_around     NUMERIC;
  v_avg_putting    NUMERIC;
BEGIN
  WITH src AS (
    SELECT
      rsc.strokes_gained_total,
      rsc.strokes_gained_tee,
      rsc.strokes_gained_approach,
      rsc.strokes_gained_around_green,
      rsc.strokes_gained_putting,
      COALESCE(r.holes_played, 18) AS holes,
      (CASE WHEN r.front_nine IS NOT NULL THEN 9 ELSE 0 END)
        + (CASE WHEN r.back_nine IS NOT NULL THEN 9 ELSE 0 END) AS recorded,
      CASE
        WHEN r.front_nine IS NOT NULL AND r.back_nine IS NOT NULL
          THEN r.front_nine + r.back_nine
        ELSE r.total_score
      END AS total_strokes,
      r.total_putts
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = p_player_id
      AND r.status = 'completed'
      AND rsc.strokes_gained_total IS NOT NULL
  ), countable AS (
    SELECT
      CASE WHEN holes = 9 THEN 2 ELSE 1 END AS k,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting
    FROM src
    WHERE holes IN (9, 18)
      AND recorded = holes
      AND total_strokes IS NOT NULL
      AND total_strokes >= GREATEST(
            CEIL(holes * 50.0 / 18),
            holes + GREATEST(COALESCE(total_putts, 0), 0)
          )
      AND strokes_gained_total <= 15
  )
  SELECT
    COUNT(*),
    SUM(strokes_gained_total * k),
    SUM(strokes_gained_tee * k),
    SUM(strokes_gained_approach * k),
    SUM(strokes_gained_around_green * k),
    SUM(strokes_gained_putting * k),
    AVG(strokes_gained_total * k),
    AVG(strokes_gained_tee * k),
    AVG(strokes_gained_approach * k),
    AVG(strokes_gained_around_green * k),
    AVG(strokes_gained_putting * k)
  INTO v_count, v_sg_total, v_sg_tee, v_sg_approach, v_sg_around, v_sg_putting,
       v_avg_total, v_avg_tee, v_avg_approach, v_avg_around, v_avg_putting
  FROM countable;

  IF v_count = 0 THEN
    -- No countable round: clear a stale average, never invent a row.
    UPDATE golf_player_stats_cache
    SET
      strokes_gained_total        = NULL,
      strokes_gained_tee          = NULL,
      strokes_gained_approach     = NULL,
      strokes_gained_around_green = NULL,
      strokes_gained_putting      = NULL,
      sg_total_per_round          = NULL,
      sg_tee_per_round            = NULL,
      sg_approach_per_round       = NULL,
      sg_around_green_per_round   = NULL,
      sg_putting_per_round        = NULL,
      updated_at                  = now()
    WHERE player_id = p_player_id
      AND (sg_total_per_round IS NOT NULL OR strokes_gained_total IS NOT NULL);
    RETURN;
  END IF;

  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total        = ROUND(v_sg_total::NUMERIC,    3),
    strokes_gained_tee          = ROUND(v_sg_tee::NUMERIC,      3),
    strokes_gained_approach     = ROUND(v_sg_approach::NUMERIC, 3),
    strokes_gained_around_green = ROUND(v_sg_around::NUMERIC,   3),
    strokes_gained_putting      = ROUND(v_sg_putting::NUMERIC,  3),
    sg_total_per_round          = ROUND(v_avg_total::NUMERIC,    3),
    sg_tee_per_round            = ROUND(v_avg_tee::NUMERIC,      3),
    sg_approach_per_round       = ROUND(v_avg_approach::NUMERIC, 3),
    sg_around_green_per_round   = ROUND(v_avg_around::NUMERIC,   3),
    sg_putting_per_round        = ROUND(v_avg_putting::NUMERIC,  3),
    updated_at                  = now()
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO golf_player_stats_cache (
      id, player_id,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting,
      sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
      sg_around_green_per_round, sg_putting_per_round,
      rounds_played, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_player_id,
      ROUND(v_sg_total::NUMERIC,    3),
      ROUND(v_sg_tee::NUMERIC,      3),
      ROUND(v_sg_approach::NUMERIC, 3),
      ROUND(v_sg_around::NUMERIC,   3),
      ROUND(v_sg_putting::NUMERIC,  3),
      ROUND(v_avg_total::NUMERIC,    3),
      ROUND(v_avg_tee::NUMERIC,      3),
      ROUND(v_avg_approach::NUMERIC, 3),
      ROUND(v_avg_around::NUMERIC,   3),
      ROUND(v_avg_putting::NUMERIC,  3),
      v_count, now(), now()
    );
  END IF;
END;
$function$;
