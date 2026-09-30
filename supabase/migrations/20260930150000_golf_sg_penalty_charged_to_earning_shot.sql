-- Q-89 (owner-approved 2026-09-30): strokes gained in the database. WRITTEN, NOT
-- APPLIED. Applying it is a separate owner go, after the before/after numbers in
-- docs/operations/2026-09-30-sg-penalty-and-shot-end-before-after.md have been seen.
--
-- ONE forward migration that changes the two SG functions in three ways:
--
--  1. A PENALTY IS CHARGED TO THE SHOT THAT EARNED IT. A penalty row
--     (is_penalty / shot_type 'penalty') is written after the errant swing and
--     its own lie_before / distance_to_hole_before is where the ball is played
--     from NEXT (the drop, or the tee again after OB). The live functions
--     charge the -1 by that row's own lie, so a tee shot into the water lands
--     in Approach or Around the green (210 of 238 checked tee-shot penalties).
--     The TypeScript engine already charges the earning shot
--     (getPenaltyCategory / resolvePenaltyOrigin in
--     src/lib/utils/golf-stats-calculator-shots.ts); this mirrors it exactly:
--       origin = the nearest PRECEDING non-penalty shot on the hole; when the
--       penalty was logged before the shot, the nearest FOLLOWING one; the
--       row itself only when the hole has no other shot.
--       origin hit from the tee (par 3: approach) -> off_tee; from the green
--       -> around_green; within 50 yd of the hole -> around_green; otherwise
--       (including an origin with no distance) -> approach.
--     The penalty stroke is still exactly -1. A penalty row with no distance
--     or no shot_type is still charged (none exist today; the TS engine charges
--     every penalty row).
--
--  2. CARRIES THE HELD 20260928160000 FIX (CoachHelm deep audit row 1): a
--     shot's end state is the NEXT NON-PENALTY shot's start state (the place the
--     ball was played from), falling back to the shot's own recorded end only
--     for the last shot of a hole, so each hole's SG telescopes to
--     expected(first shot) - strokes and the round total reconciles. This file
--     SUPERSEDES 20260928160000: that file's row in HELD.md is the owner's to
--     change (it was left as HOLD); do NOT apply both. The DO block below
--     accepts the live body or the 160000 body as its starting point, so
--     applying this file after 160000 also works.
--
--  3. TEST ROUNDS CARRY NO STRENGTHS GAINED. A golf_rounds.is_test round (QA /
--     demo, OD-03) gets NULL in the five SG columns of golf_rounds and
--     golf_round_stats_cache, so the player cache (update_player_stats_complete
--     and update_player_stats_strokes_gained both aggregate only rows with a
--     non-null strokes_gained_total), and through it Standing's sg_* metrics,
--     skip it. refresh_player_stats_cache rebuilds golf_round_stats_cache from
--     the golf_rounds columns, so the NULLs survive a refresh. This is done
--     inside the two SG functions on purpose and does NOT replace any
--     player-cache, cache-refresh or Standing function body: the held OD-01
--     chain (20260924120000, 20260924140000, 20260925120000, 20260928150000)
--     md5-checks those bodies and this file must not break that order. Once the
--     chain is applied the is_test rule exists there too; the NULLs are then
--     redundant, not harmful. Today 6 rounds are is_test.
--
-- Both functions keep their signature, language, SECURITY attribute and
-- search_path (CREATE OR REPLACE keeps the existing grants):
--   recalculate_round_strokes_gained(uuid)  INVOKER, search_path public, pg_temp
--   calculate_round_strokes_gained(uuid)    SECURITY DEFINER, search_path public
-- Everything else in them (categories, the shot_count gate and the
-- sg_estimate_from_holes fallback, the team scale, the writes, the
-- helm.golf_lifecycle_write marker) is the live body byte for byte.
--
-- ORDER WITH THE HELD CHAIN: independent. This file replaces only the two SG
-- functions; nothing in 20260924120000 .. 20260928150000 replaces them (only
-- the held 20260928160000, which this supersedes).
--
-- RECOMPUTE (separate step, service role, after apply; not part of this
-- transaction: about 700 rounds fire the per-row player-cache trigger and one
-- API statement can time out). Idempotent. Run the first statement in batches of
-- players (OFFSET 0, 15, 30, 45, 60, 75), then the rest once, in this order:
--   SELECT public.recalculate_round_strokes_gained(r.id) FROM public.golf_rounds r
--    WHERE r.status = 'completed'
--      AND r.player_id IN (SELECT id FROM public.golf_players ORDER BY id LIMIT 15 OFFSET 0);
--   SELECT public.refresh_player_stats_cache(p.id) FROM public.golf_players p
--    WHERE EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.player_id = p.id AND r.status = 'completed');
--   SELECT * FROM public.refresh_player_standing(ARRAY(SELECT id FROM public.golf_teams));
--   SELECT * FROM public.refresh_player_standing_round_metrics(ARRAY(SELECT id FROM public.golf_teams));
--   SELECT * FROM public.refresh_player_standing_shot_metrics(ARRAY(SELECT id FROM public.golf_teams));
-- Do not use recompute_team_sg: it covers active members only.
-- The Stats pages compute SG in TypeScript on read and need no recompute; the
-- TS engine is changed in the same PR to the same two rules (next-shot-start
-- added; penalty attribution already matched). supabase/schemas/functions/
-- public.sql is updated to these bodies in the same PR (its old bodies matched
-- live production by prosrc md5 before the swap).
--
-- Also not in this file (held, separate owner go): update_player_putt_make_pct
-- still includes test rounds (20260928120000).
--
-- ROLLBACK: re-apply the two prior bodies captured verbatim from the live
-- catalog 2026-09-30 in
-- supabase/rollbacks/20260930150000_golf_sg_penalty_charged_to_earning_shot.rollback.sql
-- (prosrc md5: recalculate 7f8fc14239e8658719a9e000bd1c61b6, calculate
-- a51718c19d95b93fa5d1d7dce41bd8bf), then run the RECOMPUTE block above again.
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'recalculate_round_strokes_gained' and p.prosrc like '%pen_lie%' and p.prosrc like '%IF v_is_test THEN%' and p.prosrc like '%helm.golf_lifecycle_write%' and not p.prosecdef;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'calculate_round_strokes_gained' and p.prosrc like '%pen_lie%' and p.prosrc like '%nx.distance_to_hole_before%' and p.prosecdef;

