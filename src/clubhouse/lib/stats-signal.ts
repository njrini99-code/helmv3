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

/** The figures with a pooled spread to fall back on. */
export type SpreadKind = keyof typeof POOLED_SD;

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
  /** A share of holes (the scoring mix): any scored hole shows; under about 30 holes, under two rounds, it is an early read. */
  holes: { show: 1, early: 30, unit: 'hole' },
} as const;

export type FloorKind = keyof typeof FLOORS;

/** `none`: too few to show. `early`: shown muted with a tag. `steady`: shown plain. */
export type SampleState = 'none' | 'early' | 'steady';

export function sampleState(kind: FloorKind, n: number | null | undefined): SampleState {
  const f = FLOORS[kind];
  if (n == null || Number.isNaN(n) || n < f.show) return 'none';
  return n < f.early ? 'early' : 'steady';
}

/**
 * A rate held to its floor (A7): no value under `show`, with what it needs; between `show` and `early` the value with its
 * early-read tag; from `early` the value alone. "100% sand saves" from one bunker shot never reads as a rate.
 */
export function floorRate(kind: FloorKind, n: number, value: number | null): { value: number | null; state: SampleState; needs?: string; early?: string } {
  const state = sampleState(kind, n);
  if (value == null) return { value: null, state };
  if (state === 'none') return { value: null, state, needs: needsText(kind) };
  return state === 'early' ? { value, state, early: earlyTag(n, FLOORS[kind].unit) } : { value, state };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The tag on a muted value: "Early read · 6 rounds", or in the stat's own unit ("Early read · 24 holes"). */
export function earlyTag(n: number, unit: string = 'round'): string {
  return `Early read · ${plural(Math.round(n), unit)}`;
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

/**
 * The standard error of a window's mean from its round values (per 18 holes for a per-round figure). A score or strokes gained
 * window takes the player's own spread from five rounds and the pooled one below that (`spreadFor`); a figure with no pooled
 * spread (greens, putts, scrambling, birdies) has one only once five rounds can measure it, and none before: an unmeasured
 * change is never painted. `n` is the rounds the mean rests on (whole rounds: a nine-hole round is half); it defaults to the
 * count of values.
 */
export function meanSe(values: number[], kind: SpreadKind | null, n: number = values.length): number | null {
  if (!values.length) return null;
  if (kind) return standardError(spreadFor(values, kind), n);
  const own = values.length >= OWN_SD_MIN_ROUNDS ? sampleSd(values) : null;
  return own != null && own > MIN_OWN_SD ? standardError(own, n) : null;
}

/** The standard error of the difference of two windows' means (the current one and the one it is set against). */
export function changeSe(
  current: number[],
  previous: number[],
  kind: SpreadKind | null,
  nCurrent: number = current.length,
  nPrevious: number = previous.length,
): number | null {
  return diffSe(meanSe(current, kind, nCurrent), meanSe(previous, kind, nPrevious));
}

/**
 * A short run of scores (oldest first) split in half: the newer half's mean less the older half's, and that change's standard
 * error. The split is the form line's and `summarizeWindow`'s own (`formChange`): with an odd count the middle score is in
 * neither half. Null under three scores. `kind` names the pooled spread a short half falls back on (score by default; null for a
 * figure with none, whose change then has a standard error only once each half has five values).
 */
export function halvesChange(trend: number[], kind: SpreadKind | null = 'score'): { delta: number; se: number | null } | null {
  if (trend.length < 3) return null;
  const half = Math.floor(trend.length / 2);
  const newer = trend.slice(trend.length - half);
  const older = trend.slice(0, half);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { delta: m(newer) - m(older), se: changeSe(newer, older, kind) };
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
 * Rank by value, best first. A player ties the head of the run above when the gap is under one standard error of their
 * difference, so everyone sharing a rank is indistinguishable from the one who holds it (a chain of near neighbors never
 * stretches a tie across players who plainly differ). Order is always by the point value; a tie never reorders anyone.
 * Players with no standard error never tie.
 */
export function rankWithTies(items: RankInput[], lowerIsBetter = false): Ranked[] {
  const sorted = [...items].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value) || a.id.localeCompare(b.id));
  const out: Ranked[] = [];
  let head = -1;
  sorted.forEach((it, i) => {
    const lead = head >= 0 ? out[head] : null;
    const se = lead ? diffSe(lead.se, it.se) : null;
    const tied = lead != null && se != null && Math.abs(lead.value - it.value) < se;
    if (!tied) head = i;
    out.push({ ...it, rank: tied ? lead!.rank : i + 1, tied });
    if (tied && lead && !lead.tied) out[head] = { ...lead, tied: true };
  });
  return out;
}
