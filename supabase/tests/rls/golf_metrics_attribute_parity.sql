-- MR-1 / MR-3 (COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06 §10.19):
-- wire the metric-registry parity guard into the DB-connected CI lane and
-- compare ATTRIBUTES (unit / direction / category / display_label), not just
-- the id-set. load.ts validateMetricRegistry() (owned by the metrics loader
-- owner) only compared id-sets; extending it + invoking it from a CI script is
-- a noted cross-file dependency. This pgTAP suite is the DB-side guard: it runs
-- in the `supabase` CI job against a freshly-migrated local stack (which applies
-- 20260606010000_v3_golf_metrics_seed_reproducible.sql), so any attribute drift
-- between the seed and the canonical expectation fails the build.
--
-- The expected set below is the canonical 28-metric registry, mirroring
-- src/lib/coachhelm/v3/metrics/registry.ts + standing/metric-config.ts. Keep
-- this in lockstep with the seed migration (the TS static companion test,
-- metric-registry-attribute-parity.test.ts, guards the TS<->seed side).

BEGIN;
\ir _helpers.sql

SELECT plan(5);

-- Canonical expected attributes (id, label, unit, direction, category).
CREATE TEMP TABLE expected_metrics (
  metric_id     text PRIMARY KEY,
  display_label text NOT NULL,
  unit          text NOT NULL,
  direction     text NOT NULL,
  category      text NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_metrics VALUES
  ('sg_total',                    'SG: Total',                     'strokes', 'higher_better', 'sg'),
  ('sg_ott',                      'SG: Off the Tee',               'strokes', 'higher_better', 'sg'),
  ('sg_approach',                 'SG: Approach',                  'strokes', 'higher_better', 'sg'),
  ('sg_around_green',             'SG: Around the Green',          'strokes', 'higher_better', 'sg'),
  ('sg_putting',                  'SG: Putting',                   'strokes', 'higher_better', 'sg'),
  ('putts_made_3_5ft_pct',        'Putts Made 3-5 ft',             'percent', 'higher_better', 'putting'),
  ('putts_made_5_10ft_pct',       'Putts Made 5-10 ft',            'percent', 'higher_better', 'putting'),
  ('putts_made_10_15ft_pct',      'Putts Made 10-15 ft',           'percent', 'higher_better', 'putting'),
  ('putts_made_15_25ft_pct',      'Putts Made 15-25 ft',           'percent', 'higher_better', 'putting'),
  ('putts_made_25_plus_ft_pct',   'Putts Made 25+ ft',             'percent', 'higher_better', 'putting'),
  ('putt_miss_bias_high_pct',     'Putt Miss High %',              'percent', 'lower_better',  'putting'),
  ('putt_miss_bias_low_pct',      'Putt Miss Low %',               'percent', 'lower_better',  'putting'),
  ('putt_miss_bias_left_pct',     'Putt Miss Left %',              'percent', 'lower_better',  'putting'),
  ('putt_miss_bias_right_pct',    'Putt Miss Right %',             'percent', 'lower_better',  'putting'),
  ('approach_proximity_50_125ft',    'Approach Proximity 50-125 yd',  'feet', 'lower_better', 'approach'),
  ('approach_proximity_125_175ft',   'Approach Proximity 125-175 yd', 'feet', 'lower_better', 'approach'),
  ('approach_proximity_175_plus_ft', 'Approach Proximity 175+ yd',    'feet', 'lower_better', 'approach'),
  ('scrambling_pct_rough',        'Scrambling % Rough',            'percent', 'higher_better', 'short_game'),
  ('scrambling_pct_sand',         'Scrambling % Sand',             'percent', 'higher_better', 'short_game'),
  ('scrambling_pct_fairway',      'Scrambling % Fairway',          'percent', 'higher_better', 'short_game'),
  ('penalty_rate_per_round',      'Penalties per Round',           'count',   'lower_better',  'course_mgmt'),
  ('big_number_rate',             'Double Bogey-or-Worse Rate',    'percent', 'lower_better',  'course_mgmt'),
  ('scoring_par_3',               'Par 3 Scoring',                 'strokes', 'lower_better',  'scoring'),
  ('scoring_par_4',               'Par 4 Scoring',                 'strokes', 'lower_better',  'scoring'),
  ('scoring_par_5',               'Par 5 Scoring',                 'strokes', 'lower_better',  'scoring'),
  ('gir_pct',                     'GIR %',                         'percent', 'higher_better', 'approach'),
  ('practice_tournament_delta',   'Practice vs Tournament Delta',  'strokes', 'lower_better',  'pressure'),
  ('opening_hole_delta',          'Opening Hole Delta',            'strokes', 'lower_better',  'pressure');

-- 1. Exactly the canonical set of ids is seeded (no missing, no extra).
SELECT is(
  (SELECT count(*)::int FROM expected_metrics),
  28,
  'expected canonical metric count is 28'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_metrics m
   FULL OUTER JOIN expected_metrics e ON e.metric_id = m.metric_id
   WHERE m.metric_id IS NULL OR e.metric_id IS NULL),
  0,
  'golf_metrics id-set matches the canonical registry (no missing / no extra)'
);

-- 2. Every seeded row matches the expected unit + direction + category + label.
SELECT is(
  (SELECT count(*)::int
   FROM public.golf_metrics m
   JOIN expected_metrics e ON e.metric_id = m.metric_id
   WHERE m.unit          IS DISTINCT FROM e.unit
      OR m.direction     IS DISTINCT FROM e.direction
      OR m.category      IS DISTINCT FROM e.category
      OR m.display_label IS DISTINCT FROM e.display_label),
  0,
  'every golf_metrics row matches expected unit/direction/category/display_label'
);

-- 3. Polarity sanity — every SG metric is higher_better in the DB.
SELECT is(
  (SELECT count(*)::int FROM public.golf_metrics
   WHERE category = 'sg' AND direction <> 'higher_better'),
  0,
  'no SG metric is mis-seeded as lower_better'
);

-- 4. Enum-legality — units/directions/categories stay within the CHECK domains.
SELECT is(
  (SELECT count(*)::int FROM public.golf_metrics
   WHERE unit      NOT IN ('percent','strokes','yards','feet','count')
      OR direction NOT IN ('higher_better','lower_better')
      OR category  NOT IN ('sg','putting','approach','short_game','course_mgmt','scoring','pressure')),
  0,
  'every golf_metrics row uses a legal unit/direction/category value'
);

SELECT * FROM finish();
ROLLBACK;
