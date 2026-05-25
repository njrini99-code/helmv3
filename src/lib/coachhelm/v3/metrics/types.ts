/**
 * v3 metric type system.
 *
 * Mirrors the CHECK constraints on `public.golf_metrics`:
 *   - unit       IN ('percent','strokes','yards','feet','count')
 *   - direction  IN ('higher_better','lower_better')
 *   - category   IN ('sg','putting','approach','short_game','course_mgmt','scoring','pressure')
 *
 * Changing these literal unions requires an enum-correcting migration in
 * the same PR.
 */

import type { MetricId } from './registry';

export type MetricUnit = 'percent' | 'strokes' | 'yards' | 'feet' | 'count';

export type MetricDirection = 'higher_better' | 'lower_better';

export type MetricCategory =
  | 'sg'
  | 'putting'
  | 'approach'
  | 'short_game'
  | 'course_mgmt'
  | 'scoring'
  | 'pressure';

/** A row from `public.golf_metrics`. */
export interface Metric {
  metric_id: MetricId;
  display_label: string;
  unit: MetricUnit;
  direction: MetricDirection;
  category: MetricCategory;
  description: string | null;
  introduced_in_wave: string;
  active: boolean;
}
