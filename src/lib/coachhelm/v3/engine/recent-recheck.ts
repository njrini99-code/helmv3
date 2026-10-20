/**
 * Recent-window recheck for lifetime-window reads.
 *
 * Ported from PR #2073 (`agent/coachhelm-surfaces`,
 * `src/lib/coachhelm/v3/engine/recent-recheck.ts`; owner decision 2026-09-25:
 * "an insight must be re-checked against the player's recent rounds; if the
 * problem no longer holds it stops showing"), then changed to the modified
 * rule in the supercharge design (02-accuracy-standard.md §7 "PR #2073
 * modules", §2 thresholds; 04 Example 5) for CoachHelm Slice 3:
 *
 *   window       the newest 15 countable rounds, or the last 90 days when
 *                that holds more attempts (`pickRecheckWindow`); test rounds
 *                never count (the loader filters `is_test = false` and the
 *                countable-round rule, `src/lib/golf/round-countable.ts`).
 *   cleared      the recent point is at or past the read's benchmark AND the
 *                recent one-sided 90% bound is better than the read's own old
 *                point ("recent L90 > lifetime point").
 *   holds        the recent one-sided 90% bound on the other side is still
 *                worse than the benchmark ("recent U90 still worse").
 *   inconclusive anything else (both numbers are printed).
 *   thin         below the floor (20 putts in the band; 5 rounds for par
 *                scoring): says nothing.
 *
 * The PR ran this inside `BaseGenerator.run()` after every round. The design
 * runs it only at a checkpoint (`../lifecycle/checkpoint.ts`), from the
 * nightly lifecycle step (`../lifecycle/job.ts`), so this module is now pure:
 * the PR's loaders and generator hooks are not ported. The lifecycle
 * decisions (`isRecheckRetired`, `shouldKeepRetired`) keep the PR's
 * provenance markers (`resolved_by='engine-recheck'`,
 * `retired_reason='recheck_cleared'`).
 *
 * Statistics: one-sided 90% (z = 1.2816, the PR's `RECHECK_Z`, the same z as
 * the verdict bound so a coach learns one rule). Wilson bounds for a make %
 * (02 §11 allows Wilson at every n; it is the conservative choice below 20),
 * mean ± z·sd/√n for a lower-is-better average. Pure: data in, value out.
 */

export const RECHECK_WINDOW_DAYS = 90;
/** Newest countable rounds in the recheck window (00-overview Q7 default). */
export const RECHECK_WINDOW_ROUNDS = 15;
/** One-sided 90% normal quantile used for every bound. */
export const RECHECK_Z = 1.2816;
/** Putts in the band before a recheck says anything (02 §7 floor to "say"). */
export const RECHECK_MIN_PUTTS = 20;
/** Countable rounds before a par-scoring recheck says anything. */
export const RECHECK_MIN_PAR_ROUNDS = 5;

/** Provenance stamped on `metadata.resolved_by` when the recheck retires a row. */
export const RECHECK_RESOLVED_BY = 'engine-recheck' as const;
/** `metadata.retired_reason` for a recheck retirement. */
export const RECHECK_RETIRED_REASON = 'recheck_cleared' as const;

export type RecheckOutcome = 'cleared' | 'holds' | 'inconclusive' | 'thin';
export type RecheckWindow = 'newest_15_rounds' | 'last_90_days';

/**
 * `evidence.recheck` (04 §1.1, Example 5). Numbers are in the read's own
 * unit: a make % (0–100) for putt bands, strokes a hole for par scoring.
 */
export interface RecheckRecord {
  window: RecheckWindow;
  /** Countable rounds in the chosen window. */
  rounds_n: number;
  recent_value: number | null;
  /** Putts in the band, or holes of the par type. */
  recent_n: number;
  recent_unit: 'putts' | 'holes';
  recent_lower_90: number | null;
  recent_upper_90: number | null;
  /** The read's own number when it was made (`evidence.your_value`). */
  old_value: number;
  old_n: number;
  /** The read's benchmark (`evidence.comparison_value`). */
  benchmark: number;
  polarity: 'higher_better' | 'lower_better';
  outcome: RecheckOutcome;
  /** Floor in the gating unit (putts, or rounds for par scoring). */
  min_n: number;
  computed_at: string;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function wilsonBound(k: number, n: number, z: number, side: -1 | 1): number {
  const p = k / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (centre + side * margin) / (1 + z2 / n);
}

/** One-sided Wilson score lower bound for `k` successes in `n` trials. */
export function wilsonLowerBound(k: number, n: number, z = RECHECK_Z): number {
  if (n <= 0) return 0;
  return Math.max(0, wilsonBound(k, n, z, -1));
}

/** One-sided Wilson score upper bound for `k` successes in `n` trials. */
export function wilsonUpperBound(k: number, n: number, z = RECHECK_Z): number {
  if (n <= 0) return 1;
  return Math.min(1, wilsonBound(k, n, z, 1));
}

function meanAndSe(values: readonly number[]): { mean: number; se: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance) / Math.sqrt(n) };
}

