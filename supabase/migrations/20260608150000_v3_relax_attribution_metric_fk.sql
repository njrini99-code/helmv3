-- Phase H / H1 — relax golf_insight_outcome_attribution.target_metric_id FK.
--
-- BACKGROUND
-- The v3 attribution cron (src/app/api/cron/v3/causality-attribute/route.ts)
-- writes target_metric_id = the RAW evidence.metric string of the insight it
-- attributes. That string is whatever the insight surface stamped — which
-- legitimately includes ATTRIBUTABLE ALIASES that are NOT canonical
-- golf_metrics rows:
--   * fairways_hit_pct  -> round_stats_cache_ratio (fairways_hit/fairways_total)
--   * score_to_par      -> golf_rounds.score_to_par
-- (see src/lib/coachhelm/v3/causality/metric-sources.ts METRIC_SOURCE_ALIASES).
--
-- The old FK target_metric_id -> golf_metrics(metric_id) rejected those rows
-- with SQLSTATE 23503, the cron silently re-bucketed the 23503 as
-- "unknown_metric", and the table stayed EMPTY (0 rows ever, verified
-- 2026-06-07 on prod qmnssrrolpinvwjjnufo).
--
-- We CANNOT fix this by seeding the aliases into golf_metrics: load.ts
-- validateMetricRegistry() compares the FULL golf_metrics id-set against the
-- TS METRIC_IDS (28 canonical) with NO active filter, so any extra row makes
-- CI parity FAIL.
--
-- INTEGRITY AFTER THIS MIGRATION is enforced at the application layer:
-- computeAttribution() only inserts a row after lookupMetricSource() resolves
-- a non-null, non-intentional-null source (attribute.ts). A garbage metric id
-- never reaches the insert. The insight_id FK to golf_coach_insights is kept —
-- that one IS a real integrity guarantee (the row must point at a live insight).
--
-- IDEMPOTENT: IF EXISTS guards a re-run / fresh DB where the FK was never
-- created.

ALTER TABLE public.golf_insight_outcome_attribution
  DROP CONSTRAINT IF EXISTS golf_insight_outcome_attribution_target_metric_id_fkey;

-- The read path (CoachHelm analytics + the per-coach weight EMA) aggregates
-- attribution rows by target_metric_id. Index it now that it is a free-text
-- column with no FK-backing index.
CREATE INDEX IF NOT EXISTS idx_golf_insight_outcome_attribution_metric
  ON public.golf_insight_outcome_attribution (target_metric_id);

COMMENT ON COLUMN public.golf_insight_outcome_attribution.target_metric_id IS
  'Canonical metric_id OR an attributable alias (e.g. fairways_hit_pct, '
  'score_to_par) resolved by lookupMetricSource(). Intentionally NOT FK-bound '
  'to golf_metrics — integrity is enforced in computeAttribution(). See '
  'migration 20260608150000.';

-- VERIFIED 2026-06-09 against prod (qmnssrrolpinvwjjnufo):
--   golf_insight_outcome_attribution_target_metric_id_fkey GONE; the
--   insight_id FK KEPT (contype='f' present); join index
--   idx_golf_insight_outcome_attribution_metric EXISTS. First attribution row
--   landed 2026-06-09 (written by the still-deployed PRE-Phase-H cron once this
--   FK stopped rejecting it — see docs/audits/COACHHELM_TO_95_AUDIT_2026-06-08.md
--   addendum on why that row is learning-poison until the branch deploys).
-- HISTORY: recorded as version 20260608093936 ('v3_relax_attribution_metric_fk')
--   — apply-time stamp from MCP apply_migration, NOT this filename. Do not
--   re-apply via db push.
-- ROLLBACK: DELETE alias-metric rows (target_metric_id NOT IN golf_metrics),
--   then ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (target_metric_id)
--   REFERENCES golf_metrics(metric_id). NOTE: the static lock test
--   (causality-attribution-fk.test.ts) intentionally fails on re-adding it.
