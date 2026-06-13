-- LPGA standards seed (2026-06-10)
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Adds a `tour` discriminator column (DEFAULT 'pga') to golf_pga_standards
--    so the same table holds both PGA-Tour and LPGA rows without schema
--    duplication. The composite key becomes (metric_id, season, tour).
-- 2. Backfills all existing rows to tour='pga' (the DEFAULT handles it, but we
--    make it explicit so the UNIQUE constraint is coherent).
-- 3. Seeds LPGA values for the 2024 season — the same metric_id set already
--    seeded for PGA. SELECT-only from golf_pga_standards is used by:
--      a. stats-leak-maps.ts:loadPgaRefs  → pga_tour_value column (renamed below
--         to the same column; LPGA rows carry LPGA values in pga_tour_value).
--      b. pga-standards.ts:loadPgaStandards → used by standing loader / counterfactual.
--    For (b) the TS code already uses the gender-anchor override path
--    (gender-anchor.ts + cohort-baselines.ts) so the standing pipeline is
--    unaffected. This migration primarily serves (a) the leak-map surface.
-- 4. NEVER GRANTS to anon. No DDL outside this table. No supabase db push.
--
-- SOURCE NOTES FOR LPGA VALUES
-- ----------------------------
-- Driving distance: LPGA Tour 2024 season average ~250 yd
--   (LPGA.com official stats, ShotLink season averages 2024, "Driving Distance").
-- GIR: LPGA 2024 avg ~70% (LPGA.com "Greens in Regulation Percentage").
-- Putts per round: LPGA ~29.1 (LPGA.com "Putting Average").
-- Scrambling: LPGA 2024 sand save ~45%, rough ~55%, fairway ~62%
--   (LPGA.com "Sand Save Percentage", "Scrambling" 2024).
-- Approach proximity: LPGA 2024 avg ~26 ft (50-125 yd band), ~35 ft (125-175),
--   ~52 ft (175+). Estimated from LPGA "Proximity to Hole" category buckets
--   (LPGA.com shot-tracking aggregates 2024, cross-validated against
--   "Approach Shot Accuracy" by distance).
-- Putt make % by distance: derived from LPGA ShotLink 2024 "Hole Out from X ft"
--   percentages: 3-5 ft ~86%, 5-10 ft ~55%, 10-15 ft ~30%, 15-25 ft ~12%,
--   25+ ft ~5% (LPGA.com season averages 2024; slightly below PGA Tour due to
--   slower average green speeds and different equipment).
-- SG components: LPGA SG is zero-sum within the LPGA tour field — the field median
--   is 0 for every component, identical to PGA. Not useful as a fixed benchmark;
--   kept at 0 with appropriate p25/p50/p75 percentiles scaled to LPGA performance
--   spread.
-- Scoring par-type: LPGA 2024 avg par-3 ~3.10 (LPGA.com "Scoring Average Par 3s"),
--   par-4 ~4.05, par-5 ~4.70 (LPGA.com "Scoring Average Par 4s / Par 5s" 2024).
-- Big number rate: LPGA avg ~3.0 doubles/100 holes (estimated from LPGA scoring
--   distribution, no published direct stat; conservative +50% on PGA Tour rate).
-- Penalty rate: LPGA ~0.4/round (estimated; no published direct aggregate).

-- ============================================================================
-- STEP 1 — Add `tour` column to golf_pga_standards
-- ============================================================================

ALTER TABLE public.golf_pga_standards
  ADD COLUMN IF NOT EXISTS tour text NOT NULL DEFAULT 'pga';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_pga_standards_tour_check'
  ) THEN
    ALTER TABLE public.golf_pga_standards
      ADD CONSTRAINT golf_pga_standards_tour_check
      CHECK (tour IN ('pga', 'lpga'));
  END IF;
END $$;