/** One-sided upper bound of a mean: mean + z · sd / √n (sample sd). */
export function meanUpperBound(values: readonly number[], z = RECHECK_Z): number | null {
  const s = meanAndSe(values);
  return s ? s.mean + z * s.se : null;
}

/** One-sided lower bound of a mean: mean − z · sd / √n (sample sd). */
export function meanLowerBound(values: readonly number[], z = RECHECK_Z): number | null {
  const s = meanAndSe(values);
  return s ? s.mean - z * s.se : null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface RecentPutt {
  round_id: string;
  distance_to_hole_before: number | null;
  result: string | null;
  putt_made: boolean | null;
}

/** Putt band in feet, `(lo, hi]`; `hi` null = open-ended (`> lo`). */
export interface PuttBand {
  lo: number;
  hi: number | null;
}

/** The five `putt_distance` bands, keyed by their metric id. */
export const PUTT_BAND_BY_METRIC: Readonly<Record<string, PuttBand>> = {
  putts_made_3_5ft_pct: { lo: 3, hi: 5 },
  putts_made_5_10ft_pct: { lo: 5, hi: 10 },
  putts_made_10_15ft_pct: { lo: 10, hi: 15 },
  putts_made_15_25ft_pct: { lo: 15, hi: 25 },
  putts_made_25_plus_ft_pct: { lo: 25, hi: null },
};

/** The three `par_scoring` metrics, keyed by metric id. */
export const PAR_BY_METRIC: Readonly<Record<string, number>> = {
  scoring_par_3: 3,
  scoring_par_4: 4,
  scoring_par_5: 5,
};

export interface RecentHole {
  round_id: string;
  par: number | null;
  score: number | null;
}

/** What the read said when it was made. */
export interface RecheckTarget {
  /** `evidence.comparison_value`. */
  benchmark: number;
  /** `evidence.your_value`. */
  oldValue: number;
  /** `evidence.sample_n`. */
  oldN: number;
}

/**
 * True when the putt is in the band. Mirrors `update_player_putt_make_pct`
 * (the rule the read's own number came from): distance clamped to [0, 120]
 * ft, band `(lo, hi]`.
 */
export function puttInBand(p: RecentPutt, band: PuttBand): boolean {
  if (p.distance_to_hole_before === null || p.distance_to_hole_before === undefined) return false;
  const feet = Math.min(Math.max(Number(p.distance_to_hole_before), 0), 120);
  if (!Number.isFinite(feet)) return false;
  return feet > band.lo && (band.hi === null || feet <= band.hi);
}

/** made = `result='hole' OR putt_made IS TRUE` (same function). */
export function puttMade(p: RecentPutt): boolean {
  return p.result === 'hole' || p.putt_made === true;
}

// ---------------------------------------------------------------------------
// Pure rechecks (modified rule)
// ---------------------------------------------------------------------------

/**
 * Recent make % for one band against a higher-is-better read.
 * cleared: point ≥ benchmark and Wilson L90 > old point.
 * holds:   Wilson U90 < benchmark.
 */
export function puttBandRecheck(
  putts: readonly RecentPutt[],
  band: PuttBand,
  target: RecheckTarget,
  window: { window: RecheckWindow; rounds_n: number },
  computedAt: string,
  minPutts = RECHECK_MIN_PUTTS,
): RecheckRecord {
  let attempts = 0;
  let made = 0;
  for (const p of putts) {
    if (!puttInBand(p, band)) continue;
    attempts += 1;
    if (puttMade(p)) made += 1;
  }
  const point = attempts > 0 ? (100 * made) / attempts : null;
  const lower = attempts > 0 ? 100 * wilsonLowerBound(made, attempts) : null;
  const upper = attempts > 0 ? 100 * wilsonUpperBound(made, attempts) : null;
  const thin = point === null || attempts < minPutts;
  const outcome: RecheckOutcome = thin
    ? 'thin'
    : point >= target.benchmark && lower! > target.oldValue
      ? 'cleared'
      : upper! < target.benchmark
        ? 'holds'
        : 'inconclusive';
  return {
    window: window.window,
    rounds_n: window.rounds_n,
    recent_value: point === null ? null : round1(point),
    recent_n: attempts,
    recent_unit: 'putts',
    recent_lower_90: lower === null ? null : round1(lower),
    recent_upper_90: upper === null ? null : round1(upper),
    old_value: target.oldValue,
    old_n: target.oldN,
    benchmark: target.benchmark,
    polarity: 'higher_better',
    outcome,
    min_n: minPutts,
    computed_at: computedAt,
  };
}

/**
 * Recent scoring average on one par type against a lower-is-better read
 * (`comparison_value` is par itself on main). The floor is in ROUNDS.
 * cleared: mean ≤ benchmark and U90 < old point.
 * holds:   L90 > benchmark.
 */
export function parScoringRecheck(
  holes: readonly RecentHole[],
  par: number,
  target: RecheckTarget,
  window: { window: RecheckWindow; rounds_n: number },
  computedAt: string,
  minRounds = RECHECK_MIN_PAR_ROUNDS,
): RecheckRecord {
  const scores: number[] = [];
  const rounds = new Set<string>();
  for (const h of holes) {
    if (h.par !== par || h.score === null || !Number.isFinite(h.score)) continue;
    scores.push(h.score);
    rounds.add(h.round_id);
  }
  const point = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const upper = meanUpperBound(scores);
  const lower = meanLowerBound(scores);
  const thin = point === null || upper === null || lower === null || rounds.size < minRounds;
  const outcome: RecheckOutcome = thin
    ? 'thin'
    : point <= target.benchmark && upper < target.oldValue
      ? 'cleared'
      : lower > target.benchmark
        ? 'holds'
        : 'inconclusive';
  return {
    window: window.window,
    rounds_n: window.rounds_n,
    recent_value: point === null ? null : round2(point),
    recent_n: scores.length,
    recent_unit: 'holes',
    recent_lower_90: lower === null ? null : round2(lower),
    recent_upper_90: upper === null ? null : round2(upper),
    old_value: target.oldValue,
    old_n: target.oldN,
    benchmark: target.benchmark,
    polarity: 'lower_better',
    outcome,
    min_n: minRounds,
    computed_at: computedAt,
  };
}

/** A countable round with the date the window cut uses. */
export interface RecheckRound {
  id: string;
  round_date: string;
}

/**
 * The two candidate windows: the newest 15 countable rounds, and every
 * countable round in the last 90 days. `rounds` must be countable and sorted
 * newest first.
 */
export function recheckWindows(
  rounds: readonly RecheckRound[],
  todayIso: string,
  windowRounds = RECHECK_WINDOW_ROUNDS,
  windowDays = RECHECK_WINDOW_DAYS,
): Record<RecheckWindow, Set<string>> {
  const cut = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - windowDays);
  const since = cut.toISOString().slice(0, 10);
  return {
    newest_15_rounds: new Set(rounds.slice(0, windowRounds).map((r) => r.id)),
    last_90_days: new Set(rounds.filter((r) => r.round_date.slice(0, 10) >= since).map((r) => r.id)),
  };
}

/**
 * Run `recheck` on both windows and keep the one with more attempts
 * (02 §7: "newest 15 countable rounds or 90 days, whichever has more
 * attempts"). Ties keep the newest-15 window.
 */
export function recheckOnBestWindow(
  windows: Record<RecheckWindow, Set<string>>,
  recheck: (window: { window: RecheckWindow; rounds_n: number }, roundIds: Set<string>) => RecheckRecord,
): RecheckRecord {
  const a = recheck({ window: 'newest_15_rounds', rounds_n: windows.newest_15_rounds.size }, windows.newest_15_rounds);
  const b = recheck({ window: 'last_90_days', rounds_n: windows.last_90_days.size }, windows.last_90_days);
  return b.recent_n > a.recent_n ? b : a;
}

// ---------------------------------------------------------------------------
// Lifecycle markers (pure)
// ---------------------------------------------------------------------------

/** True for a row this recheck retired (and nothing has restored since). */
export function isRecheckRetired(
  lifecycle: string | null,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return lifecycle === 'archived' && metadata?.resolved_by === RECHECK_RESOLVED_BY;
}
