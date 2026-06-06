-- MR-2 (P0) — make golf_metrics reproducible from the applied migration chain.
--
-- BACKGROUND
-- The 20260524190100 table-create + 20260524190200 seed pair were archived
-- under supabase/migrations_archive/pre_20260527/ when the 2026-05-27 prod
-- baseline was cut. The baseline (20260527000000_prod_public_baseline.sql)
-- re-CREATEs public.golf_metrics but never re-INSERTs the 28 canonical rows
-- (a schema baseline carries DDL, not reference data). Result: prod itself
-- is fine (28 rows survive in the live DB), but a fresh `supabase db reset`,
-- a CI shadow DB, or a disaster-recovery rebuild from the migration chain
-- produces an EMPTY golf_metrics table — which silently no-ops the v3 engine
-- (loadMetrics() returns an empty Map) and breaks every FK that targets
-- golf_metrics (goals, standing, pga_standards, drills, outcome attribution).
--
-- This migration re-seeds the canonical 28 metrics so the table is
-- reproducible from migrations alone. It is IDEMPOTENT: ON CONFLICT
-- (metric_id) DO NOTHING preserves the live prod rows untouched (metric_id
-- is the PRIMARY KEY) and is a safe no-op on prod. On a fresh DB it fills
-- the table.
--
-- The row set is the exact 28-metric canonical registry, mirroring
-- src/lib/coachhelm/v3/metrics/registry.ts (METRIC_IDS) and the original
-- archived seed (20260524190200_v3_golf_metrics_seed.sql). load.ts
-- validateMetricRegistry() enforces TS<->DB parity in CI.
--
-- VERIFIED 2026-06-06 against prod project qmnssrrolpinvwjjnufo:
--   SELECT count(*) FROM public.golf_metrics; -> 28 (matches this set
--   row-for-row on metric_id/label/unit/direction/category/wave/active).
--
-- ROLLBACK:
--   DELETE FROM public.golf_metrics WHERE introduced_in_wave = 'W9';
--   (Safe only on a throwaway/local DB — on prod the FK references from
--   goals/standing/pga_standards will block the delete. That is intended.)

