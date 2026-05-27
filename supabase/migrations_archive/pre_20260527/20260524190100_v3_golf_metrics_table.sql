-- v3 Wave 9 part 2 — golf_metrics table (schema only)
--
-- Real DB table backing the canonical metric registry. Functions as the
-- FK target for goals.metric_id, standing.metric_id, pga_standards.metric_id,
-- and genome dimension references. Per docs/v3-master-plan.md Part III
-- "Architecture": "golf_metrics real DB table with FK enforcement from
-- goals/standing/genome." Schema drift between TS metric registry and DB
-- was risk H in Part XXVI; this table closes it.
--
-- Seed of the 28 canonical metrics ships in the SEPARATE next migration
-- (20260524190200_v3_golf_metrics_seed.sql) per the backfill rule in
-- Part I: "Schema migration ships first, verified empty. Backfill ships
-- in a separate PR, verified populated. Never combined." Seed is data,
-- not schema.
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT to_regclass('public.golf_metrics')::text;
--   -> null (table does not exist; safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_metrics;
--   (Safe before seed migration runs and before any FK references land.
--   After W18 ships, the FK from golf_goals.metric_id will block this
--   drop without CASCADE — intentional.)

CREATE TABLE IF NOT EXISTS public.golf_metrics (
  metric_id          text        PRIMARY KEY,
  display_label      text        NOT NULL,
  unit               text        NOT NULL,
  direction          text        NOT NULL,
  category           text        NOT NULL,
  description        text,
  introduced_in_wave text        NOT NULL DEFAULT 'W9',
  active             boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT golf_metrics_unit_check
    CHECK (unit IN ('percent','strokes','yards','feet','count')),
  CONSTRAINT golf_metrics_direction_check
    CHECK (direction IN ('higher_better','lower_better')),
  CONSTRAINT golf_metrics_category_check
    CHECK (category IN ('sg','putting','approach','short_game','course_mgmt','scoring','pressure'))
);

CREATE INDEX IF NOT EXISTS idx_golf_metrics_active_category
  ON public.golf_metrics(category)
  WHERE active = true;

COMMENT ON TABLE public.golf_metrics IS
  'v3 canonical metric registry. Every metric the engine surfaces (in goals, standing, generators, genome) must have a row here. Schema-of-truth that the TS registry at src/lib/coachhelm/v3/metrics/registry.ts mirrors; CI check validates parity. Seeded with 28 metrics in the next migration.';

COMMENT ON COLUMN public.golf_metrics.metric_id IS
  'Stable canonical ID. Format: snake_case with underscore-separated buckets where applicable (e.g. putts_made_3_5ft_pct, scoring_par_4). Never rename — referenced from FK columns across the engine.';

COMMENT ON COLUMN public.golf_metrics.direction IS
  'higher_better: higher player value is better (make %, GIR %, SG). lower_better: lower value is better (penalty rate, scoring vs par, pressure delta).';

COMMENT ON COLUMN public.golf_metrics.active IS
  'False signals deprecated. Existing rows referencing inactive metrics stay valid; new goals/standing rows should not be written against inactive metrics. Drop via separate retire-wave migration.';

-- RLS: golf_metrics is reference data, world-readable to all authenticated users.
-- No write policy for authenticated; seeding + future updates run via service_role.
ALTER TABLE public.golf_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_metrics_authenticated_read ON public.golf_metrics;
CREATE POLICY golf_metrics_authenticated_read
  ON public.golf_metrics
  FOR SELECT
  TO authenticated
  USING (true);
