-- Stats accuracy audit 2026-06-09 (write-path finding W10): the standing
-- refresh RPCs CROSS JOIN golf_pga_standards and skip any metric without a
-- standards row, so a fresh environment (db reset, preview branch) got an
-- entirely EMPTY golf_player_standing table — the W10 seed data predates the
-- migration baseline and lived only in prod. Codify the prod rows
-- (dumped 2026-06-10) so environments reproduce. ON CONFLICT DO NOTHING:
-- applying to prod is a no-op and never overwrites curated updates.

INSERT INTO public.golf_pga_standards
  (metric_id, season, display_label, pga_tour_value, korn_ferry_value, div1_avg_value, div2_avg_value, div3_avg_value, hs_avg_value, pga_p25, pga_p50, pga_p75, source)
VALUES
  ('approach_proximity_125_175ft', '2024', 'Approach Proximity 125-175 yd', 30, NULL, 38, NULL, NULL, NULL, 27, 30, 34, 'Research doc §2: "150-175 yds: ~30 ft". D1 estimate +8 ft based on §3 trend.'),
  ('approach_proximity_175_plus_ft', '2024', 'Approach Proximity 175+ yd', 45, NULL, 55, NULL, NULL, NULL, 40, 45, 52, 'Research doc §2: "200+ yds: ~45+ ft".'),
  ('approach_proximity_50_125ft', '2024', 'Approach Proximity 50-125 yd', 18, NULL, 28, NULL, NULL, NULL, 16, 18, 22, 'Tour 50-125 yd: ~16-19 ft (Research doc §2). Tour leader 14''9". D1 ~25-32 ft (§3 "biggest invisible gap").'),
  ('big_number_rate', '2024', 'Double Bogey-or-Worse Rate', 2.0, NULL, 5.0, 7.0, 9.0, 14.0, 1.0, 2.0, 3.5, 'Tour ~2% per Research doc §4 "#1 separator between 70s and 80s rounds". Compare Scheffler 2024 3-putt = 1.88% as a frequency reference.'),
  ('gir_pct', '2024', 'GIR %', 66, NULL, 60, 55, 50, 40, 62, 66, 72, 'Tour ~65-67%; top ~72% per Research doc §2. D1 58-65% per §3.'),
  ('opening_hole_delta', '2024', 'Opening Hole Delta', 0.1, NULL, 0.3, 0.4, 0.5, 0.7, 0.05, 0.1, 0.15, 'Research doc §9: "opening hole ~0.1-0.15 strokes worse than round avg on Tour; larger for amateurs".'),
  ('penalty_rate_per_round', '2024', 'Penalties per Round', 0.3, NULL, 0.5, 0.8, 1.0, 1.5, 0.1, 0.3, 0.6, 'Tour low (~0.3/round). Research doc §3: "top teams <0.5 penalties/round; struggling 2+". §4: "70% of double bogeys start with a penalty".'),
  ('practice_tournament_delta', '2024', 'Practice vs Tournament Delta', 0.5, NULL, 2.0, 2.5, 3.0, 3.5, 0.3, 0.5, 0.8, 'Tour gap small but measurable (Hickman & Metz, 2015). College "2-5 stroke" per Research doc §9.'),
  ('putt_miss_bias_high_pct', '2024', 'Putt Miss High %', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_left_pct', '2024', 'Putt Miss Left %', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_low_pct', '2024', 'Putt Miss Low %', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'No public benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_right_pct', '2024', 'Putt Miss Right %', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'No public benchmark. Standing bar shows team marker only.'),
  ('putts_made_10_15ft_pct', '2024', 'Putts Made 10-15 ft', 35.7, NULL, 25.0, NULL, NULL, NULL, NULL, 35.7, NULL, 'Tour avg of 10 ft (41.3%) + 11-15 ft (30.1%). D1 per Shot Scope 0-HCP "12-18 ft = 25.1%". Research doc §2 + §3.'),
  ('putts_made_15_25ft_pct', '2024', 'Putts Made 15-25 ft', 15.4, NULL, 12.0, NULL, NULL, NULL, NULL, 15.4, NULL, 'Tour avg of 15-20 ft (18.3%) + 20-25 ft (12.5%). D1 per Shot Scope 0-HCP "18-24 ft = 14.5%". Research doc §2 + §3.'),
  ('putts_made_25_plus_ft_pct', '2024', 'Putts Made 25+ ft', 5.5, NULL, 4.0, NULL, NULL, NULL, NULL, 5.5, NULL, 'Tour 25+ ft = 5.5%. D1 per Shot Scope 0-HCP "30+ ft = 4.3%". Research doc §2 + §3.'),
  ('putts_made_3_5ft_pct', '2024', 'Putts Made 3-5 ft', 90.5, NULL, 88.0, NULL, NULL, NULL, NULL, 90.5, NULL, 'Tour avg of 3+4+5 ft: (99.4+91.4+80.7)/3. D1 estimate per Shot Scope 0-HCP "0-6 ft = 92.8%". Research doc §2 + §3.'),
  ('putts_made_5_10ft_pct', '2024', 'Putts Made 5-10 ft', 62.2, NULL, 50.0, NULL, NULL, NULL, NULL, 62.2, NULL, 'Tour avg of 5+6+7+8+9 ft. D1 estimate per Shot Scope "6-12 ft = 41-43%" (overlapping bucket). Research doc §2 + §3.'),
  ('scoring_par_3', '2024', 'Par 3 Scoring', 3.00, NULL, 3.20, 3.30, 3.40, 3.60, 2.95, 3.00, 3.10, 'Tour par-3 avg essentially par (3.00). D1 +0.20 per Research doc §3 (scoring avg 73 on par-72 implies +1 spread).'),
  ('scoring_par_4', '2024', 'Par 4 Scoring', 3.97, NULL, 4.10, 4.20, 4.30, 4.50, 3.90, 3.97, 4.05, 'Tour par-4 avg slightly under par. D1 +0.13 per Research doc §3.'),
  ('scoring_par_5', '2024', 'Par 5 Scoring', 4.55, NULL, 4.85, 4.95, 5.10, 5.30, 4.45, 4.55, 4.70, 'Tour par-5 well under par (scoring opportunity; 35-40% birdie expectancy when reachable). Research doc §7 "reachable in 2".'),
  ('scrambling_pct_fairway', '2024', 'Scrambling % Fairway', 65, NULL, 57, 54, 51, 45, NULL, 65, NULL, 'Research doc §2: "Scrambling from Fairway miss ~65%".'),
  ('scrambling_pct_rough', '2024', 'Scrambling % Rough', 58, NULL, 50, 47, 45, 35, NULL, 58, NULL, 'Research doc §2: "Scrambling from Rough ~58%". D1 ~50-52% per §3.'),
  ('scrambling_pct_sand', '2024', 'Scrambling % Sand', 50, NULL, 40, 37, 35, 25, NULL, 50, NULL, 'Research doc §2: "Sand Save % ~50%". D1 ~40% per §3. 15-HCP ~20%.'),
  ('sg_approach', '2024', 'SG: Approach', 0, NULL, NULL, NULL, NULL, NULL, -0.3, 0, 0.5, '"Scheffler routinely >1.0" per Research doc §2 SG benchmarks; elite ~0.5+.'),
  ('sg_around_green', '2024', 'SG: Around the Green', 0, NULL, NULL, NULL, NULL, NULL, -0.2, 0, 0.3, 'Research doc §2 "0.3+/round = elite".'),
  ('sg_ott', '2024', 'SG: Off the Tee', 0, NULL, NULL, NULL, NULL, NULL, -0.3, 0, 0.5, 'Tour field median 0; "0.5+/round = elite" per Research doc §2.'),
  ('sg_putting', '2024', 'SG: Putting', 0, NULL, NULL, NULL, NULL, NULL, -0.3, 0, 0.4, 'Research doc §2 "0.4+/round = elite; Harry Hall led 2025 at 1.677".'),
  ('sg_total', '2024', 'SG: Total', 0, NULL, NULL, NULL, NULL, NULL, -0.5, 0, 0.5, 'Broadie / PGA Tour ShotLink; field-level zero-sum. Research doc §2 "SG benchmarks (Top 30 Tour)".')
ON CONFLICT (metric_id, season) DO NOTHING;
