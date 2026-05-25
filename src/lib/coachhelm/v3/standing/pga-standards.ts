/**
 * v3 PGA standards loader.
 *
 * Reads from `public.golf_pga_standards` — the per-(metric, season)
 * baseline table seeded in W10. Used by:
 *   - W11 standing loader (`loadStandingForMetric`) to populate the
 *     "PGA Tour" reference line in StandingBar.
 *   - W17 counterfactual (`computeCounterfactual`) to compute the
 *     projected-score-if-closed delta.
 *
 * Always loads the most recent season available per metric (ORDER BY
 * season DESC); historical seasons stay in the table for backtesting.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';

import { isMetricId, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export type CohortTier = 'pga' | 'korn_ferry' | 'd1' | 'd2' | 'd3' | 'hs';

/** Shape of a row in `public.golf_pga_standards`. */
export interface PgaStandard {
  metric_id: MetricId;
  season: string;
  display_label: string;
  pga_tour_value: number | null;
  korn_ferry_value: number | null;
  div1_avg_value: number | null;
  div2_avg_value: number | null;
  div3_avg_value: number | null;
  hs_avg_value: number | null;
  pga_p25: number | null;
  pga_p50: number | null;
  pga_p75: number | null;
  source: string | null;
}

interface RawRow {
  metric_id: string;
  season: string;
  display_label: string;
  pga_tour_value: number | null;
  korn_ferry_value: number | null;
  div1_avg_value: number | null;
  div2_avg_value: number | null;
  div3_avg_value: number | null;
  hs_avg_value: number | null;
  pga_p25: number | null;
  pga_p50: number | null;
  pga_p75: number | null;
  source: string | null;
}

const SELECT_FIELDS =
  'metric_id, season, display_label, pga_tour_value, korn_ferry_value, ' +
  'div1_avg_value, div2_avg_value, div3_avg_value, hs_avg_value, ' +
  'pga_p25, pga_p50, pga_p75, source';

/**
 * Load every PGA standard for the most recent season available per
 * metric. Returns a Map keyed by metric_id.
 *
 * Uses the admin client because golf_pga_standards is reference data
 * read by cron jobs (W11 standing-refresh) outside of any user session.
 */
export async function loadPgaStandards(): Promise<Map<MetricId, PgaStandard>> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_pga_standards')
    .select(SELECT_FIELDS)
    .order('season', { ascending: false }) as {
    data: RawRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to load golf_pga_standards: ${error.message}`);
  }

  const map = new Map<MetricId, PgaStandard>();
  for (const row of data ?? []) {
    if (!isMetricId(row.metric_id)) continue;
    // First (most recent) row per metric wins; ignore older seasons.
    if (map.has(row.metric_id)) continue;
    map.set(row.metric_id, row as PgaStandard);
  }
  return map;
}

/** Look up a single metric's baseline. Returns null if unknown. */
export async function loadPgaStandard(
  metricId: MetricId,
): Promise<PgaStandard | null> {
  const all = await loadPgaStandards();
  return all.get(metricId) ?? null;
}

/**
 * Pick the canonical "Tour reference value" for a metric, falling back
 * across columns in priority order:
 *   pga_tour_value > pga_p50 > null
 *
 * Use this to populate the right-most marker in a StandingBar. Returns
 * null when no reference exists (StandingBar then omits the PGA marker).
 */
export function pgaReferenceValue(standard: PgaStandard): number | null {
  if (standard.pga_tour_value !== null) return standard.pga_tour_value;
  if (standard.pga_p50 !== null) return standard.pga_p50;
  return null;
}

/**
 * Pick the cohort baseline for a player given their team's division.
 * Falls back to PGA Tour value when the division-specific value is null.
 *
 * Used by W17 counterfactual so a D3 player's "close the gap" target is
 * realistic (D3 avg, not Tour) when D3 data exists; degrades to PGA when
 * we don't have D3 numbers for that metric.
 */
export function cohortBaselineValue(
  standard: PgaStandard,
  tier: CohortTier,
): number | null {
  switch (tier) {
    case 'pga':         return standard.pga_tour_value;
    case 'korn_ferry':  return standard.korn_ferry_value;
    case 'd1':          return standard.div1_avg_value;
    case 'd2':          return standard.div2_avg_value;
    case 'd3':          return standard.div3_avg_value;
    case 'hs':          return standard.hs_avg_value;
    default:            return null;
  }
}