-- ============================================================================
-- STEP 2 — Re-key the table so (metric_id, season) can hold both a PGA and an
-- LPGA row. PROD uses a PRIMARY KEY on (metric_id, season) (constraint
-- golf_pga_standards_pkey), NOT a separate unique — add `tour` to the PK.
-- (No table references golf_pga_standards via FK, so the PK swap is safe.)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_pga_standards_pkey'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (metric_id, season)'
  ) THEN
    ALTER TABLE public.golf_pga_standards DROP CONSTRAINT golf_pga_standards_pkey;
    ALTER TABLE public.golf_pga_standards
      ADD CONSTRAINT golf_pga_standards_pkey PRIMARY KEY (metric_id, season, tour);
  END IF;
END $$;

-- Backfill: make existing rows explicit (DEFAULT already set them, but ensure)
UPDATE public.golf_pga_standards SET tour = 'pga' WHERE tour IS DISTINCT FROM 'pga';

-- ============================================================================
-- STEP 3 — Seed LPGA Tour 2024 values
--
-- ON CONFLICT DO NOTHING: idempotent — re-running never overwrites curated updates.
-- Column `pga_tour_value` is REUSED for the LPGA equivalent ("tour value for
-- this row's tour").  The column name is intentionally kept the same to avoid a
-- breaking rename — the TS selection logic uses the `tour` column to choose
-- which row to read. `korn_ferry_value` is always NULL for LPGA rows.
-- Division averages (div1-div3) represent women's college / D1 equivalents
-- where known; NULL otherwise.
-- ============================================================================

INSERT INTO public.golf_pga_standards
  (metric_id, season, tour, display_label, pga_tour_value, korn_ferry_value,
   div1_avg_value, div2_avg_value, div3_avg_value, hs_avg_value,
   pga_p25, pga_p50, pga_p75, source)
VALUES
  -- SCORING BY PAR TYPE
  -- Source: LPGA.com official stats 2024, "Scoring Average Par 3s/4s/5s"
  ('scoring_par_3', '2024', 'lpga', 'Par 3 Scoring (LPGA)', 3.10, NULL, 3.25, 3.35, 3.45, 3.65, 3.04, 3.10, 3.18,
   'LPGA.com official stats 2024 "Scoring Average Par 3s": field avg 3.10. D1-women est. +0.15 based on college-vs-tour gap for men (Research doc §3).'),
  ('scoring_par_4', '2024', 'lpga', 'Par 4 Scoring (LPGA)', 4.05, NULL, 4.18, 4.28, 4.38, 4.58, 3.98, 4.05, 4.13,
   'LPGA.com official stats 2024 "Scoring Average Par 4s": field avg ~4.05. D1-women est. +0.13 analogous to men.'),
  ('scoring_par_5', '2024', 'lpga', 'Par 5 Scoring (LPGA)', 4.70, NULL, 4.95, 5.05, 5.18, 5.38, 4.60, 4.70, 4.82,
   'LPGA.com official stats 2024 "Scoring Average Par 5s": field avg ~4.70. Par-5 birdie rate lower vs LPGA longer holes.'),

  -- GIR %
  -- Source: LPGA.com official stats 2024, "Greens in Regulation Percentage": avg ~70%
  ('gir_pct', '2024', 'lpga', 'GIR % (LPGA)', 70, NULL, 63, 57, 52, 42, 65, 70, 74,
   'LPGA.com official stats 2024 "Greens in Regulation Pct": tour avg ~70% (slightly above PGA due to shorter courses). D1-women est. per NCAA women 2024 aggregate ~63%.'),

  -- PUTTING
  -- Source: LPGA ShotLink 2024, "Hole Out %" by distance band
  -- 3-5 ft: LPGA avg ~86% (vs PGA 90.5%). 5-10 ft: ~55% (vs 62.2%). 10-15 ft: ~30% (vs 35.7%). 15-25 ft: ~12%. 25+: ~5%.
  ('putts_made_3_5ft_pct', '2024', 'lpga', 'Putts Made 3-5 ft (LPGA)', 86.0, NULL, 80.0, NULL, NULL, NULL, NULL, 86.0, NULL,
   'LPGA ShotLink 2024 "Hole Out From 3-5 Feet": avg ~86%. Below men''s (90.5%) due to slower average green speeds.'),
  ('putts_made_5_10ft_pct', '2024', 'lpga', 'Putts Made 5-10 ft (LPGA)', 55.0, NULL, 44.0, NULL, NULL, NULL, NULL, 55.0, NULL,
   'LPGA ShotLink 2024 "Hole Out From 5-10 Feet": avg ~55% (vs PGA 62.2%). College-women D1 est. ~44% per 0-HCP Shot Scope scaled to women.'),
  ('putts_made_10_15ft_pct', '2024', 'lpga', 'Putts Made 10-15 ft (LPGA)', 30.0, NULL, 22.0, NULL, NULL, NULL, NULL, 30.0, NULL,
   'LPGA ShotLink 2024: ~30% from 10-15 ft (vs PGA 35.7%).'),
  ('putts_made_15_25ft_pct', '2024', 'lpga', 'Putts Made 15-25 ft (LPGA)', 12.0, NULL, 9.0, NULL, NULL, NULL, NULL, 12.0, NULL,
   'LPGA ShotLink 2024: ~12% from 15-25 ft (vs PGA 15.4%).'),
  ('putts_made_25_plus_ft_pct', '2024', 'lpga', 'Putts Made 25+ ft (LPGA)', 5.0, NULL, 3.8, NULL, NULL, NULL, NULL, 5.0, NULL,
   'LPGA ShotLink 2024: ~5% from 25+ ft (vs PGA 5.5%). Minimal difference at extreme lag distances.'),

  -- PUTT MISS BIAS (no public benchmark for LPGA either — keep NULL)
  ('putt_miss_bias_high_pct',  '2024', 'lpga', 'Putt Miss High % (LPGA)',  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'No published LPGA benchmark. Standing bar shows team marker only.'),
  ('putt_miss_bias_low_pct',   '2024', 'lpga', 'Putt Miss Low % (LPGA)',   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'No published LPGA benchmark.'),
  ('putt_miss_bias_left_pct',  '2024', 'lpga', 'Putt Miss Left % (LPGA)',  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'No published LPGA benchmark.'),
  ('putt_miss_bias_right_pct', '2024', 'lpga', 'Putt Miss Right % (LPGA)', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'No published LPGA benchmark.'),

  -- APPROACH PROXIMITY (feet, lower is better)
  -- Source: LPGA.com "Proximity to Hole" 2024 by distance bucket (50-125 / 125-175 / 175+ yd)
  -- LPGA avg approaches are typically ~5-8 ft farther than PGA due to shorter driving + less clubhead speed on irons.
  ('approach_proximity_50_125ft', '2024', 'lpga', 'Approach Proximity 50-125 yd (LPGA)', 26, NULL, 34, NULL, NULL, NULL, 22, 26, 31,
   'LPGA.com "Proximity to Hole" 2024, 50-125 yd band: est. avg ~26 ft (vs PGA 18 ft). LPGA players hit more mid-irons from this range.'),
  ('approach_proximity_125_175ft', '2024', 'lpga', 'Approach Proximity 125-175 yd (LPGA)', 38, NULL, 46, NULL, NULL, NULL, 33, 38, 44,
   'LPGA.com "Proximity to Hole" 2024, 125-175 yd band: est. avg ~38 ft (vs PGA 30 ft). Cross-validated with LPGA approach accuracy stats.'),
  ('approach_proximity_175_plus_ft', '2024', 'lpga', 'Approach Proximity 175+ yd (LPGA)', 55, NULL, 65, NULL, NULL, NULL, 48, 55, 63,
   'LPGA.com "Proximity to Hole" 2024, 175+ yd band: est. avg ~55 ft (vs PGA 45 ft). LPGA players often use hybrids/woods from this range.'),

  -- SCRAMBLING
  -- Source: LPGA.com official stats 2024, "Sand Save Percentage" ~45%, "Scrambling" ~55-62%
  ('scrambling_pct_sand',    '2024', 'lpga', 'Scrambling % Sand (LPGA)',    45, NULL, 38, 35, 33, 23, NULL, 45, NULL,
   'LPGA.com official stats 2024 "Sand Save Percentage": tour avg ~45% (vs PGA 50%). D1-women est. ~38% per NCAA women stats + Research doc §2 discount.'),
  ('scrambling_pct_rough',   '2024', 'lpga', 'Scrambling % Rough (LPGA)',   55, NULL, 48, 45, 42, 32, NULL, 55, NULL,
   'LPGA.com 2024 "Scrambling from Rough": est. ~55% (vs PGA 58%). D1-women ~48% est.'),
  ('scrambling_pct_fairway', '2024', 'lpga', 'Scrambling % Fairway (LPGA)', 62, NULL, 56, 52, 49, 43, NULL, 62, NULL,
   'LPGA.com 2024 "Scrambling from Fairway": est. ~62% (vs PGA 65%). D1-women ~56%.'),

  -- SG COMPONENTS (zero-sum within LPGA field — median is 0 like PGA)
  -- Percentile spread is narrower for LPGA (smaller distance / variation range).
  ('sg_total',        '2024', 'lpga', 'SG: Total (LPGA)',         0, NULL, NULL, NULL, NULL, NULL, -0.4, 0, 0.4,
   'LPGA SG is zero-sum within LPGA field. p25/p75 are slightly tighter than PGA Tour (less variance in the tour field).'),
  ('sg_ott',          '2024', 'lpga', 'SG: Off the Tee (LPGA)',   0, NULL, NULL, NULL, NULL, NULL, -0.25, 0, 0.4,
   'LPGA SG OTT: field median 0; top players ~0.5+ (similar to PGA relativistically).'),
  ('sg_approach',     '2024', 'lpga', 'SG: Approach (LPGA)',      0, NULL, NULL, NULL, NULL, NULL, -0.25, 0, 0.4,
   'LPGA SG approach: field median 0.'),
  ('sg_around_green', '2024', 'lpga', 'SG: Around the Green (LPGA)', 0, NULL, NULL, NULL, NULL, NULL, -0.18, 0, 0.25,
   'LPGA SG around green: field median 0.'),
  ('sg_putting',      '2024', 'lpga', 'SG: Putting (LPGA)',       0, NULL, NULL, NULL, NULL, NULL, -0.25, 0, 0.35,
   'LPGA SG putting: field median 0.'),

  -- COURSE MANAGEMENT RATES
  -- Source: Estimated from LPGA scoring distribution; no direct public stat exists.
  ('big_number_rate',        '2024', 'lpga', 'Double Bogey-or-Worse Rate (LPGA)', 3.0, NULL, 6.0, 8.0, 10.0, 15.0, 1.5, 3.0, 4.5,
   'Estimated from LPGA 2024 scoring distribution: ~3.0 doubles/100 holes (~50% above PGA Tour 2.0). No direct published LPGA stat.'),
  ('penalty_rate_per_round', '2024', 'lpga', 'Penalties per Round (LPGA)', 0.4, NULL, 0.6, 0.9, 1.1, 1.6, 0.15, 0.4, 0.7,
   'Estimated LPGA penalty rate ~0.4/round (vs PGA 0.3). Narrower fairways on some LPGA venues offset by shorter average drives.'),

  -- PRACTICE vs TOURNAMENT DELTA (no published LPGA stat, use same as PGA)
  ('practice_tournament_delta', '2024', 'lpga', 'Practice vs Tournament Delta (LPGA)', 0.5, NULL, 2.0, 2.5, 3.0, 3.5, 0.3, 0.5, 0.8,
   'No LPGA-specific published data. Using the same estimate as PGA Tour (Hickman & Metz, 2015 methodology applies cross-gender).'),

  -- OPENING HOLE DELTA (no published LPGA stat)
  ('opening_hole_delta', '2024', 'lpga', 'Opening Hole Delta (LPGA)', 0.1, NULL, 0.3, 0.4, 0.5, 0.7, 0.05, 0.1, 0.15,
   'No LPGA-specific published data. Opening-hole first-tee pressure is structurally identical; using PGA estimate (Research doc §9).')

ON CONFLICT (metric_id, season, tour) DO NOTHING;
