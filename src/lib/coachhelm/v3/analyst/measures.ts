/**
 * CoachHelm analyst: the measures, each computed over one window of one player's rounds.
 *
 * One number, one source. Every figure here is read the way the Stats screen reads it, through the lib function the
 * screen's own loader calls where one exists, and from the same table and columns where the arithmetic lives in
 * `src/clubhouse` (which `src/lib` may not import). README.md lists each measure with its source; the parity test
 * (`__tests__/stats-parity.test.ts`) runs the Clubhouse functions over the same rows.
 *
 * All rounds here are 18-hole rounds (rounds.ts `figureRounds`), so "per round" is per 18 holes and a plain mean is
 * the Stats screens' weighted mean.
 *
 * Pure: no Supabase, no clock.
 */
import { greenHitAnchor, type ApproachBucket } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';
import { tCritical95, wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import { LEAK_BUCKET_MIN_N, aggregateApproachBuckets, type ApproachShotRow } from '@/lib/golf/leak-map-buckets';
import { PUTT_REPORT_BAND_OF, bandedPutt, type PuttReportBandId } from '@/lib/golf/putt-make';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import type { CountedRound } from './rounds';
import type { HoleRow, RoundCacheRow, ShotRow, TourStandardRow } from './sources';
import { meanSummary, satterthwaiteDf, tRange95 } from './stats';
import type {
  Direction,
  MeasureArea,
  MeasureBasis,
  MeasureLevel,
  MeasureUnit,
  SampleUnit,
  TourFigure,
  TourProvenance,
  WindowFigure,
} from './types';

// ── Floors: where the Stats screen first shows each figure ──────────────────────────────────────────────────────────

/** Strokes gained needs three rounds that have it (src/clubhouse/data/season.ts `MIN_SG_ROUNDS`). */
export const STROKES_GAINED_MIN_ROUNDS = 3;
/** Fairways and greens need two rounds with a chance at them (src/clubhouse/lib/stats-signal.ts `FLOORS.fraction.show`). */
export const FRACTION_MIN_ROUNDS = 2;
/** Scrambling and sand saves need ten chances (stats-signal.ts `FLOORS.scramble.show`). */
export const SAVE_MIN_CHANCES = 10;
/** A putt band needs ten putts (src/clubhouse/data/stats-player.ts `makeRate`: `attempts >= 10`). */
export const PUTT_BAND_MIN_PUTTS = 10;
/** An approach band needs ten approaches (src/lib/golf/leak-map-buckets.ts `LEAK_BUCKET_MIN_N`). */
export const APPROACH_BAND_MIN_SHOTS = LEAK_BUCKET_MIN_N;
/** The pressure gap needs 3 competitive rounds, 3 practice rounds and 5 in all (src/clubhouse/data/stats-figures.ts `PRESSURE_MIN`). */
export const PRESSURE_MIN = { competitive: 3, practice: 3, total: 5 } as const;
/** The opening hole needs five rounds scored hole by hole (stats-figures.ts `OPENING_MIN_ROUNDS`). */
export const OPENING_MIN_ROUNDS = 5;

/** Values and ranges are kept to four decimals: enough for any figure printed, and no float noise in the JSON. */
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// ── The window a measure is computed over ───────────────────────────────────────────────────────────────────────────

export interface WindowData {
  /** The window's rounds, newest first (scores: every round, a total-only one included). */
  rounds: readonly CountedRound[];
  /** The same window cut from the rounds WITH practice (the pressure gap sets practice against competition). */
  allTypeRounds: readonly CountedRound[];
  /** Per-round cache rows, already passed through {@link cacheForFigures}. */
  cache: ReadonlyMap<string, RoundCacheRow>;
  holesByRound: ReadonlyMap<string, readonly HoleRow[]>;
  shotsByRound: ReadonlyMap<string, readonly ShotRow[]>;
  /** `golf_holes.id` to par, for the approach bands' lay-up rule. */
  parByHole: ReadonlyMap<string, number | null>;
  /** Rounds whose stored strokes gained was measured from logged shots ({@link hasMeasuredStrokesGained}). */
  measuredRoundIds: ReadonlySet<string>;
}

export type RawFigure = Omit<WindowFigure, 'window'>;

export interface TourContext {
  tour: 'pga' | 'lpga';
  gender: 'mens' | 'womens';
  standards: ReadonlyMap<string, TourStandardRow>;
}

export interface MeasureDef {
  id: string;
  label: string;
  unit: MeasureUnit;
  direction: Direction;
  area: MeasureArea;
  level: MeasureLevel;
  basis: MeasureBasis;
  estimated: boolean;
  source: string;
  compute(w: WindowData): RawFigure;
  tour(ctx: TourContext): TourFigure | null;
}

// ── Row rules shared with the Stats loaders ─────────────────────────────────────────────────────────────────────────

const SCORE_COUNTS = ['eagles', 'birdies', 'pars', 'bogeys', 'double_bogeys', 'triple_plus'] as const;
const HOLE_LEVEL = ['birdies', 'eagles', 'scramble_attempts', 'scrambles_converted', 'sand_attempts', 'sand_saves', 'three_putts', 'double_bogeys', 'triple_plus'] as const;

/**
 * A cache row whose score counts are all known and add up to no hole was written for a round with no hole scored: its
 * hole-level counts are unknown, not zero (src/clubhouse/data/stats-common.ts `withoutEmptyHoleCounts`, C-24a).
 */
export function cacheForFigures(row: RoundCacheRow): RoundCacheRow {
  const counts = SCORE_COUNTS.map((k) => row[k]);
  if (!counts.every((v) => typeof v === 'number') || counts.reduce<number>((a, v) => a + (v as number), 0) > 0) return row;
  const out = { ...row };
  for (const k of HOLE_LEVEL) out[k] = null;
  return out;
}

/**
 * Was this round's stored strokes gained measured from shots? The database function measures it shot by shot when the
 * round has at least one usable shot, and otherwise writes an estimate from the scorecard
 * (supabase/schemas/functions/public.sql:7919-7923 the shot count, :8036-8038 the estimate branch). This is that
 * count's condition, row for row.
 */
export function hasMeasuredStrokesGained(shots: readonly ShotRow[]): boolean {
  return shots.some(
    (s) =>
      s.shot_type != null &&
      s.lie_before != null &&
      s.distance_to_hole_before != null &&
      s.distance_to_hole_before > 0 &&
      (s.distance_to_hole_after != null || s.putt_made === true || s.result === 'holed' || s.result === 'hole'),
  );
}

// ── Figure builders ─────────────────────────────────────────────────────────────────────────────────────────────────

function soFar(n: number): string {
  return n === 0 ? 'none so far' : `${n} so far`;
}

/** A plain mean of one value per observation, with its t range. `min` is the Stats floor in observations. */
function meanFigure(values: readonly number[], opts: { rounds: number; unit: SampleUnit; min: number; needs: string }): RawFigure {
  const sample = { attempts: values.length, unit: opts.unit, rounds: opts.rounds };
  const s = meanSummary(values);
  if (!s || values.length < opts.min) return { value: null, range95: null, sample, stat: null, withheld: `${opts.needs}; ${soFar(values.length)}` };
  const range = s.se != null && s.df != null ? tRange95(s.mean, s.se, s.df) : null;
  return {
    value: r4(s.mean),
    range95: range ? { low: r4(range.low), high: r4(range.high), method: 't' } : null,
    sample,
    stat: { kind: 'mean', n: s.n, sd: s.sd, se: s.se, df: s.df },
  };
}

/** A pooled rate (successes over chances, never a mean of percentages) with its Wilson range, in percent. */
function rateFigure(successes: number, attempts: number, opts: { rounds: number; unit: SampleUnit; shown: boolean; needs: string; have: string }): RawFigure {
  const sample = { attempts, unit: opts.unit, rounds: opts.rounds };
  if (!(attempts > 0) || !opts.shown) return { value: null, range95: null, sample, stat: null, withheld: `${opts.needs}; ${opts.have}` };
  const ci = wilsonInterval(successes, attempts);
  return {
    value: r4((successes / attempts) * 100),
    range95: ci ? { low: r4(ci.low), high: r4(ci.high), method: 'wilson' } : null,
    sample,
    stat: { kind: 'proportion', successes, attempts },
  };
}

/** The window's rounds that have their holes (round-scope.ts `holeRounds`). */
const withHoles = (w: WindowData): CountedRound[] => w.rounds.filter((r) => !r.total_only);

type StrokesGainedKey = 'strokes_gained_total' | 'strokes_gained_tee' | 'strokes_gained_approach' | 'strokes_gained_around_green' | 'strokes_gained_putting';

/**
 * Strokes gained per round over the rounds measured from shots, or over the rounds estimated from the scorecard: the
 * two are never averaged together. The value is the mean of the stored per-round figures
 * (src/clubhouse/data/stats-weight.ts `sgOver`), the floor is three rounds of that kind.
 */
function strokesGained(w: WindowData, key: StrokesGainedKey, measured: boolean): RawFigure {
  const rounds = withHoles(w).filter((r) => r[key] != null && w.measuredRoundIds.has(r.id) === measured);
  return meanFigure(rounds.map((r) => r[key] as number), {
    rounds: rounds.length,
    unit: 'rounds',
    min: STROKES_GAINED_MIN_ROUNDS,
    needs: measured ? `needs ${STROKES_GAINED_MIN_ROUNDS} rounds with shots logged` : `needs ${STROKES_GAINED_MIN_ROUNDS} rounds estimated from the scorecard`,
  });
}

/** The strokes-gained figure the Stats screen prints for a window: every round that has one, measured or estimated (`sgOver`). */
export function screenStrokesGained(w: WindowData, key: StrokesGainedKey): { value: number | null; rounds: number; blended: boolean } {
  const rounds = withHoles(w).filter((r) => r[key] != null);
  const measured = rounds.filter((r) => w.measuredRoundIds.has(r.id)).length;
  const s = meanSummary(rounds.map((r) => r[key] as number));
  return {
    value: s && rounds.length >= STROKES_GAINED_MIN_ROUNDS ? r4(s.mean) : null,
    rounds: rounds.length,
    blended: measured > 0 && measured < rounds.length,
  };
}

/** The window's cache rows for the rounds with their holes (stats-player.ts `mineCache`). */
function cacheRows(w: WindowData): RoundCacheRow[] {
  return withHoles(w).flatMap((r) => {
    const c = w.cache.get(r.id);
    return c ? [c] : [];
  });
}

type CacheKey = Exclude<keyof RoundCacheRow, 'round_id'>;

/** A rate pooled over the rounds' cached counts (stats-common.ts `rate` and `rateSample`). */
function cachedRate(w: WindowData, made: CacheKey, total: CacheKey, floor: { kind: 'rounds'; min: number } | { kind: 'chances'; min: number }, what: string): RawFigure {
  let m = 0;
  let t = 0;
  let rounds = 0;
  for (const c of cacheRows(w)) {
    const a = c[made];
    const b = c[total];
    if (typeof b === 'number' && b > 0) {
      rounds += 1;
      if (typeof a === 'number') {
        m += a;
        t += b;
      }
    }
  }
  const byRounds = floor.kind === 'rounds';
  return rateFigure(m, t, {
    rounds,
    unit: byRounds ? 'holes' : 'chances',
    shown: byRounds ? rounds >= floor.min : t >= floor.min,
    needs: byRounds ? `needs ${floor.min} rounds with ${what}` : `needs ${floor.min} ${what}`,
    have: byRounds ? soFar(rounds) : soFar(t),
  });
}

/** A round's putts, or three-putts, when the round has putts recorded: 0 putts is "not recorded" (stats-common.ts `cachedPutts`). */
function cachedPutts(c: RoundCacheRow | undefined, key: 'total_putts' | 'three_putts'): number | null {
  if (!c || typeof c.total_putts !== 'number' || c.total_putts <= 0) return null;
  const v = c[key];
  return typeof v === 'number' ? v : null;
}

/** A per-round mean over the rounds with their holes that have a value (stats-player.ts `per` and `perPutts`). */
function perRound(w: WindowData, pick: (r: CountedRound, c: RoundCacheRow | undefined) => number | null, needs: string): RawFigure {
  const values = withHoles(w).flatMap((r) => {
    const v = pick(r, w.cache.get(r.id));
    return v == null || !Number.isFinite(v) ? [] : [v];
  });
  return meanFigure(values, { rounds: values.length, unit: 'rounds', min: 1, needs });
}

/** Double bogey or worse as a share of holes (stats-weight.ts `bigNumberRate`). */
function bigNumbers(w: WindowData): RawFigure {
  let big = 0;
  let holes = 0;
  let rounds = 0;
  for (const r of withHoles(w)) {
    const c = w.cache.get(r.id);
    if (!c || c.double_bogeys == null || c.triple_plus == null) continue;
    big += c.double_bogeys + c.triple_plus;
    holes += r.holes_played ?? 18;
    rounds += 1;
  }
  return rateFigure(big, holes, { rounds, unit: 'holes', shown: holes > 0, needs: 'needs a round scored hole by hole', have: 'none so far' });
}

/** The window's scored holes (stats-detail.ts `loadHoles`: a hole with a par and a score). */
function scoredHoles(w: WindowData): Array<{ round_id: string; hole_number: number; par: number; score: number }> {
  return withHoles(w).flatMap((r) =>
    (w.holesByRound.get(r.id) ?? []).flatMap((h) =>
      typeof h.par === 'number' && typeof h.score === 'number' ? [{ round_id: h.round_id, hole_number: h.hole_number, par: h.par, score: h.score }] : [],
    ),
  );
}

/** Average score on the holes of one par. Stats prints par + the calculator's average to par, which is the same mean over the same holes. */
function parScoring(w: WindowData, par: 3 | 4 | 5): RawFigure {
  const holes = scoredHoles(w).filter((h) => h.par === par);
  return meanFigure(holes.map((h) => h.score), {
    rounds: new Set(holes.map((h) => h.round_id)).size,
    unit: 'holes',
    min: 1,
    needs: `needs a par ${par} scored`,
  });
}

/**
 * Hole 1 against the other holes, in strokes to par a hole (stats-figures.ts `openingDelta`): the mean of hole 1 to par
 * less the mean of every other hole to par, over the rounds that have both. The standard error is the paired one, from
 * each round's (hole 1 − that round's other holes); with every round at 18 holes the paired mean is the same value.
 */
function openingHole(w: WindowData): RawFigure {
  const byRound = new Map<string, { first: number | null; rest: number[] }>();
  for (const h of scoredHoles(w)) {
    const t = byRound.get(h.round_id) ?? { first: null, rest: [] };
    if (h.hole_number === 1) t.first = h.score - h.par;
    else if (h.hole_number >= 2 && h.hole_number <= 18) t.rest.push(h.score - h.par);
    byRound.set(h.round_id, t);
  }
  const both = [...byRound.values()].filter((t): t is { first: number; rest: number[] } => t.first != null && t.rest.length > 0);
  const sample = { attempts: both.length, unit: 'rounds' as const, rounds: both.length };
  if (both.length < OPENING_MIN_ROUNDS) {
    return { value: null, range95: null, sample, stat: null, withheld: `needs ${OPENING_MIN_ROUNDS} rounds scored hole by hole; ${soFar(both.length)}` };
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const value = mean(both.map((t) => t.first)) - mean(both.flatMap((t) => t.rest));
  const paired = meanSummary(both.map((t) => t.first - mean(t.rest)));
  const range = paired?.se != null && paired.df != null ? tRange95(value, paired.se, paired.df) : null;
  return {
    value: r4(value),
    range95: range ? { low: r4(range.low), high: r4(range.high), method: 't' } : null,
    sample,
    stat: paired ? { kind: 'mean', n: paired.n, sd: paired.sd, se: paired.se, df: paired.df } : null,
  };
}

/**
 * Tournament and qualifier rounds against practice rounds, in strokes to par a round; positive means the competitive
 * rounds are worse (stats-figures.ts `pressureGap`, read from the window WITH practice, as Stats reads it). The range is
 * Welch's for a difference of two means.
 */
function pressureGap(w: WindowData): RawFigure {
  const competitive: number[] = [];
  const practice: number[] = [];
  for (const r of w.allTypeRounds) {
    if (r.total_score == null || r.round_type == null || r.score_to_par == null) continue;
    (roundTypeFromDb(r.round_type) === 'practice' ? practice : competitive).push(r.score_to_par);
  }
  const n = competitive.length + practice.length;
  const sample = { attempts: n, unit: 'rounds' as const, rounds: n };
  if (competitive.length < PRESSURE_MIN.competitive || practice.length < PRESSURE_MIN.practice || n < PRESSURE_MIN.total) {
    return {
      value: null,
      range95: null,
      sample,
      stat: null,
      withheld: `needs ${PRESSURE_MIN.competitive} tournament or qualifier rounds and ${PRESSURE_MIN.practice} practice rounds; ${competitive.length} and ${practice.length} so far`,
    };
  }
  const a = meanSummary(competitive)!;
  const b = meanSummary(practice)!;
  const value = a.mean - b.mean;
  const se = Math.sqrt(a.se! ** 2 + b.se! ** 2);
  const df = satterthwaiteDf(a.se!, a.df!, b.se!, b.df!);
  const usable = se > 0 && Number.isFinite(df);
  const range = usable ? tRange95(value, se, df) : null;
  return {
    value: r4(value),
    range95: range ? { low: r4(range.low), high: r4(range.high), method: 'welch' } : null,
    sample,
    stat: usable ? { kind: 'mean', n, sd: null, se, df } : null,
  };
}

/** The window's putts on the one make-rate definition (src/lib/golf/putt-make.ts), counted into a reporting band. */
function puttBand(w: WindowData, band: PuttReportBandId): RawFigure {
  let made = 0;
  let attempts = 0;
  const rounds = new Set<string>();
  for (const r of withHoles(w)) {
    for (const s of w.shotsByRound.get(r.id) ?? []) {
      if (s.shot_type !== 'putting') continue;
      const p = bandedPutt(s);
      if (!p || PUTT_REPORT_BAND_OF[p.band] !== band) continue;
      attempts += 1;
      if (p.made) made += 1;
      rounds.add(r.id);
    }
  }
  return rateFigure(made, attempts, {
    rounds: rounds.size,
    unit: 'putts',
    shown: attempts >= PUTT_BAND_MIN_PUTTS,
    needs: `needs ${PUTT_BAND_MIN_PUTTS} putts in the band`,
    have: soFar(attempts),
  });
}

/** The leak map's three approach bands (`APPROACH_BANDS` bucket ids in src/lib/golf/leak-map-buckets.ts). */
type ApproachBandId = '50_125' | '125_175' | '175_plus';

/** A round's approach shots in the shape the leak map's aggregator reads (stats-detail.ts `loadApproachShots`). */
function approachRows(w: WindowData, roundId: string): ApproachShotRow[] {
  return (w.shotsByRound.get(roundId) ?? []).flatMap((s) =>
    s.shot_type === 'approach' && s.distance_to_hole_before != null && s.distance_to_hole_after != null
      ? [
          {
            distance_to_hole_before: s.distance_to_hole_before,
            distance_unit_before: s.distance_unit_before,
            distance_to_hole_after: s.distance_to_hole_after,
            distance_unit_after: s.distance_unit_after,
            result: s.result,
            lie_after: s.lie_after,
            par: s.hole_id ? (w.parByHole.get(s.hole_id) ?? null) : null,
          },
        ]
      : [],
  );
}

/** One approach band through the production aggregator (`aggregateApproachBuckets`), and how many rounds fed it. */
function approachBand(w: WindowData, band: ApproachBandId) {
  const perRoundRows = withHoles(w).map((r) => approachRows(w, r.id));
  const bucket = aggregateApproachBuckets(perRoundRows.flat(), new Map()).find((b) => b.bucket_id === band)!;
  const rounds = perRoundRows.filter((rows) => (aggregateApproachBuckets(rows, new Map()).find((b) => b.bucket_id === band)?.sample_n ?? 0) > 0).length;
  return { bucket, rounds };
}

/**
 * Average finish in feet over every approach from the band, misses included and lay-ups left out. The value, its
 * range and its count are the aggregator's own; the standard error is read back off that range
 * ((high − mean) / t(n − 1), the aggregator's formula inverted), so no second proximity formula exists here.
 */
function approachProximity(w: WindowData, band: ApproachBandId): RawFigure {
  const { bucket, rounds } = approachBand(w, band);
  const n = bucket.sample_n;
  const sample = { attempts: n, unit: 'approach_shots' as const, rounds };
  if (bucket.team_value == null || bucket.ci_high == null || bucket.ci_low == null) {
    return { value: null, range95: null, sample, stat: null, withheld: `needs ${APPROACH_BAND_MIN_SHOTS} approaches from the range; ${soFar(n)}` };
  }
  const se = (bucket.ci_high - bucket.team_value) / tCritical95(n - 1);
  return {
    value: bucket.team_value,
    range95: { low: bucket.ci_low, high: bucket.ci_high, method: 't' },
    sample,
    stat: { kind: 'mean', n, sd: se * Math.sqrt(n), se, df: n - 1 },
  };
}

/** The share of approaches from the band that finish on the green (the aggregator's `green_hit_pct`, same shots as the proximity). */
function approachGreenHit(w: WindowData, band: ApproachBandId): RawFigure {
  const { bucket, rounds } = approachBand(w, band);
  const n = bucket.sample_n;
  const greens = bucket.green_hit_pct == null ? 0 : Math.round((bucket.green_hit_pct * n) / 100);
  return rateFigure(greens, n, {
    rounds,
    unit: 'approach_shots',
    shown: n >= APPROACH_BAND_MIN_SHOTS,
    needs: `needs ${APPROACH_BAND_MIN_SHOTS} approaches from the range`,
    have: soFar(n),
  });
}

// ── The Tour figure beside a measure ────────────────────────────────────────────────────────────────────────────────

/**
 * Standards rows whose own source note is an estimate rather than a published Tour statistic, for both tours
 * (supabase/migrations/20260610040300_seed_golf_pga_standards.sql: "Tour ~2% per Research doc", "Tour low (~0.3/round)",
 * "~0.1-0.15 strokes worse", "small but measurable"; the LPGA rows reuse them, src/lib/golf/benchmarks/tour.ts:103-106).
 */
export const APPROXIMATE_TOUR_METRICS: ReadonlySet<string> = new Set([
  'big_number_rate',
  'penalty_rate_per_round',
  'practice_tournament_delta',
  'opening_hole_delta',
]);

const noTour = (): null => null;

/** The Tour figure from the standards table for the team's own tour; null where the tour has none (never the other tour's). */
const fromStandards =
  (metricId: string) =>
  (ctx: TourContext): TourFigure | null => {
    const row = ctx.standards.get(metricId);
    if (!row || row.value == null || !Number.isFinite(row.value)) return null;
    const provenance: TourProvenance = APPROXIMATE_TOUR_METRICS.has(metricId) ? 'approximate' : 'measured';
    return { value: row.value, tour: ctx.tour, provenance, source: `golf_pga_standards ${metricId} (${ctx.tour}): ${row.source ?? 'no source note'}` };
  };

const tourZero = (ctx: TourContext): TourFigure => ({
  value: 0,
  tour: ctx.tour,
  provenance: 'by_definition',
  source: 'Strokes gained is measured against the Tour baseline, so the Tour is zero (src/lib/golf/benchmarks/tour.ts strokesGained).',
});

const GREEN_HIT_BUCKET: Record<ApproachBandId, ApproachBucket> = { '50_125': '50_125ft', '125_175': '125_175ft', '175_plus': '175_plus_ft' };

/** The approach green-hit anchor: an approximate band figure for a men's team, none for a women's (`greenHitAnchor`, Q-88). */
const greenHitTour =
  (band: ApproachBandId) =>
  (ctx: TourContext): TourFigure | null => {
    const value = greenHitAnchor(GREEN_HIT_BUCKET[band], ctx.gender);
    if (value == null) return null;
    return {
      value,
      tour: ctx.tour,
      provenance: 'approximate',
      source: 'greenHitAnchor (src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts): an approximate Tour band figure, not cross-checked against golf_pga_standards.',
    };
  };

// ── The registry ────────────────────────────────────────────────────────────────────────────────────────────────────

const SG_AREAS = [
  { id: 'total', key: 'strokes_gained_total', label: 'Strokes gained per round, total', area: 'scoring', level: 'outcome' },
  { id: 'off_the_tee', key: 'strokes_gained_tee', label: 'Strokes gained per round, off the tee', area: 'off_the_tee', level: 'area' },
  { id: 'approach', key: 'strokes_gained_approach', label: 'Strokes gained per round, approach shots', area: 'approach', level: 'area' },
  { id: 'around_the_green', key: 'strokes_gained_around_green', label: 'Strokes gained per round, around the green', area: 'around_the_green', level: 'area' },
  { id: 'putting', key: 'strokes_gained_putting', label: 'Strokes gained per round, putting', area: 'putting', level: 'area' },
] as const satisfies ReadonlyArray<{ id: string; key: StrokesGainedKey; label: string; area: MeasureArea; level: MeasureLevel }>;

/** The four strokes-gained areas, in the order the Stats screens list them. */
export const STROKES_GAINED_AREA_IDS = ['strokes_gained_off_the_tee', 'strokes_gained_approach', 'strokes_gained_around_the_green', 'strokes_gained_putting'] as const;

const SG_SOURCE = 'golf_rounds stored per-round strokes gained, averaged as src/clubhouse/data/stats-weight.ts sgOver does';

const strokesGainedDefs: MeasureDef[] = SG_AREAS.flatMap((a): MeasureDef[] => [
  {
    id: `strokes_gained_${a.id}`,
    label: a.label,
    unit: 'strokes_per_round',
    direction: 'higher_is_better',
    area: a.area,
    level: a.level,
    basis: 'logged_shots',
    estimated: false,
    source: `${SG_SOURCE}; rounds with shots logged only`,
    compute: (w) => strokesGained(w, a.key, true),
    tour: tourZero,
  },
  {
    id: `strokes_gained_${a.id}_estimated`,
    label: `${a.label} (estimated from the scorecard, no shots logged)`,
    unit: 'strokes_per_round',
    direction: 'higher_is_better',
    area: a.area,
    level: a.level,
    basis: 'scorecard_estimate',
    estimated: true,
    source: `${SG_SOURCE}; rounds with no shots logged only (sg_estimate_from_holes)`,
    compute: (w) => strokesGained(w, a.key, false),
    // The estimate is fixed credits from the card, not on the Tour's scale, so no Tour figure stands beside it.
    tour: noTour,
  },
]);

const PUTT_BANDS: ReadonlyArray<{ band: PuttReportBandId; words: string; metric: string }> = [
  { band: '3_5', words: '3 to 5 feet', metric: 'putts_made_3_5ft_pct' },
  { band: '5_10', words: '5 to 10 feet', metric: 'putts_made_5_10ft_pct' },
  { band: '10_15', words: '10 to 15 feet', metric: 'putts_made_10_15ft_pct' },
  { band: '15_25', words: '15 to 25 feet', metric: 'putts_made_15_25ft_pct' },
  { band: '25_plus', words: '25 feet and longer', metric: 'putts_made_25_plus_ft_pct' },
];

const APPROACH: ReadonlyArray<{ band: ApproachBandId; words: string; metric: string }> = [
  { band: '50_125', words: '50 to 125 yards', metric: 'approach_proximity_50_125ft' },
  { band: '125_175', words: '125 to 175 yards', metric: 'approach_proximity_125_175ft' },
  { band: '175_plus', words: '175 yards and longer', metric: 'approach_proximity_175_plus_ft' },
];

const CACHE_SOURCE = 'golf_round_stats_cache counts pooled as src/clubhouse/data/stats-common.ts rate does';

export const MEASURES: readonly MeasureDef[] = [
  ...strokesGainedDefs,
  {
    id: 'scoring_average',
    label: 'Scoring average',
    unit: 'strokes',
    direction: 'lower_is_better',
    area: 'scoring',
    level: 'outcome',
    basis: 'round_scores',
    estimated: false,
    source: 'golf_rounds canonical total (withCanonicalRoundTotal), mean as src/clubhouse/data/stats-weight.ts summarizeWindow avg',
    compute: (w) => {
      const scores = w.rounds.flatMap((r) => (r.total_score == null ? [] : [r.total_score]));
      return meanFigure(scores, { rounds: scores.length, unit: 'rounds', min: 1, needs: 'needs a scored round' });
    },
    tour: noTour,
  },
  ...([3, 4, 5] as const).map(
    (par): MeasureDef => ({
      id: `par_${par}_scoring`,
      label: `Average score on par ${par} holes`,
      unit: 'strokes',
      direction: 'lower_is_better',
      area: 'scoring',
      level: 'detail',
      basis: 'scorecard',
      estimated: false,
      source: 'golf_holes par and score; Stats prints par + scoringByPar.avgToPar from the shots calculator, the same mean over the same holes',
      compute: (w) => parScoring(w, par),
      tour: fromStandards(`scoring_par_${par}`),
    }),
  ),
  {
    id: 'big_numbers',
    label: 'Holes at double bogey or worse, as a share of holes',
    unit: 'percent',
    direction: 'lower_is_better',
    area: 'scoring',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: 'golf_round_stats_cache double_bogeys + triple_plus over holes, as src/clubhouse/data/stats-weight.ts bigNumberRate',
    compute: bigNumbers,
    tour: fromStandards('big_number_rate'),
  },
  {
    id: 'fairways_hit',
    label: 'Fairways hit',
    unit: 'percent',
    direction: 'higher_is_better',
    area: 'off_the_tee',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: CACHE_SOURCE,
    compute: (w) => cachedRate(w, 'fairways_hit', 'fairways_total', { kind: 'rounds', min: FRACTION_MIN_ROUNDS }, 'a fairway to hit'),
    tour: noTour,
  },
  {
    id: 'greens_in_regulation',
    label: 'Greens hit in regulation',
    unit: 'percent',
    direction: 'higher_is_better',
    area: 'approach',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: CACHE_SOURCE,
    compute: (w) => cachedRate(w, 'greens_hit', 'greens_total', { kind: 'rounds', min: FRACTION_MIN_ROUNDS }, 'greens to hit'),
    tour: fromStandards('gir_pct'),
  },
  ...APPROACH.map(
    (b): MeasureDef => ({
      id: `approach_proximity_${b.band}`,
      label: `Average distance from the hole after an approach from ${b.words}`,
      unit: 'feet',
      direction: 'lower_is_better',
      area: 'approach',
      level: 'detail',
      basis: 'logged_shots',
      estimated: false,
      source: 'golf_shots through src/lib/golf/leak-map-buckets.ts aggregateApproachBuckets (every approach, lay-ups out)',
      compute: (w) => approachProximity(w, b.band),
      tour: fromStandards(b.metric),
    }),
  ),
  ...APPROACH.map(
    (b): MeasureDef => ({
      id: `approach_green_hit_${b.band}`,
      label: `Approaches from ${b.words} that finish on the green`,
      unit: 'percent',
      direction: 'higher_is_better',
      area: 'approach',
      level: 'detail',
      basis: 'logged_shots',
      estimated: false,
      source: 'golf_shots through src/lib/golf/leak-map-buckets.ts aggregateApproachBuckets green_hit_pct',
      compute: (w) => approachGreenHit(w, b.band),
      tour: greenHitTour(b.band),
    }),
  ),
  {
    id: 'scrambling',
    label: 'Scrambling: greens missed in regulation still saved for par or better',
    unit: 'percent',
    direction: 'higher_is_better',
    area: 'around_the_green',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: CACHE_SOURCE,
    compute: (w) => cachedRate(w, 'scrambles_converted', 'scramble_attempts', { kind: 'chances', min: SAVE_MIN_CHANCES }, 'scrambling chances'),
    tour: noTour,
  },
  {
    id: 'sand_saves',
    label: 'Sand saves: par or better after a greenside bunker',
    unit: 'percent',
    direction: 'higher_is_better',
    area: 'around_the_green',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: CACHE_SOURCE,
    compute: (w) => cachedRate(w, 'sand_saves', 'sand_attempts', { kind: 'chances', min: SAVE_MIN_CHANCES }, 'bunker chances'),
    tour: fromStandards('scrambling_pct_sand'),
  },
  {
    id: 'putts_per_round',
    label: 'Putts per round',
    unit: 'putts_per_round',
    direction: 'lower_is_better',
    area: 'putting',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: 'golf_round_stats_cache total_putts over rounds with putts recorded, as src/clubhouse/data/stats-common.ts cachedPutts',
    compute: (w) => perRound(w, (_r, c) => cachedPutts(c, 'total_putts'), 'needs a round with putts recorded'),
    tour: noTour,
  },
  {
    id: 'three_putts_per_round',
    label: 'Three-putts per round',
    unit: 'per_round',
    direction: 'lower_is_better',
    area: 'putting',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: 'golf_round_stats_cache three_putts over rounds with putts recorded, as src/clubhouse/data/stats-common.ts cachedPutts',
    compute: (w) => perRound(w, (_r, c) => cachedPutts(c, 'three_putts'), 'needs a round with putts recorded'),
    tour: noTour,
  },
  ...PUTT_BANDS.map(
    (b): MeasureDef => ({
      id: `putts_made_${b.band}`,
      label: `Putts made from ${b.words}`,
      unit: 'percent',
      direction: 'higher_is_better',
      area: 'putting',
      level: 'detail',
      basis: 'logged_shots',
      estimated: false,
      source: 'golf_shots putts on the one make-rate definition, src/lib/golf/putt-make.ts bandedPutt and PUTT_REPORT_BAND_OF',
      compute: (w) => puttBand(w, b.band),
      tour: fromStandards(b.metric),
    }),
  ),
  {
    id: 'penalty_strokes_per_round',
    label: 'Penalty strokes per round',
    unit: 'per_round',
    direction: 'lower_is_better',
    area: 'course_management',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: 'golf_round_stats_cache penalty_strokes, mean per round as src/clubhouse/data/stats-player.ts per',
    compute: (w) => perRound(w, (_r, c) => (typeof c?.penalty_strokes === 'number' ? c.penalty_strokes : null), 'needs a round scored hole by hole'),
    tour: fromStandards('penalty_rate_per_round'),
  },
  {
    id: 'pressure_gap',
    label: 'Tournament and qualifier rounds against practice rounds, strokes to par per round',
    unit: 'strokes_per_round',
    direction: 'lower_is_better',
    area: 'pressure',
    level: 'detail',
    basis: 'round_scores',
    estimated: false,
    source: 'golf_rounds score_to_par by round type, as src/clubhouse/data/stats-figures.ts pressureGap (the window with practice kept)',
    compute: pressureGap,
    tour: fromStandards('practice_tournament_delta'),
  },
  {
    id: 'opening_hole',
    label: 'Hole 1 against the other holes, strokes to par per hole',
    unit: 'strokes_per_hole',
    direction: 'lower_is_better',
    area: 'pressure',
    level: 'detail',
    basis: 'scorecard',
    estimated: false,
    source: 'golf_holes hole 1 against holes 2 to 18, as src/clubhouse/data/stats-figures.ts openingDelta',
    compute: openingHole,
    tour: fromStandards('opening_hole_delta'),
  },
];
