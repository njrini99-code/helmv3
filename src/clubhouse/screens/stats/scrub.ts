import { formatToPar } from '../../lib/format';

/**
 * The round a pointer is over: the nearest of `count` equal columns across `width`, from `left`. A pointer past either end
 * snaps to the first or last round, so a drag that leaves the chart's edge still reads a round.
 */
export function nearestIndex(x: number, left: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (width <= 0) return 0;
  const i = Math.floor(((x - left) / width) * count);
  return Math.max(0, Math.min(count - 1, i));
}

/** An arrow key's target: left and right step one round and stop at the ends, Home and End jump to the first and last. */
export function stepIndex(current: number | null, key: string, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  // From nothing selected, either arrow lands on the newest round, where the eye already is.
  if (current == null) return key === 'ArrowLeft' || key === 'ArrowRight' ? last : null;
  if (key === 'ArrowLeft') return Math.max(0, current - 1);
  if (key === 'ArrowRight') return Math.min(last, current + 1);
  return null;
}

/** One round in a line: "Sep 23 · Lonnie Poole GC · 73, +1" (the course and to par left out when the round has none). */
export function readRound(r: { label: string; course?: string; score: number; toPar: number | null; holes: number }): string {
  const parts = [r.label, r.course, `${r.score}${r.toPar == null ? '' : `, ${formatToPar(r.toPar)}`}`];
  return parts.filter(Boolean).join(' · ') + (r.holes === 9 ? ' (9 holes, doubled)' : '');
}
