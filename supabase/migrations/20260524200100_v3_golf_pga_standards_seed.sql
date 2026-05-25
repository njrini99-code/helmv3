-- v3 Wave 10 part 2 — golf_pga_standards seed (2024 season)
--
-- Seeds baseline values for every active metric in golf_metrics (28 rows
-- as of W9-pt2). Per master plan Part VII.1: "Seeded with 28+ canonical
-- metrics from registry. Sources: PGA Tour stats page, Shot Scope amateur
-- curves, Arccos data, Broadie's published baselines."
--
-- Source for every populated cohort value traces back to
-- docs/v3-research-golf-domain.md sections 2 (PGA baselines), 3 (college
-- baselines), and the source list at the bottom of that file.
--
-- WHERE VALUES ARE NULL: the metric exists in the registry but we don't
-- have a public benchmark for that cohort (most commonly: putt-miss-bias
-- has no Tour benchmark — it's a player-vs-self diagnostic). Standing
-- bars (W11+) check NULL and degrade gracefully (team marker only).
--
-- Idempotent: ON CONFLICT (metric_id, season) DO NOTHING. Future seasons
-- ship in a new migration (e.g. 20270101_v3_golf_pga_standards_seed_2025.sql).
--
-- VERIFIED 2026-05-24: golf_pga_standards table created in prior migration.
-- FK target golf_metrics seeded with the same 28 metric_ids in W9-pt2.
-- Dry-run of the W9-pt2 + W10 chain confirms FK + INSERT both succeed.
--
-- ROLLBACK:
--   DELETE FROM public.golf_pga_standards WHERE season = '2024';

INSERT INTO public.golf_pga_standards (
  metric_id, season, display_label,
  pga_tour_value, korn_ferry_value,
  div1_avg_value, div2_avg_value, div3_avg_value, hs_avg_value,
  pga_p25, pga_p50, pga_p75,
  source
) VALUES
  -- =====================================================================
  -- SG cluster (5) — zero-sum metrics; pga_tour_value = 0 by definition.
  -- Cohort values populated only where reliable per Part 2 of research doc.
  -- =====================================================================
  ('sg_total',         '2024', 'SG: Total',
   0,    null, null, null, null, null,
   -0.5, 0,    0.5,
   'Broadie / PGA Tour ShotLink; field-level zero-sum. Research doc §2 "SG benchmarks (Top 30 Tour)".'),
  ('sg_ott',           '2024', 'SG: Off the Tee',
   0,    null, null, null, null, null,
   -0.3, 0,    0.5,
   'Tour field median 0; "0.5+/round = elite" per Research doc §2.'),
  ('sg_approach',      '2024', 'SG: Approach',
   0,    null, null, null, null, null,
   -0.3, 0,    0.5,
   '"Scheffler routinely >1.0" per Research doc §2 SG benchmarks; elite ~0.5+.'),
  ('sg_around_green',  '2024', 'SG: Around the Green',
   0,    null, null, null, null, null,
   -0.2, 0,    0.3,
   'Research doc §2 "0.3+/round = elite".'),
  ('sg_putting',       '2024', 'SG: Putting',
   0,    null, null, null, null, null,
   -0.3, 0,    0.4,
   'Research doc §2 "0.4+/round = elite; Harry Hall led 2025 at 1.677".'),

  -- =====================================================================
  -- Putt make % by distance (5) — from Dethier/Broadie Tour data
  -- (Research doc §2 table). College baselines from Shot Scope 0-HCP curves
  -- (Research doc §3) where bucket alignment allows.
  -- =====================================================================
  ('putts_made_3_5ft_pct',     '2024', 'Putts Made 3-5 ft',
   90.5, null, 88.0, null, null, null,
   null, 90.5, null,
   'Tour avg of 3+4+5 ft: (99.4+91.4+80.7)/3. D1 estimate per Shot Scope 0-HCP "0-6 ft = 92.8%". Research doc §2 + §3.'),
  ('putts_made_5_10ft_pct',    '2024', 'Putts Made 5-10 ft',
   62.2, null, 50.0, null, null, null,
   null, 62.2, null,
   'Tour avg of 5+6+7+8+9 ft. D1 estimate per Shot Scope "6-12 ft = 41-43%" (overlapping bucket). Research doc §2 + §3.'),
  ('putts_made_10_15ft_pct',   '2024', 'Putts Made 10-15 ft',
   35.7, null, 25.0, null, null, null,
   null, 35.7, null,
   'Tour avg of 10 ft (41.3%) + 11-15 ft (30.1%). D1 per Shot Scope 0-HCP "12-18 ft = 25.1%". Research doc §2 + §3.'),
  ('putts_made_15_25ft_pct',   '2024', 'Putts Made 15-25 ft',
   15.4, null, 12.0, null, null, null,
   null, 15.4, null,
   'Tour avg of 15-20 ft (18.3%) + 20-25 ft (12.5%). D1 per Shot Scope 0-HCP "18-24 ft = 14.5%". Research doc §2 + §3.'),
  ('putts_made_25_plus_ft_pct','2024', 'Putts Made 25+ ft',
   5.5,  null, 4.0,  null, null, null,
   null, 5.5,  null,
   'Tour 25+ ft = 5.5%. D1 per Shot Scope 0-HCP "30+ ft = 4.3%". Research doc §2 + §3.'),

  -- =====================================================================
  -- Putt miss bias (4) — player-vs-self diagnostic; no public Tour benchmark.
  -- Row exists for FK + display-label consistency; cohort values null.
  -- =====================================================================
  ('putt_miss_bias_high_pct',  '2024', 'Putt Miss High %',
   null, null, null, null, null, null,
   null, null, null,
   'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_low_pct',   '2024', 'Putt Miss Low %',
   null, null, null, null, null, null,
   null, null, null,
   'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_left_pct',  '2024', 'Putt Miss Left %',
   null, null, null, null, null, null,
   null, null, null,
   'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_right_pct', '2024', 'Putt Miss Right %',
   null, null, null, null, null, null,
   null, null, null,
   'No public benchmark. Standing bar shows team marker only.'),

  -- =====================================================================
  -- Approach proximity by distance (3) — feet, lower_better.
  -- Research doc §2: 50-125 yds ~16-19 ft (use 18); 150-175 yds ~30 ft;
  -- 200+ yds ~45 ft. D1 wedge proximity ~25-32 ft per §3 — single
  -- biggest D1 vs Tour gap.
  -- =====================================================================
  ('approach_proximity_50_125ft',    '2024', 'Approach Proximity 50-125 yd',
   18,   null, 28,   null, null, null,
   16,   18,   22,
   'Tour 50-125 yd: ~16-19 ft (Research doc §2). Tour leader 14''9". D1 ~25-32 ft (§3 "biggest invisible gap").'),
  ('approach_proximity_125_175ft',   '2024', 'Approach Proximity 125-175 yd',
   30,   null, 38,   null, null, null,
   27,   30,   34,
   'Research doc §2: "150-175 yds: ~30 ft". D1 estimate +8 ft based on §3 trend.'),
  ('approach_proximity_175_plus_ft', '2024', 'Approach Proximity 175+ yd',
   45,   null, 55,   null, null, null,
   40,   45,   52,
   'Research doc §2: "200+ yds: ~45+ ft".'),

  -- =====================================================================
  -- Scrambling by lie (3) — percent.
  -- Tour values from Research doc §2; D1 from §3 "scrambling ~50-55%".
  -- =====================================================================
  ('scrambling_pct_rough',    '2024', 'Scrambling % Rough',
   58, null, 50, 47, 45, 35,
   null, 58, null,
   'Research doc §2: "Scrambling from Rough ~58%". D1 ~50-52% per §3.'),
  ('scrambling_pct_sand',     '2024', 'Scrambling % Sand',
   50, null, 40, 37, 35, 25,
   null, 50, null,
   'Research doc §2: "Sand Save % ~50%". D1 ~40% per §3. 15-HCP ~20%.'),
  ('scrambling_pct_fairway',  '2024', 'Scrambling % Fairway',
   65, null, 57, 54, 51, 45,
   null, 65, null,
   'Research doc §2: "Scrambling from Fairway miss ~65%".'),

  -- =====================================================================
  -- Course management (2) — penalty + double-bogey-or-worse rate.
  -- Lower_better. Research doc §3 "top teams <0.5 penalties/round; struggling 2+".
  -- =====================================================================
  ('penalty_rate_per_round', '2024', 'Penalties per Round',
   0.3, null, 0.5,  0.8, 1.0, 1.5,
   0.1, 0.3, 0.6,
   'Tour low (~0.3/round). Research doc §3: "top teams <0.5 penalties/round; struggling 2+". §4: "70% of double bogeys start with a penalty".'),
  ('big_number_rate',        '2024', 'Double Bogey-or-Worse Rate',
   2.0, null, 5.0,  7.0, 9.0, 14.0,
   1.0, 2.0, 3.5,
   'Tour ~2% per Research doc §4 "#1 separator between 70s and 80s rounds". Compare Scheffler 2024 3-putt = 1.88% as a frequency reference.'),

  -- =====================================================================
  -- Per-par scoring (3) — strokes vs par, lower_better.
  -- Tour avg 70.9 on par-72 distributed across hole types per Research doc §2.
  -- =====================================================================
  ('scoring_par_3', '2024', 'Par 3 Scoring',
   3.00, null, 3.20, 3.30, 3.40, 3.60,
   2.95, 3.00, 3.10,
   'Tour par-3 avg essentially par (3.00). D1 +0.20 per Research doc §3 (scoring avg 73 on par-72 implies +1 spread).'),
  ('scoring_par_4', '2024', 'Par 4 Scoring',
   3.97, null, 4.10, 4.20, 4.30, 4.50,
   3.90, 3.97, 4.05,
   'Tour par-4 avg slightly under par. D1 +0.13 per Research doc §3.'),
  ('scoring_par_5', '2024', 'Par 5 Scoring',
   4.55, null, 4.85, 4.95, 5.10, 5.30,
   4.45, 4.55, 4.70,
   'Tour par-5 well under par (scoring opportunity; 35-40% birdie expectancy when reachable). Research doc §7 "reachable in 2".'),

  -- =====================================================================
  -- GIR (1) — table-stakes college baseline marker.
  -- =====================================================================
  ('gir_pct', '2024', 'GIR %',
   66, null, 60, 55, 50, 40,
   62, 66, 72,
   'Tour ~65-67%; top ~72% per Research doc §2. D1 58-65% per §3.'),

  -- =====================================================================
  -- Pressure + warmup (2) — strokes, lower_better.
  -- Tour data: Hickman & Metz (4th vs 3rd round); first-tee ~0.1-0.15.
  -- College: 2-5 stroke practice-to-tournament gap per Research doc §9.
  -- =====================================================================
  ('practice_tournament_delta', '2024', 'Practice vs Tournament Delta',
   0.5, null, 2.0, 2.5, 3.0, 3.5,
   0.3, 0.5, 0.8,
   'Tour gap small but measurable (Hickman & Metz, 2015). College "2-5 stroke" per Research doc §9.'),
  ('opening_hole_delta',        '2024', 'Opening Hole Delta',
   0.1, null, 0.3, 0.4, 0.5, 0.7,
   0.05, 0.1, 0.15,
   'Research doc §9: "opening hole ~0.1-0.15 strokes worse than round avg on Tour; larger for amateurs".')

ON CONFLICT (metric_id, season) DO NOTHING;