DO $guard$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalculate_round_strokes_gained'
    AND pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid';
  IF v_src IS NULL
     OR md5(v_src) NOT IN (
       '7f8fc14239e8658719a9e000bd1c61b6',  -- live 2026-09-30 (penalty by the penalty row's own lie, own shot end)
       'c6d3eb0755e0e4970cce6c56aa31e753'   -- 20260928160000 applied (next-shot-start end state)
     ) THEN
    RAISE EXCEPTION 'Q-89: live recalculate_round_strokes_gained is not a known body (md5 %). Stop and rebase this file on the live body.', md5(v_src);
  END IF;
  IF to_regprocedure('public.calculate_round_strokes_gained(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Q-89: public.calculate_round_strokes_gained(uuid) is missing';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.recalculate_round_strokes_gained(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id UUID; v_is_test BOOLEAN; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_scale NUMERIC := 1.0;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'stats_cache', true);
  SELECT player_id, is_test INTO v_player_id, v_is_test FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- A test (QA / demo) round carries no strokes gained: NULL keeps it out of
  -- the player cache and Standing, which aggregate only non-null SG.
  IF v_is_test THEN
    UPDATE golf_round_stats_cache SET strokes_gained_total=NULL, strokes_gained_tee=NULL,
      strokes_gained_approach=NULL, strokes_gained_around_green=NULL,
      strokes_gained_putting=NULL, updated_at=now()
    WHERE round_id=p_round_id AND (
      strokes_gained_total IS NOT NULL OR strokes_gained_tee IS NOT NULL
      OR strokes_gained_approach IS NOT NULL OR strokes_gained_around_green IS NOT NULL
      OR strokes_gained_putting IS NOT NULL);
    UPDATE golf_rounds SET strokes_gained_total=NULL, strokes_gained_tee=NULL,
      strokes_gained_approach=NULL, strokes_gained_around_green=NULL, strokes_gained_putting=NULL
    WHERE id=p_round_id AND (
      strokes_gained_total IS NOT NULL OR strokes_gained_tee IS NOT NULL
      OR strokes_gained_approach IS NOT NULL OR strokes_gained_around_green IS NOT NULL
      OR strokes_gained_putting IS NOT NULL);
    RETURN;
  END IF;

  v_scale := sg_scale_for_player(v_player_id);

  SELECT COUNT(*) INTO v_shot_count FROM golf_shots gs
  WHERE gs.round_id = p_round_id AND gs.shot_type IS NOT NULL AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before > 0
    AND (gs.distance_to_hole_after IS NOT NULL OR gs.putt_made = TRUE OR gs.result IN ('holed','hole'));
  IF v_shot_count > 0 THEN
    WITH normalized AS (
      SELECT gs.shot_type, gs.shot_number, gh.par,
        CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
        CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
        (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
        -- a shot ends where the next non-penalty shot starts; its own recorded
        -- end only for the last shot of the hole (20260928160000)
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.distance_unit_before='feet' THEN nx.distance_to_hole_before/3.0 ELSE nx.distance_to_hole_before END
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
          ELSE 0 END AS dist_after_yards,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
          WHEN nx.distance_to_hole_before IS NOT NULL THEN
            CASE WHEN nx.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(nx.lie_before) END
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          ELSE NULL END AS lie_after_norm,
        COALESCE(gs.is_penalty,FALSE) AS is_penalty,
        org.has_origin AS org_found, org.lie_norm AS org_lie_norm, org.dist_yards AS org_dist_yards
      FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
      LEFT JOIN LATERAL (
        SELECT n.shot_type, n.lie_before, n.distance_to_hole_before, n.distance_unit_before
        FROM golf_shots n
        WHERE n.hole_id = gs.hole_id AND n.shot_number > gs.shot_number
          AND NOT COALESCE(n.is_penalty, FALSE)
          AND n.distance_to_hole_before IS NOT NULL AND n.distance_to_hole_before > 0
          AND (n.lie_before IS NOT NULL OR n.shot_type = 'putting')
        ORDER BY n.shot_number, n.id
        LIMIT 1
      ) nx ON TRUE
      -- where a penalty was earned: the nearest preceding non-penalty shot, else
      -- the nearest following one (TS resolvePenaltyOrigin); no row for a shot
      LEFT JOIN LATERAL (
        SELECT TRUE AS has_origin,
          CASE WHEN o.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(o.lie_before) END AS lie_norm,
          CASE WHEN o.distance_to_hole_before IS NULL THEN NULL
               WHEN o.distance_unit_before='feet' THEN o.distance_to_hole_before/3.0
               ELSE o.distance_to_hole_before END AS dist_yards
        FROM golf_shots o
        WHERE COALESCE(gs.is_penalty, FALSE)
          AND o.hole_id = gs.hole_id AND o.shot_number <> gs.shot_number
          AND NOT COALESCE(o.is_penalty, FALSE) AND COALESCE(o.shot_type, '') <> 'penalty'
        ORDER BY (o.shot_number < gs.shot_number) DESC,
                 CASE WHEN o.shot_number < gs.shot_number THEN -o.shot_number ELSE o.shot_number END, o.id
        LIMIT 1
      ) org ON TRUE
      WHERE gs.round_id=p_round_id
        AND (COALESCE(gs.is_penalty, FALSE)
             OR (gs.shot_type IS NOT NULL AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0))
    ),
    attributed AS (
      SELECT normalized.*,
        CASE WHEN org_found THEN org_lie_norm ELSE lie_before_norm END AS pen_lie,
        CASE WHEN org_found THEN org_dist_yards ELSE dist_before_yards END AS pen_dist_yards
      FROM normalized
    ),
    categorized AS (
      SELECT CASE
               WHEN is_penalty THEN
                 CASE WHEN pen_lie='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                      WHEN pen_lie='green' THEN 'around_green'
                      WHEN pen_dist_yards<=50 THEN 'around_green'
                      ELSE 'approach' END
               WHEN shot_type='putting' THEN 'putting'
               WHEN shot_type='tee' THEN 'off_tee'
               WHEN shot_type='around_green' THEN 'around_green'
               ELSE 'approach' END AS category,
        CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
        CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
        CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
      FROM attributed WHERE dist_before_yards>0 OR is_penalty
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM categorized;
  ELSE
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM sg_estimate_from_holes(p_round_id);
  END IF;
  v_sg_total := ROUND((COALESCE(v_sg_off_tee,0)+COALESCE(v_sg_approach,0)+COALESCE(v_sg_around,0)+COALESCE(v_sg_putting,0))::NUMERIC,3);
  INSERT INTO golf_round_stats_cache (id, round_id, player_id, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, created_at, updated_at)
  SELECT gen_random_uuid(), p_round_id, v_player_id, v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM golf_round_stats_cache WHERE round_id=p_round_id);
  UPDATE golf_round_stats_cache SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around,
    strokes_gained_putting=v_sg_putting, updated_at=now() WHERE round_id=p_round_id;
  UPDATE golf_rounds SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around, strokes_gained_putting=v_sg_putting
  WHERE id=p_round_id AND (
    strokes_gained_total IS DISTINCT FROM v_sg_total OR strokes_gained_tee IS DISTINCT FROM v_sg_off_tee
    OR strokes_gained_approach IS DISTINCT FROM v_sg_approach OR strokes_gained_around_green IS DISTINCT FROM v_sg_around
    OR strokes_gained_putting IS DISTINCT FROM v_sg_putting);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid)
 RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
  v_player_id UUID; v_scale NUMERIC := 1.0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  v_scale := sg_scale_for_player(v_player_id);

  WITH normalized AS (
    SELECT gs.shot_type, gs.shot_number, gh.par,
      CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
      CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
      (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
        WHEN nx.distance_to_hole_before IS NOT NULL THEN
          CASE WHEN nx.distance_unit_before='feet' THEN nx.distance_to_hole_before/3.0 ELSE nx.distance_to_hole_before END
        WHEN gs.distance_to_hole_after IS NOT NULL THEN
          CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
        ELSE 0 END AS dist_after_yards,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
        WHEN nx.distance_to_hole_before IS NOT NULL THEN
          CASE WHEN nx.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(nx.lie_before) END
        WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
        ELSE NULL END AS lie_after_norm,
      COALESCE(gs.is_penalty,FALSE) AS is_penalty,
      org.has_origin AS org_found, org.lie_norm AS org_lie_norm, org.dist_yards AS org_dist_yards
    FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
    LEFT JOIN LATERAL (
      SELECT n.shot_type, n.lie_before, n.distance_to_hole_before, n.distance_unit_before
      FROM golf_shots n
      WHERE n.hole_id = gs.hole_id AND n.shot_number > gs.shot_number
        AND NOT COALESCE(n.is_penalty, FALSE)
        AND n.distance_to_hole_before IS NOT NULL AND n.distance_to_hole_before > 0
        AND (n.lie_before IS NOT NULL OR n.shot_type = 'putting')
      ORDER BY n.shot_number, n.id
      LIMIT 1
    ) nx ON TRUE
    LEFT JOIN LATERAL (
      SELECT TRUE AS has_origin,
        CASE WHEN o.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(o.lie_before) END AS lie_norm,
        CASE WHEN o.distance_to_hole_before IS NULL THEN NULL
             WHEN o.distance_unit_before='feet' THEN o.distance_to_hole_before/3.0
             ELSE o.distance_to_hole_before END AS dist_yards
      FROM golf_shots o
      WHERE COALESCE(gs.is_penalty, FALSE)
        AND o.hole_id = gs.hole_id AND o.shot_number <> gs.shot_number
        AND NOT COALESCE(o.is_penalty, FALSE) AND COALESCE(o.shot_type, '') <> 'penalty'
      ORDER BY (o.shot_number < gs.shot_number) DESC,
               CASE WHEN o.shot_number < gs.shot_number THEN -o.shot_number ELSE o.shot_number END, o.id
      LIMIT 1
    ) org ON TRUE
    WHERE gs.round_id=p_round_id
      AND (COALESCE(gs.is_penalty, FALSE)
           OR (gs.shot_type IS NOT NULL AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0))
  ),
  attributed AS (
    SELECT normalized.*,
      CASE WHEN org_found THEN org_lie_norm ELSE lie_before_norm END AS pen_lie,
      CASE WHEN org_found THEN org_dist_yards ELSE dist_before_yards END AS pen_dist_yards
    FROM normalized
  ),
  categorized AS (
    SELECT CASE
             WHEN is_penalty THEN
               CASE WHEN pen_lie='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                    WHEN pen_lie='green' THEN 'around_green'
                    WHEN pen_dist_yards<=50 THEN 'around_green'
                    ELSE 'approach' END
             WHEN shot_type='putting' THEN 'putting'
             WHEN shot_type='tee' THEN 'off_tee'
             WHEN shot_type='around_green' THEN 'around_green'
             ELSE 'approach' END AS category,
      CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
      CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
      CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
    FROM attributed WHERE dist_before_yards>0 OR is_penalty
  )
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
  INTO v_off_tee, v_approach, v_around, v_putting FROM categorized;

  sg_tee := v_off_tee; sg_approach := v_approach; sg_around_green := v_around; sg_putting := v_putting;
  sg_total := ROUND((COALESCE(v_off_tee,0)+COALESCE(v_approach,0)+COALESCE(v_around,0)+COALESCE(v_putting,0))::NUMERIC,3);
  RETURN NEXT;
END;
$function$;
