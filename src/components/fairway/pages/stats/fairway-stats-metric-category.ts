import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_IDS, isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { MetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

export const STANDING_CATEGORY_ORDER: ReadonlyArray<{
  category: string;
  label: string;
  description: string;
}> = [
  { category: 'sg', label: 'Strokes Gained', description: 'Per-round vs Tour and your team.' },
  { category: 'putting', label: 'Putting', description: 'Make rate by distance and miss patterns.' },
  { category: 'approach', label: 'Approach', description: 'Proximity and greens in regulation.' },
  { category: 'short_game', label: 'Short Game', description: 'Scrambling by lie type.' },
  { category: 'scoring', label: 'Scoring', description: 'Per-par scoring vs Tour.' },
  { category: 'course_mgmt', label: 'Course Mgmt', description: 'Penalties and big numbers.' },
  { category: 'pressure', label: 'Pressure', description: 'Tournament vs practice and opening holes.' },
];

export function metricCategory(metricId: string): string {
  if (metricId.startsWith('sg_')) return 'sg';
  if (metricId.startsWith('putts_made_') || metricId.startsWith('putt_miss_bias_')) return 'putting';
  if (metricId.startsWith('approach_') || metricId === 'gir_pct') return 'approach';
  if (metricId.startsWith('scrambling_')) return 'short_game';
  if (metricId.startsWith('scoring_par_')) return 'scoring';
  if (metricId === 'penalty_rate_per_round' || metricId === 'big_number_rate') return 'course_mgmt';
  if (metricId === 'practice_tournament_delta' || metricId === 'opening_hole_delta') return 'pressure';
  return 'sg';
}

export interface StandingMatrixRow {
  id: MetricId;
  standing: PlayerStandingRow;
  cfg: MetricRenderConfig;
}

export function groupStandingRows(rows: PlayerStandingRow[] | null): Map<string, StandingMatrixRow[]> {
  const byCategory = new Map<string, StandingMatrixRow[]>();
  const rowById = new Map<string, PlayerStandingRow>();
  for (const row of rows ?? []) rowById.set(row.metric_id, row);

  for (const id of METRIC_IDS) {
    if (!isMetricId(id)) continue;
    const standing = rowById.get(id);
    if (!standing) continue;
    const cfg = METRIC_RENDER_CONFIG[id];
    const cat = metricCategory(id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ id, standing, cfg });
  }
  return byCategory;
}
