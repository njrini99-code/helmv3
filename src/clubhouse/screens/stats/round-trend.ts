import type { ChProfileRound } from '../../data/stats-player';
import { per18 } from '../../data/stats-filter';
import { formatSigned, formatToPar } from '../../lib/format';
import { earlyTag, rollingMean, sampleState, type SampleState } from '../../lib/stats-signal';

/** One round on the trend: oldest first, a value per 18 holes (a nine-hole round is doubled), null when the round has none. */
export interface TrendRound {
  id: string;
  /** The date as the page writes it ("Sep 23"). */
  label: string;
  course?: string;
  value: number | null;
  /** When it was played (epoch ms), so the chart spaces rounds by real time; absent, by index. */
  at?: number;
  /** To par per 18, for the score trend's par line and readout. */
  toPar?: number | null;
  holes: number;
}

export type TrendKind = 'score' | 'sg';

/** The rolling mean spans this many rounds and first shows at the third (decision Q8). */
export const MEAN_WINDOW = 5;
export const MEAN_START = 3;

/** A round with a figure counts toward the floors and the mean. */
export const withValue = (rounds: TrendRound[]) => rounds.filter((r) => r.value != null);

/** How sure the whole line is: scores show from 1 round and are early until 5; strokes gained shows from 3 and is early until 8. */
export function trendState(kind: TrendKind, rounds: TrendRound[]): SampleState {
  return sampleState(kind === 'score' ? 'score' : 'sgLong', withValue(rounds).length);
}

/**
 * The par the score trend draws its reference at: only when every round in view has a par and they are all the same (A8.11). A
 * mix of par-71 and par-72 courses has no one line that is par for all of them, so none is drawn.
 */
export function parLine(rounds: TrendRound[]): number | null {
  const pars = withValue(rounds).map((r) => (r.toPar == null ? null : (r.value as number) - r.toPar));
  if (!pars.length || pars.some((p) => p == null)) return null;
  return new Set(pars).size === 1 ? pars[0]! : null;
}

/** The trailing mean for each round (null before the third round with a figure). */
export function meanSeries(rounds: TrendRound[]): Array<number | null> {
  return rollingMean(
    rounds.map((r) => r.value),
    MEAN_WINDOW,
    MEAN_START,
  );
}

/** Three or so round ticks that cover [lo, hi]: a step of 0.5, 1, 2, 5 or 10 so the labels are plain numbers. */
export function niceTicks(lo: number, hi: number, want = 3): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const raw = span / want;
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => s >= raw) ?? 20;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

/** The decimals a tick label needs (A8.2): one when the ticks step by less than a whole stroke, so no two print alike. */
export function tickDigits(ticks: number[]): number {
  return ticks.length > 1 && ticks[1]! - ticks[0]! < 1 ? 1 : 0;
}

/** What the readout says for a round: "Sep 23 · Lonnie Poole GC · 73, +1 · 5-round average 74.2" or "... · +0.6 strokes gained". */
export function readTrendRound(kind: TrendKind, r: TrendRound, mean: number | null): string {
  const nine = r.holes === 9 ? ' (9 holes, doubled)' : '';
  if (r.value == null) return [r.label, r.course, 'No strokes gained logged'].filter(Boolean).join(' · ');
  const figure = kind === 'score' ? `${Math.round(r.value * 10) / 10}${r.toPar == null ? '' : `, ${formatToPar(Math.round(r.toPar))}`}` : `${formatSigned(r.value)} strokes gained`;
  const avg = mean == null ? null : `${MEAN_WINDOW}-round average ${kind === 'score' ? mean.toFixed(1) : formatSigned(mean)}`;
  return [r.label, r.course, figure + nine, avg].filter(Boolean).join(' · ');
}

/** The note that rests under the chart: what a dot and the line are, and the early tag while the line is thin. */
export function trendNote(kind: TrendKind, rounds: TrendRound[]): string {
  const n = withValue(rounds).length;
  const state = trendState(kind, rounds);
  const base = n >= MEAN_START ? `Each dot is a round. The line is the ${MEAN_WINDOW}-round average.` : 'Each dot is a round. The average line starts at the third.';
  return state === 'early' ? `${base} ${earlyTag(n)}.` : base;
}

/** A player's rounds (newest first, as the profile holds them) as the trend's rounds: oldest first, a value per 18 holes. */
export function trendRounds(rounds: ChProfileRound[], kind: TrendKind): TrendRound[] {
  return [...rounds].reverse().map((r) => ({
    id: r.id,
    label: r.date,
    course: r.course,
    ...(r.iso ? { at: Date.parse(r.iso) } : {}),
    value: kind === 'score' ? per18(r.score, r.holes) : r.sg == null ? null : per18(r.sg, r.holes),
    toPar: r.toPar == null ? null : per18(r.toPar, r.holes),
    holes: r.holes,
  }));
}
