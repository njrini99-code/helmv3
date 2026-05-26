-- W38 follow-up — tag every existing drill with its target v3 metric.
--
-- One purpose: backfill `golf_drills.impacts_metric_id` across all 63
-- already-seeded drills so Practice Rx (W38 composer) actually returns
-- per-goal drill candidates instead of "no drills tagged" errors.
--
-- Mapping was hand-curated against the v3 metric registry (see
-- v3-research-golf-domain.md §3 for the rationale per drill type).
--
-- One UPDATE per drill slug — safe to re-run (idempotent: we use
-- explicit slug filters so re-running just re-stamps the same values).
--
-- VERIFIED 2026-05-26: 63 drills exist, 0 tagged before this migration.

-- ===========================================================================
-- PUTTING — distance buckets + miss-bias drills
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_3_5ft_pct'        WHERE slug = 'putt_clock_3ft';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_3_5ft_pct'        WHERE slug = 'putt_gate_3ft';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_5_10ft_pct'       WHERE slug = 'putt_gate_6ft';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_5_10ft_pct'       WHERE slug = 'putt_edge_6_10';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_5_10ft_pct'       WHERE slug = 'putt_one_handed_6_10';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_10_15ft_pct'      WHERE slug = 'putt_15ft_cluster';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_25_plus_ft_pct'   WHERE slug = 'putt_around_world';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_25_plus_ft_pct'   WHERE slug = 'putt_ladder_lag';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_15_25ft_pct'      WHERE slug = 'putt_speed_only';
UPDATE public.golf_drills SET impacts_metric_id = 'putts_made_15_25ft_pct'      WHERE slug = 'putt_uphill_downhill';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_putting'                  WHERE slug = 'putt_aim_point_station';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_putting'                  WHERE slug = 'putt_break_read_station';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_putting'                  WHERE slug = 'putt_tiger_4ball';
UPDATE public.golf_drills SET impacts_metric_id = 'putt_miss_bias_high_pct'     WHERE slug = 'putt_high_side_preference';
UPDATE public.golf_drills SET impacts_metric_id = 'putt_miss_bias_low_pct'      WHERE slug = 'putt_low_side_discipline';

-- ===========================================================================
-- APPROACH — proximity buckets
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_125_175ft'  WHERE slug = 'approach_150_proximity';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_125_175ft'  WHERE slug = 'approach_175_accuracy';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_175_plus_ft' WHERE slug = 'approach_200_long_iron';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_approach'                   WHERE slug = 'approach_miss_bias_fix';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_50_125ft'   WHERE slug = 'approach_pga_distance_control';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_approach'                   WHERE slug = 'approach_9_shot_matrix';
UPDATE public.golf_drills SET impacts_metric_id = 'gir_pct'                       WHERE slug = 'approach_front_middle_back';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_approach'                   WHERE slug = 'approach_green_light_red_light';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_approach'                   WHERE slug = 'approach_pick_your_club';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_125_175ft'  WHERE slug = 'approach_sloped_lie';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_175_plus_ft' WHERE slug = 'approach_wind_trainer';
UPDATE public.golf_drills SET impacts_metric_id = 'approach_proximity_50_125ft'   WHERE slug = 'approach_yardage_gap_test';

-- ===========================================================================
-- SHORT GAME — scrambling lie variants
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_rough'         WHERE slug = 'shortgame_20_30_40_pitch';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_fairway'       WHERE slug = 'shortgame_bump_run_links';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_fairway'       WHERE slug = 'shortgame_clock_chip';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_rough'         WHERE slug = 'shortgame_flop_to_towel';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_sand'          WHERE slug = 'shortgame_fried_egg';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_fairway'       WHERE slug = 'shortgame_hybrid_chip';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_around_green'              WHERE slug = 'shortgame_one_club_wizardry';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_sand'          WHERE slug = 'shortgame_sand_splash_line';
UPDATE public.golf_drills SET impacts_metric_id = 'scrambling_pct_rough'         WHERE slug = 'shortgame_spinners';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_around_green'              WHERE slug = 'shortgame_up_and_down_game';

-- ===========================================================================
-- TEE — every driver/3W drill maps to strokes-gained off the tee
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'sg_ott' WHERE category = 'tee' AND impacts_metric_id IS NULL;

-- ===========================================================================
-- COURSE MANAGEMENT — penalty + big-number prevention
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'penalty_rate_per_round'  WHERE slug = 'cm_club_selection_matrix';
UPDATE public.golf_drills SET impacts_metric_id = 'big_number_rate'         WHERE slug = 'cm_green_light_audit';
UPDATE public.golf_drills SET impacts_metric_id = 'big_number_rate'         WHERE slug = 'cm_preferred_yardage';
UPDATE public.golf_drills SET impacts_metric_id = 'penalty_rate_per_round'  WHERE slug = 'cm_risk_reward_table';
UPDATE public.golf_drills SET impacts_metric_id = 'penalty_rate_per_round'  WHERE slug = 'cm_tee_strategy_map';

-- ===========================================================================
-- PRESSURE — tournament-vs-practice + opening-hole
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'practice_tournament_delta' WHERE slug = 'pressure_6ft_pressure';
UPDATE public.golf_drills SET impacts_metric_id = 'practice_tournament_delta' WHERE slug = 'pressure_back_nine_sim';
UPDATE public.golf_drills SET impacts_metric_id = 'practice_tournament_delta' WHERE slug = 'pressure_box_breathing';
UPDATE public.golf_drills SET impacts_metric_id = 'opening_hole_delta'        WHERE slug = 'pressure_first_tee_sim';
UPDATE public.golf_drills SET impacts_metric_id = 'practice_tournament_delta' WHERE slug = 'pressure_pre_shot_routine';

-- ===========================================================================
-- SCORING — par-type + sg_total + big-number recovery
-- ===========================================================================

UPDATE public.golf_drills SET impacts_metric_id = 'sg_total'        WHERE slug = 'scoring_9_tough_pins';
UPDATE public.golf_drills SET impacts_metric_id = 'big_number_rate' WHERE slug = 'scoring_bogey_save';
UPDATE public.golf_drills SET impacts_metric_id = 'scoring_par_3'   WHERE slug = 'scoring_par3_green_hunt';
UPDATE public.golf_drills SET impacts_metric_id = 'scoring_par_5'   WHERE slug = 'scoring_par5_3shot_plan';
UPDATE public.golf_drills SET impacts_metric_id = 'scoring_par_4'   WHERE slug = 'scoring_short_par4_drive';
UPDATE public.golf_drills SET impacts_metric_id = 'sg_total'        WHERE slug = 'scoring_worst_ball';
