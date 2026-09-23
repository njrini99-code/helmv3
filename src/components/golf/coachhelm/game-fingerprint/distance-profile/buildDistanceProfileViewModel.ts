/**
 * ============================================================================
 * buildDistanceProfileViewModel — pure adapter for the A7 distance-profile
 * surface (addendum §13, slice 1).
 * ----------------------------------------------------------------------------
 * Takes A2's flat `MetricResult[]` (`computeDistanceProfile`) and groups it
 * into one section per band, one row per metric. Every row's `kind` is
 * copied directly from `MetricResult.status` — never inferred from
 * `value !== null` — so a consuming surface cannot accidentally render an
 * `insufficient` or `invalid` row as if it carried the same certainty as a
 * `supported` one. This file does no fetching, no Supabase, and no
 * formatting beyond label text; it is a plain function of its input,
 * unit-testable without mounting anything (mirrors `buildTriageViewModel.ts`'s
 * pure-adapter convention).
 * ========================================================================== */

import type {
  DistanceBand,
  DistanceProfileMetricId,
  MetricResult,
  MetricStatus,
} from '@/lib/coachhelm/v3/metrics/distance-profile';
import { BUCKET_LABEL } from '@/lib/coachhelm/v3/generators/approach-miss';

/** Canonical band display order — mirrors `distance-profile.ts`'s own
 *  internal `BANDS` array so the surface reads shortest-to-longest. */
const BAND_ORDER: readonly DistanceBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

/** Reuses `ApproachMissGenerator`'s own `BUCKET_LABEL` rather than a second,
 *  independent label map — a prior version of this map read the `ft` suffix
 *  on the `DistanceBand` enum literally ("175+ ft"), but the distance these
 *  bands bucket is always YARDS (`bucketApproachDistance` takes yards; see
 *  `approach-miss.ts`'s own module doc comment on the legacy suffix). Kept
 *  as a local alias so this file's own `BAND_LABELS` references don't all
 *  need renaming. */
const BAND_LABELS: Record<DistanceBand, string> = BUCKET_LABEL;

/** Canonical within-band row order. `approach_measured_contribution` goes
 *  last so it reads as "how much evidence backs the rows above," not as a
 *  headline number competing with the other four. */
const METRIC_ORDER: readonly DistanceProfileMetricId[] = [
  'approach_green_hit_rate',
  'approach_on_green_proximity_feet',
  'approach_direction_coverage',
  'approach_severe_outcome_rate',
  'approach_measured_contribution',
];

const METRIC_LABELS: Record<DistanceProfileMetricId, string> = {
  approach_green_hit_rate: 'Greens hit',
  approach_on_green_proximity_feet: 'Proximity when on the green',
  approach_direction_coverage: 'Miss-direction data coverage',
  approach_severe_outcome_rate: 'Severe-outcome rate',
  approach_measured_contribution: 'Measured attempts',
};

/**
 * One rendered row. `kind` is a direct copy of `MetricResult.status`,
 * renamed here only to make the call site unambiguous about which field a
 * surface must switch its rendering on. `row` is passed through whole so a
 * claim's drill-down (the Sheet) can be built directly from the SAME
 * `MetricResult` that produced the rendered number — no separate fetch, no
 * chance of the drill-down disagreeing with the tile.
 */
export interface DistanceProfileRowViewModel {
  metricId: DistanceProfileMetricId;
  label: string;
  kind: MetricStatus;
  row: MetricResult;
}

export interface DistanceProfileBandViewModel {
  band: DistanceBand;
  label: string;
  rows: DistanceProfileRowViewModel[];
}

function isDistanceBand(value: string): value is DistanceBand {
  return (BAND_ORDER as readonly string[]).includes(value);
}

function isDistanceProfileMetricId(value: string): value is DistanceProfileMetricId {
  return (METRIC_ORDER as readonly string[]).includes(value);
}

/**
 * Groups `computeDistanceProfile`'s flat result array by band, in canonical
 * band and metric order. A row whose `dimensions.band` or `metricId` this
 * builder doesn't recognize is dropped rather than guessed into a section —
 * an omission a test can catch is safer than a claim rendered under the
 * wrong band. A band with zero recognized rows is omitted entirely (an
 * empty section has nothing for `EmptyState`/`InsufficientData` to explain).
 */
export function buildDistanceProfileViewModel(
  results: readonly MetricResult[],
): DistanceProfileBandViewModel[] {
  const byBand = new Map<DistanceBand, Map<DistanceProfileMetricId, MetricResult>>();

  for (const result of results) {
    const band = result.dimensions.band;
    if (typeof band !== 'string' || !isDistanceBand(band)) continue;
    if (!isDistanceProfileMetricId(result.metricId)) continue;

    let byMetric = byBand.get(band);
    if (!byMetric) {
      byMetric = new Map();
      byBand.set(band, byMetric);
    }
    byMetric.set(result.metricId, result);
  }

  const sections: DistanceProfileBandViewModel[] = [];
  for (const band of BAND_ORDER) {
    const byMetric = byBand.get(band);
    if (!byMetric) continue;

    const rows: DistanceProfileRowViewModel[] = [];
    for (const metricId of METRIC_ORDER) {
      const row = byMetric.get(metricId);
      if (!row) continue;
      rows.push({ metricId, label: METRIC_LABELS[metricId], kind: row.status, row });
    }
    if (rows.length > 0) sections.push({ band, label: BAND_LABELS[band], rows });
  }

  return sections;
}
