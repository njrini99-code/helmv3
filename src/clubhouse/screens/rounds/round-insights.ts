import type { ChReviewHole, ChReviewShot, ChRoundReview } from '../../data/round-review-shape';
import { formatSigned } from '../../lib/format';
import { plural } from '../../lib/plural';

/**
 * P011: what a round's holes and shots say, worked out once here so the review's pictures and its headline read the same
 * numbers. Everything is derived from the review; a figure the round has no data for is null, never zero.
 */

export type HoleResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

export function resultOf(score: number, par: number): HoleResult {
  const d = score - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}

export interface FlowPoint {
  n: number;
  par: number;
  score: number;
  /** Strokes to par on this hole. */
  delta: number;
  /** Strokes to par after this hole. */
  cum: number;
  result: HoleResult;
}

/** The running score to par, hole by hole; holes with no score or par are left out (the line has a gap there). */
export function flow(holes: ChReviewHole[]): FlowPoint[] {
  let cum = 0;
  const out: FlowPoint[] = [];
  for (const h of holes) {
    if (h.score == null || h.par == null) continue;
    const delta = h.score - h.par;
    cum += delta;
    out.push({ n: h.n, par: h.par, score: h.score, delta, cum, result: resultOf(h.score, h.par) });
  }
  return out;
}

/** The holes that cost the most strokes against par, worst first (ties by hole number); only holes over par. */
export function costliest(holes: ChReviewHole[], k = 3): FlowPoint[] {
  return flow(holes)
    .filter((p) => p.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.n - b.n)
    .slice(0, k);
}

/** Average strokes to par on par 3s, 4s and 5s; a par with no scored hole is null. */
export function parSplit(holes: ChReviewHole[]): Array<{ par: 3 | 4 | 5; holes: number; avg: number | null }> {
  return ([3, 4, 5] as const).map((par) => {
    const hs = holes.filter((h) => h.par === par && h.score != null);
    return { par, holes: hs.length, avg: hs.length ? hs.reduce((a, h) => a + ((h.score as number) - par), 0) / hs.length : null };
  });
}

/** One, two and three-or-more putt holes; null when no hole has its putts. */
export function puttSplit(holes: ChReviewHole[]): { one: number; two: number; three: number; holes: number; perHole: number } | null {
  const hs = holes.filter((h) => h.putts != null);
  if (!hs.length) return null;
  const total = hs.reduce((a, h) => a + (h.putts as number), 0);
  return {
    one: hs.filter((h) => (h.putts as number) <= 1).length,
    two: hs.filter((h) => h.putts === 2).length,
    three: hs.filter((h) => (h.putts as number) >= 3).length,
    holes: hs.length,
    perHole: total / hs.length,
  };
}

/** "518 yds" is 518 yards and "24 ft" is 8; anything else is null. */
export function yardsOf(s: string | null): number | null {
  if (!s) return null;
  const m = /^([\d.,]+)\s*(yds|ft)$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  return m[2] === 'ft' ? v / 3 : v;
}

export const feetOf = (s: string | null): number | null => {
  const y = s?.trim().endsWith('ft') ? yardsOf(s) : null;
  return y == null ? null : Math.round(y * 3);
};

/** Each hole's first putt: its length in feet and whether it dropped (the hole took one putt). */
export function firstPutts(holes: ChReviewHole[]): Array<{ hole: number; feet: number; made: boolean }> {
  const out: Array<{ hole: number; feet: number; made: boolean }> = [];
  for (const h of holes) {
    const p = h.shots.find((s) => s.kind === 'Putt' && !s.penalty);
    const feet = p ? feetOf(p.from) : null;
    if (p && feet != null) out.push({ hole: h.n, feet, made: h.putts != null ? h.putts <= 1 : p.lie === 'hole' });
  }
  return out;
}

export const PUTT_BANDS = [
  { label: 'Inside 6 ft', lo: 0, hi: 6 },
  { label: '6 to 15 ft', lo: 6, hi: 15 },
  { label: '15 ft and out', lo: 15, hi: Infinity },
] as const;

/** First putts by length band: attempts and makes. */
export function puttBands(holes: ChReviewHole[]): Array<{ label: string; attempts: number; made: number }> {
  const all = firstPutts(holes);
  return PUTT_BANDS.map((b) => {
    const hs = all.filter((p) => p.feet >= b.lo && p.feet < b.hi);
    return { label: b.label, attempts: hs.length, made: hs.filter((p) => p.made).length };
  });
}

