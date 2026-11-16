-- Tour benchmarks name their source (SC-08, 20261115223000_golf_pga_standards_sources.sql).
-- golf_pga_standards gains source_url (https only) and as_of (required with a
-- source_url). Clubhouse grades a figure only against a row with a source_url;
-- a signed-in user reads both columns through the existing read policy.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

SELECT has_column('public', 'golf_pga_standards', 'source_url', 'golf_pga_standards has source_url');
SELECT col_type_is('public', 'golf_pga_standards', 'source_url', 'text', 'source_url is text');
SELECT has_column('public', 'golf_pga_standards', 'as_of', 'golf_pga_standards has as_of');
SELECT col_type_is('public', 'golf_pga_standards', 'as_of', 'date', 'as_of is a date');

INSERT INTO public.golf_pga_standards (metric_id, season, display_label, pga_tour_value, tour)
SELECT metric_id, '2099', 'SC-08 fixture', 66, 'pga' FROM public.golf_metrics WHERE metric_id = 'gir_pct';

SELECT throws_ok(
  $$UPDATE public.golf_pga_standards SET source_url = 'Research doc §2', as_of = DATE '2026-11-15' WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga'$$,
  '23514', NULL, 'a source that is not an https page is refused'
);
SELECT throws_ok(
  $$UPDATE public.golf_pga_standards SET source_url = 'https://www.pgatour.com/stats/detail/103' WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga'$$,
  '23514', NULL, 'a source with no as_of date is refused'
);
SELECT lives_ok(
  $$UPDATE public.golf_pga_standards SET source_url = 'https://www.pgatour.com/stats/detail/103', as_of = DATE '2026-11-15' WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga'$$,
  'an https page with the date it was read is kept'
);
SELECT lives_ok(
  $$UPDATE public.golf_pga_standards SET source_url = NULL, as_of = NULL WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga'$$,
  'an unsourced row stays allowed (it grades nothing in the app)'
);
UPDATE public.golf_pga_standards SET source_url = 'https://www.pgatour.com/stats/detail/103', as_of = DATE '2026-11-15'
WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SELECT is(
  (SELECT row(source_url, as_of)::text FROM public.golf_pga_standards WHERE metric_id = 'gir_pct' AND season = '2099' AND tour = 'pga'),
  row('https://www.pgatour.com/stats/detail/103'::text, DATE '2026-11-15')::text,
  'a signed-in user reads the source and its date'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
