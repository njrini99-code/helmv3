// logic.ts — pure, unit-tested helpers
import type { FilmstripHole } from './types';

export const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

/** rank 1..of → ramp band 4..1 (darker = stronger). of<=1 → 4. */
export function rampBandForRank(rank: number, of: number): 1 | 2 | 3 | 4 {
  if (of <= 1) return 4;
  const q = (rank - 1) / (of - 1);          // 0 best … 1 worst
  if (q <= 0.2) return 4;
  if (q <= 0.45) return 3;
  if (q <= 0.75) return 2;
  return 1;
}

/** value vs thresholds [t1,t2,t3] ascending → band 1..4 (>=t3 → 4); null/NaN → 0 */
export function rampBandForValue(value: number | null, t: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (value === null || Number.isNaN(value)) return 0;
  if (value >= t[2]) return 4;
  if (value >= t[1]) return 3;
  if (value >= t[0]) return 2;
  return 1;
}

/** round delta vs par → 0..5 green dots (5 = career day) */
export function gradeDotsForDelta(delta: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (delta <= -3) return 5;
  if (delta <= 0) return 4;
  if (delta <= 4) return 3;
  if (delta <= 9) return 2;
  if (delta <= 14) return 1;
  return 0;
}
export const gradeLabel = (s: number): string =>
  ['Rough day', 'Rough day', 'Grinding', 'Solid', 'Sharp', 'Career day'][s] ?? 'Solid';

/** filmstrip bar geometry+tone. height in px within a 108px strip. */
export function holeBar(h: FilmstripHole): { heightPx: number; tone: 'par' | 'birdie' | 'bogey' | 'double' } {
  const d = h.score - h.par;
  const tone = d < 0 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
  const heightPx = d === 0 ? 10 : Math.min(Math.abs(d) * 26 + 10, 88);
  return { heightPx, tone };
}

/** legacy stats ?tab= → new ?area= */
export function mapLegacyStatsTab(tab: string | undefined): string | null {
  if (!tab) return null;
  const map: Record<string, string> = {
    scoring: 'scoring', driving: 'driving', approach: 'approach', putting: 'putting',
    scrambling: 'short-game', 'strokes-gained': 'standing', analysis: 'standing',
  };
  return map[tab] ?? null;
}
