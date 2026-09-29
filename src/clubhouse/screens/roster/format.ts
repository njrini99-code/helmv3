import { MINUS, NO_DATA } from '../../lib/format';

/** Handicap index: a plus handicap (better than scratch) is written +0.8. */
export function formatHcp(v: number | null): string {
  if (v == null) return NO_DATA;
  if (v < 0) return `+${Math.abs(v).toFixed(1)}`;
  return v.toFixed(1);
}

export { MINUS };
