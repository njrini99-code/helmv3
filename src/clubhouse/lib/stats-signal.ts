/**
 * How sure a stat is, said once for every chart. Pure functions, no React: floors, standard errors, the tone of a change,
 * the Wilson interval of a make rate, a trailing mean, and a ranking that ties players who can't be told apart.
 *
 * Why these numbers: production's within-player spread is about 3.8 strokes gained and 3.6 strokes of score a round, so a
 * single round moves a player as much as the gap between two players. A change is only worth a color once it is larger than
 * its own standard error (docs in project files: stats-visuals/decisions.md, Q3 and Q4).
 */

/** Production's within-player standard deviation of a round (players with five or more rounds): the fallback while a player has too few rounds to measure their own. */
export const POOLED_SD = { sg: 3.8, score: 3.6 } as const;

/** Rounds in each window a player needs before their own spread replaces the pooled one. */
export const OWN_SD_MIN_ROUNDS = 5;

/** A spread under this is not a measurement: no player's rounds repeat to a twentieth of a stroke. */
const MIN_OWN_SD = 0.05;

/**
 * Floors per stat: `show` is where a value first appears, `early` is where it stops being an early read. Under `show` the
 * chart says what it needs; between the two it is drawn muted (hollow, no semantic color) with a tag; from `early` it is plain.
 */
export const FLOORS = {
  score: { show: 1, early: 5, unit: 'round' },
  sgLong: { show: 3, early: 8, unit: 'round' },
  sgShort: { show: 5, early: 15, unit: 'round' },
  fraction: { show: 2, early: 5, unit: 'round' },
  make: { show: 10, early: 30, unit: 'putt' },
  proximity: { show: 8, early: 25, unit: 'shot' },
  scramble: { show: 10, early: 30, unit: 'chance' },
  miss: { show: 20, early: 50, unit: 'shot' },
} as const;

export type FloorKind = keyof typeof FLOORS;

/** `none`: too few to show. `early`: shown muted with a tag. `steady`: shown plain. */
export type SampleState = 'none' | 'early' | 'steady';

export function sampleState(kind: FloorKind, n: number | null | undefined): SampleState {
  const f = FLOORS[kind];
  if (n == null || Number.isNaN(n) || n < f.show) return 'none';
  return n < f.early ? 'early' : 'steady';
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The tag on a muted value: "Early read · 6 rounds". */
export function earlyTag(n: number): string {
  return `Early read · ${plural(Math.round(n), 'round')}`;
}

/** What a stat under its show floor needs: "Needs 5 rounds" (the unit follows the stat's own: rounds, putts, shots, chances). */
export function needsText(kind: FloorKind): string {
  const f = FLOORS[kind];
  return `Needs ${plural(f.show, f.unit)}`;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Sample standard deviation (n − 1); null under two values. */
export function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ss = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/** Standard error of a mean of `n` rounds with spread `sd`; null when either is missing. */
export function standardError(sd: number | null | undefined, n: number): number | null {
  if (sd == null || !(n > 0)) return null;
  return sd / Math.sqrt(n);
}

/**
 * The spread to trust for a player's window: their own once they have enough rounds, else the pooled one for that kind of
 * figure. `values` are the window's round values for the stat (per 18 holes).
 */
export function spreadFor(values: number[], kind: keyof typeof POOLED_SD): number {
  const own = values.length >= OWN_SD_MIN_ROUNDS ? sampleSd(values) : null;
  // Five identical values have no spread to measure (a coincidence of the sample, not certainty), and rounding noise can leave a sliver: fall back.
  return own != null && own > MIN_OWN_SD ? own : POOLED_SD[kind];
}

/** Standard error of the difference of two independent means. */
export function diffSe(seA: number | null, seB: number | null): number | null {
  if (seA == null || seB == null) return null;
  return Math.sqrt(seA ** 2 + seB ** 2);
}

export type DeltaTone = '' | 'is-gain' | 'is-loss';

/**
 * The tone of a change: green or amber only when it is larger than one standard error of the difference, else none (the
 * signed number is still shown, in neutral ink, with "No clear change"). With no standard error to judge by, no tone: an
 * unmeasured change is never painted.
 */
export function deltaTone(delta: number | null | undefined, se: number | null | undefined, lowerIsBetter: boolean): DeltaTone {
  if (delta == null || Number.isNaN(delta) || se == null || !(se > 0)) return '';
  if (Math.abs(delta) < se) return '';
  return delta < 0 === lowerIsBetter ? 'is-gain' : 'is-loss';
}

/** The words for a change, which never claim more than the tone does. */
export function deltaWords(delta: number | null | undefined, tone: DeltaTone, against: string): string {
  if (delta == null || Number.isNaN(delta)) return '';
  if (tone === '') return `No clear change ${against}`;
  return `${tone === 'is-gain' ? 'Better than' : 'Worse than'} ${against.replace(/^vs /, '')}`;
}

/** The 95% Wilson score interval of `made` of `attempts`, as fractions 0 to 1; null with no attempts. Sound at small n and at the ends, where the plain interval is not. */
export function wilson(made: number, attempts: number, z = 1.96): { lo: number; hi: number } | null {
  if (!(attempts > 0)) return null;
  const p = Math.min(1, Math.max(0, made / attempts));
  const z2 = z * z;
  const denom = 1 + z2 / attempts;
  const centre = (p + z2 / (2 * attempts)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / attempts + z2 / (4 * attempts * attempts))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * A trailing mean over the last `window` values (fewer at the start), drawn only from the `start`-th value on: before that
 * there is no line, a gap rather than a bridge. `null` values are skipped when averaging and give a null point.
 */
export function rollingMean(values: Array<number | null>, window = 5, start = 3): Array<number | null> {
  return values.map((_, i) => {
    if (i + 1 < start) return null;
    const slice = values.slice(Math.max(0, i + 1 - window), i + 1).filter((v): v is number => v != null);
    return slice.length >= Math.min(start, window) ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export interface RankInput {
  id: string;
  value: number;
  se: number | null;
}

export interface Ranked extends RankInput {
  /** 1-based rank by value (best first); players tied with the one above share its rank. */
  rank: number;
  tied: boolean;
}

/**
 * Rank by value, best first, and tie neighbors whose gap is under one standard error of their difference: a run of ties
 * shares the rank of its first member. Order is always by the point value; a tie never reorders anyone. Players with no
 * standard error never tie.
 */
export function rankWithTies(items: RankInput[], lowerIsBetter = false): Ranked[] {
  const sorted = [...items].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value) || a.id.localeCompare(b.id));
  const out: Ranked[] = [];
  sorted.forEach((it, i) => {
    const prev = out[i - 1];
    const se = prev ? diffSe(prev.se, it.se) : null;
    const tied = prev != null && se != null && Math.abs(prev.value - it.value) < se;
    out.push({ ...it, rank: tied ? prev!.rank : i + 1, tied: tied || false });
    if (tied && prev && !prev.tied) out[i - 1] = { ...prev, tied: true };
  });
  return out;
}
