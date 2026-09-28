/**
 * Team intelligence: the client-side slices the Home page draws.
 *
 * Pure functions over `TeamIntelligenceData`. Every figure comes from counted
 * rows; nothing is estimated. A slice with no rows returns `n: 0` and nulls
 * so the view can say "no shots" instead of drawing a zero.
 */
import type {
  ApproachMiss,
  ApproachShot,
  ChipLie,
  ChipShot,
  IntelRound,
  IntelRoundType,
  IntelTheme,
  PuttBreak,
  PuttShot,
  PuttSlope,
  TeeShot,
  TeeZone,
} from './types';

// ---------------------------------------------------------------------------
// Rounds: window + round type
// ---------------------------------------------------------------------------

export type IntelWindow = 'season' | '30d';
export type IntelRoundFilter = IntelRoundType | 'all';

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Season is the calendar year of `today` (stats-date-range.ts's `season`). */
export function inWindow(date: string, window: IntelWindow, today: string): boolean {
  if (window === 'season') return date.slice(0, 4) === today.slice(0, 4) && date <= today;
  return date > daysBefore(today, 30) && date <= today;
}

export function filterRounds(
  rounds: readonly IntelRound[],
  opts: { window: IntelWindow; type: IntelRoundFilter; today: string },
): IntelRound[] {
  return rounds.filter(
    (r) => inWindow(r.date, opts.window, opts.today) && (opts.type === 'all' || r.type === opts.type),
  );
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Strokes gained
// ---------------------------------------------------------------------------

function sgValues(rounds: readonly IntelRound[], theme: IntelTheme): number[] {
  return rounds.map((r) => r.sg[theme]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export interface ThemeSummary {
  theme: IntelTheme;
  /** Team SG per round (mean over every round in the slice). */
  sg: number | null;
  rounds: number;
  /** Chronological bucket means, oldest first; at most `buckets` points. */
  series: number[];
  /** Last point minus first point; null with fewer than two points. */
  change: number | null;
}

/** Split a chronological list into `k` near-equal runs and average each. */
export function bucketMeans(values: readonly number[], k: number): number[] {
  if (values.length === 0) return [];
  const n = Math.min(k, values.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const from = Math.floor((i * values.length) / n);
    const to = Math.floor(((i + 1) * values.length) / n);
    out.push(mean(values.slice(from, to))!);
  }
  return out;
}

export function themeSummary(rounds: readonly IntelRound[], theme: IntelTheme, buckets = 6): ThemeSummary {
  const ordered = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const values = sgValues(ordered, theme);
  const series = bucketMeans(values, buckets);
  return {
    theme,
    sg: mean(values),
    rounds: values.length,
    series,
    change: series.length >= 2 ? series[series.length - 1]! - series[0]! : null,
  };
}

export interface PlayerThemeSg {
  playerId: string;
  sg: number | null;
  rounds: number;
  /** That player's last eight rounds, oldest first. */
  last8: number[];
}

export function playerThemeSg(rounds: readonly IntelRound[], playerIds: readonly string[], theme: IntelTheme): PlayerThemeSg[] {
  return playerIds.map((playerId) => {
    const own = rounds.filter((r) => r.playerId === playerId).sort((a, b) => a.date.localeCompare(b.date));
    const values = sgValues(own, theme);
    return { playerId, sg: mean(values), rounds: values.length, last8: values.slice(-8) };
  });
}

/** Worst first; players with no rounds in the slice sink to the end. */
export function worstFirst<T extends { sg: number | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sg == null) return b.sg == null ? 0 : 1;
    if (b.sg == null) return -1;
    return a.sg - b.sg;
  });
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * The shots of the rounds in a slice, optionally one player's. `allowed` is
 * the set of round INDICES (into the payload's `rounds`) the slice kept.
 */
export function inRounds<T extends { ri: number }>(
  shots: readonly T[],
  allowed: ReadonlySet<number>,
  rounds: readonly IntelRound[],
  playerId?: string | null,
): T[] {
  return shots.filter((s) => allowed.has(s.ri) && (!playerId || rounds[s.ri]?.playerId === playerId));
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

// Tee ------------------------------------------------------------------------

/** Longest believable drive, yards. */
export const DRIVE_CEILING_YD = 420;

export interface TeeSummary {
  n: number;
  zones: Record<TeeZone, number>;
  fairwayPct: number | null;
  avgYards: number | null;
  /** The side most misses finish on, when either side has any. */
  missSide: 'left' | 'right' | null;
}

export function teeSummary(shots: readonly TeeShot[]): TeeSummary {
  const zones: Record<TeeZone, number> = { fairway: 0, left: 0, right: 0, miss: 0, penalty: 0 };
  for (const s of shots) zones[s.zone] += 1;
  // Drive length: drives that stayed in play, with a plausible length. A
  // penalty's "length" is where the drop was, and past the ceiling is a
  // mis-keyed hole length, not a drive.
  const yards = shots
    .filter((s) => s.zone !== 'penalty')
    .map((s) => s.yards)
    .filter((y): y is number => y != null && y > 0 && y <= DRIVE_CEILING_YD);
  return {
    n: shots.length,
    zones,
    fairwayPct: pct(zones.fairway, shots.length),
    avgYards: mean(yards),
    missSide: zones.left + zones.right === 0 ? null : zones.right >= zones.left ? 'right' : 'left',
  };
}

// Approach -------------------------------------------------------------------

/** `ref` is the `approach_proximity_*ft` standard the band sits inside. */
export const APPROACH_BANDS = [
  { id: '50', label: '50–75', min: 50, max: 75, ref: '50_125' },
  { id: '75', label: '75–100', min: 75, max: 100, ref: '50_125' },
  { id: '100', label: '100–125', min: 100, max: 125, ref: '50_125' },
  { id: '125', label: '125–150', min: 125, max: 150, ref: '125_175' },
  { id: '150', label: '150–175', min: 150, max: 175, ref: '125_175' },
  { id: '175', label: '175–200', min: 175, max: 200, ref: '175_plus' },
  { id: '200', label: '200–250', min: 200, max: 250, ref: '175_plus' },
] as const;
export type ApproachBandId = (typeof APPROACH_BANDS)[number]['id'];

/** A direction's depth / side component ("short_left" is both short and left). */
export function missParts(m: ApproachMiss): { depth: 'short' | 'long' | null; side: 'left' | 'right' | null } {
  const [a, b] = m.split('_') as [string, string | undefined];
  if (a === 'short' || a === 'long') return { depth: a, side: (b as 'left' | 'right' | undefined) ?? null };
  return { depth: null, side: a as 'left' | 'right' };
}

export const APPROACH_MISSES: readonly ApproachMiss[] = [
  'long_left',
  'long',
  'long_right',
  'left',
  'right',
  'short_left',
  'short',
  'short_right',
];

export interface ApproachSummary {
  n: number;
  /** Mean proximity (ft) over shots with a measured leave. */
  proximity: number | null;
  girPct: number | null;
  /** Tagged misses. */
  missed: number;
  /** Misses with a SHORT / LONG / LEFT / RIGHT component (a short-left miss
   *  counts as both short and left), so each reads "share of misses". */
  misses: Record<'short' | 'long' | 'left' | 'right', number>;
  /** Exact counts for all eight directions. */
  byDirection: Record<ApproachMiss, number>;
  /** The most common exact direction, when there is one. */
  mainMiss: ApproachMiss | null;
}

export function approachInBand(shots: readonly ApproachShot[], band: ApproachBandId | 'all'): ApproachShot[] {
  const lo = band === 'all' ? APPROACH_BANDS[0].min : APPROACH_BANDS.find((b) => b.id === band)!.min;
  const hi = band === 'all' ? APPROACH_BANDS[APPROACH_BANDS.length - 1]!.max : APPROACH_BANDS.find((b) => b.id === band)!.max;
  return shots.filter((s) => s.fromYards >= lo && s.fromYards < hi);
}

export function approachSummary(shots: readonly { onGreen?: boolean; leaveFeet: number | null; miss: ApproachMiss | null }[]): ApproachSummary {
  const misses = { short: 0, long: 0, left: 0, right: 0 };
  const byDirection = Object.fromEntries(APPROACH_MISSES.map((m) => [m, 0])) as Record<ApproachMiss, number>;
  let missed = 0;
  for (const s of shots) {
    if (!s.miss) continue;
    missed += 1;
    byDirection[s.miss] += 1;
    const { depth, side } = missParts(s.miss);
    if (depth) misses[depth] += 1;
    if (side) misses[side] += 1;
  }
  const leaves = shots.map((s) => s.leaveFeet).filter((v): v is number => v != null);
  const ranked = [...APPROACH_MISSES].sort((a, b) => byDirection[b] - byDirection[a]);
  return {
    n: shots.length,
    proximity: mean(leaves),
    girPct: pct(shots.filter((s) => s.onGreen).length, shots.length),
    missed,
    misses,
    byDirection,
    mainMiss: byDirection[ranked[0]!] > 0 ? ranked[0]! : null,
  };
}

// Around the green -----------------------------------------------------------

export const CHIP_BANDS = [
  { id: '0', label: '0–10 yd', min: 0, max: 10 },
  { id: '10', label: '10–20 yd', min: 10, max: 20 },
  { id: '20', label: '20–30 yd', min: 20, max: 30 },
] as const;
export type ChipBandId = (typeof CHIP_BANDS)[number]['id'];
export const CHIP_LIES: readonly { id: ChipLie; label: string }[] = [
  { id: 'fairway', label: 'Fairway' },
  { id: 'rough', label: 'Rough' },
  { id: 'sand', label: 'Sand' },
];

export function chipsIn(shots: readonly ChipShot[], band: ChipBandId | 'all', lie: ChipLie | 'all'): ChipShot[] {
  const b = band === 'all' ? null : CHIP_BANDS.find((x) => x.id === band)!;
  return shots.filter(
    (s) => (!b || (s.fromYards >= b.min && s.fromYards < b.max)) && (lie === 'all' || s.lie === lie),
  );
}

export interface ChipSummary {
  n: number;
  upAndDownPct: number | null;
  /** Share of first chips finishing inside 4 ft. */
  inside4Pct: number | null;
  medianLeave: number | null;
  leaves: { feet: number; saved: boolean }[];
}

export function chipSummary(shots: readonly ChipShot[]): ChipSummary {
  const leaves = shots
    .filter((s): s is ChipShot & { leaveFeet: number } => s.leaveFeet != null)
    .map((s) => ({ feet: s.leaveFeet, saved: s.saved }));
  const sorted = leaves.map((l) => l.feet).sort((a, b) => a - b);
  return {
    n: shots.length,
    upAndDownPct: pct(shots.filter((s) => s.saved).length, shots.length),
    inside4Pct: pct(leaves.filter((l) => l.feet < 4).length, leaves.length),
    medianLeave: sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : null,
    leaves,
  };
}

// Putting --------------------------------------------------------------------

/** Cut on the `putts_made_*_pct` standards so every band has a tour make %
 *  (`ref`); inside 3 ft has no standard and no band. */
export const PUTT_BANDS = [
  { id: '3', label: '3–5', min: 3, max: 5, ref: '3_5' },
  { id: '5', label: '5–10', min: 5, max: 10, ref: '5_10' },
  { id: '10', label: '10–15', min: 10, max: 15, ref: '10_15' },
  { id: '15', label: '15–25', min: 15, max: 25, ref: '15_25' },
  { id: '25', label: '25+', min: 25, max: Number.POSITIVE_INFINITY, ref: '25_plus' },
] as const;
export type PuttBandId = (typeof PUTT_BANDS)[number]['id'];
export const PUTT_BREAKS: readonly { id: PuttBreak; label: string }[] = [
  { id: 'rl', label: 'Right to left' },
  { id: 'st', label: 'Straight' },
  { id: 'lr', label: 'Left to right' },
];
export const PUTT_SLOPES: readonly { id: PuttSlope; label: string }[] = [
  { id: 'up', label: 'Uphill' },
  { id: 'level', label: 'Level' },
  { id: 'down', label: 'Downhill' },
];

export function puttsIn(
  putts: readonly PuttShot[],
  band: PuttBandId | 'all',
  brk: PuttBreak | 'all' = 'all',
  slope: PuttSlope | 'all' = 'all',
): PuttShot[] {
  const b = band === 'all' ? null : PUTT_BANDS.find((x) => x.id === band)!;
  return putts.filter(
    (p) =>
      (!b || (p.feet >= b.min && p.feet < b.max)) &&
      (brk === 'all' || p.brk === brk) &&
      (slope === 'all' || p.slope === slope),
  );
}

export interface PuttSummary {
  n: number;
  makePct: number | null;
  /** 3-putts per first putt. */
  threePuttPct: number | null;
  misses: number;
  /** Share of TAGGED misses on each side / depth. */
  lowPct: number | null;
  highPct: number | null;
  shortPct: number | null;
  longPct: number | null;
}

export function puttSummary(putts: readonly PuttShot[]): PuttSummary {
  const misses = putts.filter((p) => !p.made);
  const sided = misses.filter((p) => p.side);
  const depthed = misses.filter((p) => p.depth);
  const firsts = putts.filter((p) => p.first);
  return {
    n: putts.length,
    makePct: pct(putts.length - misses.length, putts.length),
    threePuttPct: pct(firsts.filter((p) => p.threePutt).length, firsts.length),
    misses: misses.length,
    lowPct: pct(sided.filter((p) => p.side === 'low').length, sided.length),
    highPct: pct(sided.filter((p) => p.side === 'high').length, sided.length),
    shortPct: pct(depthed.filter((p) => p.depth === 'short').length, depthed.length),
    longPct: pct(depthed.filter((p) => p.depth === 'long').length, depthed.length),
  };
}
