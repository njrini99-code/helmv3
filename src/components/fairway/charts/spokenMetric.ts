import type { FormattedMetric } from '@/lib/golf/metrics/display-registry';

/**
 * The spoken value of a formatted metric without its registry label
 * ("minus 0.83, Early read"), for an instrument that names the row itself.
 */
export function spokenMetric(m: FormattedMetric): string {
  const prefix = `${m.label}, `;
  return m.ariaLabel.startsWith(prefix) ? m.ariaLabel.slice(prefix.length) : m.ariaLabel;
}

/** Geometry (CSS %), not a displayed number: 2-dp string. */
export const css2 = (n: number): string => String(Math.round(n * 100) / 100);