/** Where approach shots that found the green finished: the average and the closest, in feet. */
export function approachFinish(holes: ChReviewHole[]): { n: number; avg: number; best: number; hole: number } | null {
  const finishes: Array<{ ft: number; hole: number }> = [];
  for (const h of holes)
    for (const s of h.shots) {
      if (s.kind !== 'Approach' || s.lie !== 'green') continue;
      const ft = feetOf(s.to);
      if (ft != null) finishes.push({ ft, hole: h.n });
    }
  if (!finishes.length) return null;
  const best = finishes.reduce((a, b) => (b.ft < a.ft ? b : a));
  return { n: finishes.length, avg: finishes.reduce((a, b) => a + b.ft, 0) / finishes.length, best: best.ft, hole: best.hole };
}

/** Which side tee shots that missed the fairway went, from the shots' own miss words. */
export function teeMisses(holes: ChReviewHole[]): { left: number; right: number; other: number } {
  const out = { left: 0, right: 0, other: 0 };
  for (const h of holes) {
    if (h.fairway !== false) continue;
    const tee = h.shots.find((s) => s.kind === 'Tee');
    if (!tee) continue;
    if (tee.miss?.includes('left')) out.left += 1;
    else if (tee.miss?.includes('right')) out.right += 1;
    else out.other += 1;
  }
  return out;
}

export interface TrailStep {
  n: number;
  kind: string;
  lie: ChReviewShot['lie'];
  penalty: boolean;
  /** How far along the hole the shot started and finished, 0 at the tee and 1 at the pin. */
  from: number;
  to: number;
  /** What was left after the shot, as the shot says it. */
  left: string | null;
}

/**
 * A hole's shots along its length: each full shot as a start and an end between the tee and the pin. Putts are not placed
 * (they all sit at the pin); they are counted instead. Null when the hole has no length or no shot with its distances.
 */
export function trail(hole: ChReviewHole): { steps: TrailStep[]; putts: number; firstPutt: number | null } | null {
  const total = hole.yards ?? yardsOf(hole.shots[0]?.from ?? null);
  if (!total || total <= 0) return null;
  const at = (remaining: number) => Math.max(0, Math.min(1, 1 - remaining / total));
  const steps: TrailStep[] = [];
  let cursor = 0;
  for (const s of hole.shots) {
    if (s.kind === 'Putt') continue;
    if (s.penalty) {
      steps.push({ n: s.n, kind: s.kind, lie: s.lie, penalty: true, from: cursor, to: cursor, left: null });
      continue;
    }
    const start = yardsOf(s.from);
    const end = s.lie === 'hole' ? 0 : yardsOf(s.to);
    if (end == null) continue;
    const from = start == null ? cursor : at(start);
    const to = at(end);
    steps.push({ n: s.n, kind: s.kind, lie: s.lie, penalty: false, from, to, left: s.to });
    cursor = to;
  }
  if (!steps.some((s) => !s.penalty)) return null;
  const putts = hole.shots.filter((s) => s.kind === 'Putt').length;
  const first = hole.shots.find((s) => s.kind === 'Putt');
  return { steps, putts: putts || (hole.putts ?? 0), firstPutt: first ? feetOf(first.from) : null };
}

/** One line on what the round was: the legs that carried it and cost it, else the holes. */
export function headline(r: ChRoundReview): string | null {
  const points = flow(r.holes);
  const parts: string[] = [];
  const sg = r.strokesGained;
  if (sg) {
    const legs = (
      [
        ['Off the tee', sg.tee],
        ['Approach', sg.approach],
        ['Around the green', sg.around],
        ['Putting', sg.putting],
      ] as Array<[string, number | null]>
    ).filter((l): l is [string, number] => l[1] != null);
    if (legs.length >= 2) {
      const best = legs.reduce((a, b) => (b[1] > a[1] ? b : a));
      const worst = legs.reduce((a, b) => (b[1] < a[1] ? b : a));
      if (best[1] > 0) parts.push(`${best[0]} gained ${formatSigned(best[1])}`);
      if (worst[1] < 0) parts.push(`${worst[0].toLowerCase()} gave back ${Math.abs(worst[1]).toFixed(1)}`);
    }
  }
  if (!parts.length && points.length) {
    const b = points.filter((p) => p.delta < 0).length;
    const d = points.filter((p) => p.delta >= 2).length;
    parts.push(`${plural(b, 'birdie')}`, d ? `${plural(d, 'double or worse', 'doubles or worse')}` : 'no double or worse');
  }
  if (!parts.length) return null;
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}
