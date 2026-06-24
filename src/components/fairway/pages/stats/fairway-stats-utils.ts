import type { ReadoutDelta } from '@/components/fairway';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';
import type { LeakMapBucket } from '@/components/fairway';

export function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function formatSg(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'E';
  const fixed = Math.abs(value).toFixed(2);
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}

export function toChartBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({
    label: b.label,
    teamValue: b.team_value,
    pgaValue: b.pga_value,
    sampleN: b.sample_n,
  }));
}

export function toMetricDelta(delta: ReadoutDelta | undefined, goodWhenLower = false) {
  if (!delta) return undefined;
  const improved =
    delta.direction === 'flat'
      ? null
      : goodWhenLower
        ? delta.direction === 'down'
        : delta.direction === 'up';
  return {
    value: delta.value,
    direction:
      delta.direction === 'flat'
        ? ('neutral' as const)
        : improved
          ? ('up' as const)
          : ('down' as const),
    label: delta.caption,
  };
}

export function buildVitalDelta({
  current,
  previous,
  currentRounds,
  previousRounds,
  goodWhenLower = false,
  percent = false,
  digits = 1,
}: {
  current: number | null;
  previous: number | null;
  currentRounds: number;
  previousRounds: number;
  goodWhenLower?: boolean;
  percent?: boolean;
  digits?: number;
}): ReadoutDelta | undefined {
  const a = finite(current);
  const b = finite(previous);
  if (a === null || b === null || currentRounds <= 0 || previousRounds <= 0) return undefined;
  const change = a - b;
  const improved = goodWhenLower ? change < 0 : change > 0;
  const direction: ReadoutDelta['direction'] =
    change === 0 ? 'flat' : improved ? 'up' : 'down';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  const mag = Math.abs(change);
  const text = percent ? `${sign}${Math.round(mag)}%` : `${sign}${mag.toFixed(digits)}`;
  return {
    value: change,
    direction,
    format: () => text,
    caption: 'vs prev 30d',
  };
}

export function fmtPct(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)}%`;
}

export function fmtNum(value: number | null | undefined, digits = 1): string {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(digits);
}
