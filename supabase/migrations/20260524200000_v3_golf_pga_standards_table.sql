-- v3 Wave 10 part 1 — golf_pga_standards table (schema only)
--
-- Stores per-(metric, season) baseline values across professional and
-- amateur cohorts. Every standing bar (W11+) reads from this table to
-- render the "PGA Tour" reference line. Every counterfactual (W17) reads
-- the pga_tour_value to compute the projected-score-if-closed delta.
--
-- Schema mirrors master plan Part VII.1. Composite PK (metric_id, season)
-- so a single metric can hold multiple historical season baselines.
--
-- Seeding lands in the NEXT migration (20260524200100_v3_golf_pga_standards_seed.sql)
-- per the backfill rule in Part I: "Schema migration ships first,
-- verified empty. Backfill ships in a separate PR/migration, verified
-- populated. Never combined."
--
-- Source citations for every seeded value trace back to
-- docs/v3-research-golf-domain.md (Part 2 PGA baselines, Part 3 college
-- baselines, Tour ShotLink data via Broadie/Dethier).
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT to_regclass('public.golf_pga_standards')::text;
--   -> null (table does not exist; safe to create)
--
--   FK target golf_metrics is created in W9-pt2 migration
--   20260524190100_v3_golf_metrics_table.sql (idempotent dry-run of the
--   W9-pt2 + W10 chain verified the FK resolves; see PR description).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_pga_standards;
--   (Safe before seed migration. After W11 ships, no FKs target this
--   table — golf_player_standing only stores a snapshot of pga_value,
--   it doesn't FK back here.)

CREATE TABLE IF NOT EXISTS public.golf_pga_standards (
  metric_id          text        NOT NULL REFERENCES public.golf_metrics(metric_id) ON DELETE RESTRICT,
  season             text        NOT NULL,
  display_label      text        NOT NULL,

  -- Professional cohorts
  pga_tour_value     numeric,
  korn_ferry_value   numeric,

  -- College cohorts
  div1_avg_value     numeric,
  div2_avg_value     numeric,
  div3_avg_value     numeric,

  -- Junior / high-school cohort
  hs_avg_value       numeric,

  -- PGA Tour distributional reference
  pga_p25            numeric,
  pga_p50            numeric,
  pga_p75            numeric,

  source             text,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (metric_id, season)
);

COMMENT ON TABLE public.golf_pga_standards IS
  'v3 baseline registry. Per (metric_id, season) values for each cohort tier — Tour, Korn Ferry, D1/D2/D3, HS — plus Tour distributional percentiles. Read by standing bars (W11+) and counterfactuals (W17). FK to golf_metrics enforces TS<->DB parity.';

COMMENT ON COLUMN public.golf_pga_standards.season IS
  'Season identifier — typically "2024" for Tour data. Allows historical baselines to coexist; standing surfaces always select the most recent season available.';

COMMENT ON COLUMN public.golf_pga_standards.pga_p50 IS
  'PGA Tour median (50th percentile). Used as the "Tour average" reference line when pga_tour_value is null OR when the metric is zero-sum (SG cluster).';

COMMENT ON COLUMN public.golf_pga_standards.source IS
  'Free-text citation pointing into docs/v3-research-golf-domain.md or the source URL. Required per master plan Part V — every causal claim and PGA baseline must trace back to a source.';

CREATE INDEX IF NOT EXISTS idx_pga_standards_metric
  ON public.golf_pga_standards(metric_id, season DESC);

-- RLS: reference data, world-readable to authenticated users. No write
-- policy for authenticated; seed + future updates run via service_role.
ALTER TABLE public.golf_pga_standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_pga_standards_authenticated_read ON public.golf_pga_standards;
CREATE POLICY golf_pga_standards_authenticated_read
  ON public.golf_pga_standards
  FOR SELECT
  TO authenticated
  USING (true);
