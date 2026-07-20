/**
 * Pure helpers for the Weekly Pulse KPI trend strip
 * (../WeeklyPulse.tsx). No React, no fetching — just derivation over the
 * `WeeklyKpiRow[]` returned by getWeeklyKpis(), so these are unit-testable
 * without mounting anything.
 */

import type { WeeklyKpiRow } from '@/app/golf/actions/crm-kpis';

/** The numeric metric columns of a WeeklyKpiRow (everything but the date). */
export type WeeklyKpiMetricKey = Exclude<keyof WeeklyKpiRow, 'week_start'>;

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface WeeklyKpiDelta {
  current: number;
  previous: number;
  direction: DeltaDirection;
}

/**
 * Compares the LAST row (current week, partial — still accumulating) against
 * the second-to-last row (last full week) for a given metric.
 *
 * - 0 rows: current = previous = 0, direction 'flat'.
 * - 1 row: previous defaults to 0 (nothing to compare against yet), so a
 *   nonzero current week reads as "up" rather than falsely "flat".
 */
export function deltaFor(rows: WeeklyKpiRow[], key: WeeklyKpiMetricKey): WeeklyKpiDelta {
  const currentRow = rows[rows.length - 1];
  const previousRow = rows.length >= 2 ? rows[rows.length - 2] : undefined;

  const current = currentRow ? currentRow[key] : 0;
  const previous = previousRow ? previousRow[key] : 0;

  const direction: DeltaDirection = current > previous ? 'up' : current < previous ? 'down' : 'flat';

  return { current, previous, direction };
}

/**
 * Builds an SVG `points` attribute string plotting `key` across `rows`,
 * normalized to fill [0, width] x [0, height] (y flipped so larger values
 * sit higher). Guards divide-by-zero when every value in the series is
 * equal (flat line rendered at vertical center) and when there are 0 or 1
 * points (single point centered horizontally).
 */
export function sparkPoints(
  rows: WeeklyKpiRow[],
  key: WeeklyKpiMetricKey,
  width: number,
  height: number,
): string {
  if (rows.length === 0) return '';

  const values = rows.map((row) => row[key]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const n = values.length;
  const stepX = n > 1 ? width / (n - 1) : 0;

  return values
    .map((value, i) => {
      const x = n > 1 ? i * stepX : width / 2;
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