INSERT INTO public.golf_metrics (
  metric_id, display_label, unit, direction, category, description, introduced_in_wave
) VALUES
  -- Strokes Gained headline (5) — read from golf_player_stats_cache (Part V.1)
  ('sg_total',          'SG: Total',            'strokes', 'higher_better', 'sg',          'Total strokes gained vs field average; sum of OTT + APP + ARG + PUTT.', 'W9'),
  ('sg_ott',            'SG: Off the Tee',      'strokes', 'higher_better', 'sg',          'Strokes gained on par-4 and par-5 tee shots only. Par-3 tee shots count as approach.', 'W9'),
  ('sg_approach',       'SG: Approach',         'strokes', 'higher_better', 'sg',          'Strokes gained on approach shots beyond ~30 yards (includes par-3 tee shots).', 'W9'),
  ('sg_around_green',   'SG: Around the Green', 'strokes', 'higher_better', 'sg',          'Strokes gained within ~30 yards, not on the green.', 'W9'),
  ('sg_putting',        'SG: Putting',          'strokes', 'higher_better', 'sg',          'Strokes gained on putts.', 'W9'),

  -- Putt make % by distance (5) — PuttDistanceGenerator W21
  ('putts_made_3_5ft_pct',     'Putts Made 3-5 ft',      'percent', 'higher_better', 'putting', 'Make percentage from 3-5 feet (Tour ~85%, the highest-leverage short-putt zone).', 'W9'),
  ('putts_made_5_10ft_pct',    'Putts Made 5-10 ft',     'percent', 'higher_better', 'putting', 'Make percentage from 5-10 feet (knee-knocker zone; biggest tournament-pressure differentiator).', 'W9'),
  ('putts_made_10_15ft_pct',   'Putts Made 10-15 ft',    'percent', 'higher_better', 'putting', 'Make percentage from 10-15 feet (Tour ~30%; primary birdie zone).', 'W9'),
  ('putts_made_15_25ft_pct',   'Putts Made 15-25 ft',    'percent', 'higher_better', 'putting', 'Make percentage from 15-25 feet (Tour ~15%; secondary birdie zone).', 'W9'),
  ('putts_made_25_plus_ft_pct','Putts Made 25+ ft',      'percent', 'higher_better', 'putting', 'Make percentage from 25+ feet (Tour ~5.5%; lag-putting outcome).', 'W9'),

  -- Putt miss bias (4) — PuttBiasGenerator W22
  ('putt_miss_bias_high_pct',  'Putt Miss High %',  'percent', 'lower_better', 'putting', 'Of missed putts, share that finished past the hole. Speed-control diagnostic.', 'W9'),
  ('putt_miss_bias_low_pct',   'Putt Miss Low %',   'percent', 'lower_better', 'putting', 'Of missed putts, share that finished short. Decel / under-read diagnostic.', 'W9'),
  ('putt_miss_bias_left_pct',  'Putt Miss Left %',  'percent', 'lower_better', 'putting', 'Of missed putts, share that missed left of hole. Aim / stroke-path diagnostic.', 'W9'),
  ('putt_miss_bias_right_pct', 'Putt Miss Right %', 'percent', 'lower_better', 'putting', 'Of missed putts, share that missed right of hole.', 'W9'),

  -- Approach proximity by distance (3) — ApproachMissGenerator W22 (unit feet, lower is better)
  ('approach_proximity_50_125ft',   'Approach Proximity 50-125 yd',  'feet', 'lower_better', 'approach', 'Average proximity to hole from approaches 50-125 yards (Tour ~16-19 ft; college ~25-32 ft — biggest gap).', 'W9'),
  ('approach_proximity_125_175ft',  'Approach Proximity 125-175 yd', 'feet', 'lower_better', 'approach', 'Average proximity to hole from approaches 125-175 yards.', 'W9'),
  ('approach_proximity_175_plus_ft','Approach Proximity 175+ yd',    'feet', 'lower_better', 'approach', 'Average proximity to hole from approaches 175+ yards.', 'W9'),

  -- Scrambling by lie (3) — ScramblingGenerator W22
  ('scrambling_pct_rough',    'Scrambling % Rough',    'percent', 'higher_better', 'short_game', 'Up-and-down rate when missing the green in the rough.', 'W9'),
  ('scrambling_pct_sand',     'Scrambling % Sand',     'percent', 'higher_better', 'short_game', 'Up-and-down rate from greenside bunker (sand save).', 'W9'),
  ('scrambling_pct_fairway',  'Scrambling % Fairway',  'percent', 'higher_better', 'short_game', 'Up-and-down rate when missing the green from the fairway side.', 'W9'),

  -- Course management (2) — CourseMgmtGenerator W23
  ('penalty_rate_per_round',  'Penalties per Round',          'count',   'lower_better', 'course_mgmt', 'Average penalty strokes per round. 70% of double bogeys start with a penalty (Part V.4 causal chain).', 'W9'),
  ('big_number_rate',         'Double Bogey-or-Worse Rate',   'percent', 'lower_better', 'course_mgmt', 'Percentage of holes ending double bogey or worse. #1 separator between 70s and 80s rounds.', 'W9'),

  -- Per-par scoring (3) — ParTypeGenerator W23
  ('scoring_par_3', 'Par 3 Scoring',  'strokes', 'lower_better', 'scoring', 'Average score to par on par-3 holes.', 'W9'),
  ('scoring_par_4', 'Par 4 Scoring',  'strokes', 'lower_better', 'scoring', 'Average score to par on par-4 holes.', 'W9'),
  ('scoring_par_5', 'Par 5 Scoring',  'strokes', 'lower_better', 'scoring', 'Average score to par on par-5 holes.', 'W9'),

  -- Greens in regulation (1) — table stakes for college baseline
  ('gir_pct', 'GIR %', 'percent', 'higher_better', 'approach', 'Greens in regulation rate. Single biggest separator between handicap brackets (Part V.4).', 'W9'),

  -- Pressure + warmup (2) — PressureGapGenerator + WarmupHoleGenerator W24
  ('practice_tournament_delta', 'Practice vs Tournament Delta', 'strokes', 'lower_better', 'pressure', 'Tournament scoring average minus practice scoring average. Typical college gap 2-5 strokes (Hickman & Metz).', 'W9'),
  ('opening_hole_delta',        'Opening Hole Delta',           'strokes', 'lower_better', 'pressure', 'Hole 1 score vs. round average score. Captures first-tee jitters; widens for high-pressure rounds.', 'W9')
ON CONFLICT (metric_id) DO NOTHING;
