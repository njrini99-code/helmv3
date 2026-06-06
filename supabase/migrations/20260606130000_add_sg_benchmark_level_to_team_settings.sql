-- FIX-1 (C1): golf_team_settings.sg_benchmark_level is select+upserted by the
-- settings UI (settings/page.tsx + FairwaySettingsGeneral.tsx) but the column
-- never existed -> every settings save 400s (PostgREST 42703 / undefined column).
-- Additive + idempotent. Default matches the code's `|| 'scratch'` fallback.
-- CHECK values mirror BenchmarkLevel in src/lib/golf/sg-benchmarks.ts.
ALTER TABLE golf_team_settings
  ADD COLUMN IF NOT EXISTS sg_benchmark_level text NOT NULL DEFAULT 'scratch'
  CHECK (sg_benchmark_level IN
    ('pga_tour','scratch','ncaa_d1','ncaa_d2','ncaa_d3','break_80','break_90','break_100'));
