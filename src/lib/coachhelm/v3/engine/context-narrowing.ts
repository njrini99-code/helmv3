/**
 * Context narrowing — pure core (no DB, no clock, no server imports).
 *
 * Makes a leak's root cause LENGTH-, PAR- and SHAPE-aware, one evidence-gated
 * step at a time, and stops at the last step the data supports:
 *
 *   1. LENGTH  the failing population is big enough to read at all (an
 *              approach distance band, par-4/5 tee shots, one par's holes).
 *   2. PAR     the failures concentrate on one par × length slice ("long
 *              par 3s", "par 5s") — see {@link evaluateSlice}.
 *   3. SHAPE   the misses in that slice (or in the whole population when the
 *              par step failed) lean one way — see {@link evaluateShape}.
 *
 * Every step states its counts ("9 of 13"). A failed population step ends
 * the narrowing; a failed par step means the shape is read over the whole
 * population instead of a slice (still inside the last supported level);
 * every failure is stated with its reason. The output is an
 * OBSERVED CONCENTRATION, never a cause: the record holds where the ball
 * finished, not why (club, wind, target and intent are not recorded).
 *
 * Gates (constants below, each tested at pass / fail / boundary):
 * - population: >= NARROW_MIN_ATTEMPTS attempts over >= NARROW_MIN_ROUNDS
 *   rounds (A2's own distance-profile floors) and >= NARROW_MIN_FAILURES
 *   failures.
 * - slice: >= NARROW_MIN_FAILURES failures in the slice, AND either
 *     (share)  it holds >= NARROW_MIN_SHARE of the population's failures and
 *              fails MORE often than the rest of the population, or
 *     (lift)   its failure rate is >= NARROW_MIN_LIFT × the rest's and at
 *              least NARROW_MIN_LIFT_POINTS higher, with the rest holding
 *              >= NARROW_MIN_REST_ATTEMPTS attempts.
 *   Share alone is exposure, not weakness: a player who plays most long
 *   approaches on par 3s will have most of those misses there even when par
 *   3s are where they miss LEAST. The rate condition on the share path is
 *   what stops that reading (the 49ffe06d calibration case in the tests).
 * - shape: >= SHAPE_MIN_COVERED misses carry a recorded direction and they
 *   are >= SHAPE_MIN_COVERAGE of the misses; per axis (short/long,
 *   left/right) the leading side needs >= SHAPE_MIN_AXIS_N directional
 *   readings, >= SHAPE_MIN_SHARE of them, and strictly more than the other
 *   side. "short-right" is only said when BOTH axes pass on their own.
 *
 * APPROACH ELIGIBILITY mirrors A2 (`metrics/distance-profile.ts`): only
 * `shot_type = 'approach'` shots are banded, and on the 175+ band a par-5
 * shot that did not find the green is left out as a likely lay-up, as is a
 * shot whose hole par is unknown. Both exclusions are counted and stated.
 *
 * CLIENT-SAFE: type-only imports plus pure helpers, so view-model code may
 * import it too.
 */

import type { HoleContext, ShotFact } from '../context/types';
import { parLengthBandOf, type ParLengthBand } from '../metrics/par-opportunities';
import { classifyMiss } from './diagnosis';

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** Population floors — the same values as A2's `MIN_ATTEMPTS`/`MIN_ROUNDS`. */
export const NARROW_MIN_ATTEMPTS = 10;
export const NARROW_MIN_ROUNDS = 3;
/** Fewest failures a population or a slice must hold to be named. */
export const NARROW_MIN_FAILURES = 8;
/** Share of the population's failures a slice must hold (share path). */
export const NARROW_MIN_SHARE = 0.6;
/** Slice failure rate ÷ rest failure rate (lift path). */
export const NARROW_MIN_LIFT = 1.25;
/** Slice failure rate − rest failure rate, as a fraction (lift path). */
export const NARROW_MIN_LIFT_POINTS = 0.1;
/** Fewest attempts the rest of the population needs for a lift to mean anything. */
export const NARROW_MIN_REST_ATTEMPTS = 8;
/** Fewest misses with a recorded direction before a shape is read. */
export const SHAPE_MIN_COVERED = 8;
/** Share of misses that must carry a direction. */
export const SHAPE_MIN_COVERAGE = 0.7;
/** Fewest directional readings on one axis before that axis is read. */
export const SHAPE_MIN_AXIS_N = 6;
/** Share of an axis's directional readings the leading side must hold. */
export const SHAPE_MIN_SHARE = 0.6;

// ---------------------------------------------------------------------------
// Bands and labels
// ---------------------------------------------------------------------------

export type NarrowBand = '50_125ft' | '125_175ft' | '175_plus_ft';

export const NARROW_BANDS: readonly NarrowBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

export const NARROW_BAND_LABEL: Record<NarrowBand, string> = {
  '50_125ft': '50–125 yd',
  '125_175ft': '125–175 yd',
  '175_plus_ft': '175+ yd',
};

export function isNarrowBand(v: unknown): v is NarrowBand {
  return typeof v === 'string' && (NARROW_BANDS as readonly string[]).includes(v);
}

/** Band of an approach shot, by distance to the hole before it. Same cuts
 *  as `engine/shot-source.ts`'s `bucketApproachDistance` (A2's `bandOf`),
 *  restated here so this module stays free of server imports. */
export function narrowBandOf(fact: Pick<ShotFact, 'shot_type' | 'distance_to_hole_before_feet'>): NarrowBand | null {
  if (fact.shot_type !== 'approach') return null;
  const feet = fact.distance_to_hole_before_feet;
  if (feet === null || !Number.isFinite(feet)) return null;
  const yards = feet / 3;
  if (yards >= 50 && yards < 125) return '50_125ft';
  if (yards >= 125 && yards < 175) return '125_175ft';
  if (yards >= 175) return '175_plus_ft';
  return null;
}

export type LengthGroup = ParLengthBand['label'];

export interface SliceKey {
  par: 3 | 4 | 5;
  /** null = the par as a whole (every length). */
  length: LengthGroup | null;
}

export function sliceId(k: SliceKey): string {
  return `par${k.par}${k.length ? `_${k.length}` : ''}`;
}

/** "long par 3s" / "par 5s". */
export function sliceLabel(k: SliceKey): string {
  return `${k.length ? `${k.length} ` : ''}par ${k.par}s`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function rounds(n: number): string {
  return n === 1 ? '1 round' : `${n} rounds`;
}

// ---------------------------------------------------------------------------
// Items — one checked situation (an approach, a tee shot, a hole)
// ---------------------------------------------------------------------------

export interface NarrowItem {
  round_id: string;
  par: number;
  length: LengthGroup | null;
  failed: boolean;
  /** Recorded miss direction of the failing shot (null when not recorded or
   *  not failed). */
  direction: string | null;
}

// ---------------------------------------------------------------------------
// Step 2 — slice gate
// ---------------------------------------------------------------------------

export interface SliceCheck {
  key: SliceKey;
  label: string;
  attempts: number;
  failures: number;
  restAttempts: number;
  restFailures: number;
  /** Slice failures ÷ population failures. */
  share: number;
  rate: number;
  /** null when the rest of the population is empty. */
  restRate: number | null;
  passed: boolean;
  via: 'share' | 'lift' | null;
}

/**
 * The slice gate (see module doc). Pure and exported so each branch is
 * tested on its own. A slice that IS the whole population (no rest) is not a
 * narrowing and never passes.
 */
export function evaluateSlice(
  key: SliceKey,
  slice: { attempts: number; failures: number },
  total: { attempts: number; failures: number },
): SliceCheck {
  const restAttempts = total.attempts - slice.attempts;
  const restFailures = total.failures - slice.failures;
  const rate = slice.attempts > 0 ? slice.failures / slice.attempts : 0;
  const restRate = restAttempts > 0 ? restFailures / restAttempts : null;
  const share = total.failures > 0 ? slice.failures / total.failures : 0;
  let via: SliceCheck['via'] = null;
  if (slice.failures >= NARROW_MIN_FAILURES && restAttempts > 0 && restRate !== null) {
    if (share >= NARROW_MIN_SHARE && rate > restRate) via = 'share';
    else if (
      restAttempts >= NARROW_MIN_REST_ATTEMPTS &&
      rate >= NARROW_MIN_LIFT * restRate &&
      rate - restRate >= NARROW_MIN_LIFT_POINTS - 1e-9
    ) {
      via = 'lift';
    }
  }
  return {
    key,
    label: sliceLabel(key),
    attempts: slice.attempts,
    failures: slice.failures,
    restAttempts,
    restFailures,
    share,
    rate,
    restRate,
    passed: via !== null,
    via,
  };
}

/**
 * Every par × length slice, then every whole-par slice, checked against the
 * population. The chosen slice is the passing one with the most failures
 * (then the higher rate, then the more specific key, then id) — a par ×
 * length slice beats its own whole par on a tie because it says more.
 */
export function pickSlice(items: readonly NarrowItem[]): { chosen: SliceCheck | null; checks: SliceCheck[] } {
  const total = { attempts: items.length, failures: items.filter((i) => i.failed).length };
  const tallies = new Map<string, { key: SliceKey; attempts: number; failures: number }>();
  const bump = (key: SliceKey, failed: boolean) => {
    const id = sliceId(key);
    const t = tallies.get(id) ?? { key, attempts: 0, failures: 0 };
    t.attempts += 1;
    if (failed) t.failures += 1;
    tallies.set(id, t);
  };
  for (const it of items) {
    if (it.par !== 3 && it.par !== 4 && it.par !== 5) continue;
    bump({ par: it.par, length: null }, it.failed);
    if (it.length) bump({ par: it.par, length: it.length }, it.failed);
  }
  const checks = [...tallies.values()].map((t) => evaluateSlice(t.key, t, total));
  const passing = checks
    .filter((c) => c.passed)
    .sort(
      (a, b) =>
        b.failures - a.failures ||
        b.rate - a.rate ||
        (a.key.length === null ? 1 : 0) - (b.key.length === null ? 1 : 0) ||
        sliceId(a.key).localeCompare(sliceId(b.key)),
    );
  return { chosen: passing[0] ?? null, checks };
}

// ---------------------------------------------------------------------------
// Step 3 — shape gate
// ---------------------------------------------------------------------------

export type ShortLong = 'short' | 'long';
export type LeftRight = 'left' | 'right';

export interface MissQuadrants {
  short_left: number;
  short: number;
  short_right: number;
  left: number;
  right: number;
  long_left: number;
  long: number;
  long_right: number;
}

export interface ShapeCheck {
  misses: number;
  covered: number;
  coverage: number;
  short: number;
  long: number;
  left: number;
  right: number;
  quadrants: MissQuadrants;
  shortLong: ShortLong | null;
  leftRight: LeftRight | null;
  /** "short-right" / "short" / "right"; null when no axis passes. */
  label: string | null;
  passed: boolean;
  /** Why no shape was stated (empty when passed). */
  reason: string | null;
}

function emptyQuadrants(): MissQuadrants {
  return { short_left: 0, short: 0, short_right: 0, left: 0, right: 0, long_left: 0, long: 0, long_right: 0 };
}

function leading<T extends string>(neg: number, pos: number, negName: T, posName: T): T | null {
  const n = neg + pos;
  if (n < SHAPE_MIN_AXIS_N) return null;
  if (neg > pos && neg / n >= SHAPE_MIN_SHARE) return negName;
  if (pos > neg && pos / n >= SHAPE_MIN_SHARE) return posName;
  return null;
}

/**
 * Read the miss shape of a set of misses. `axes` limits which axes are read
 * (tee shots: left/right only — "short" off the tee is not a miss).
 */
export function evaluateShape(
  directions: readonly (string | null)[],
  axes: { shortLong: boolean; leftRight: boolean } = { shortLong: true, leftRight: true },
): ShapeCheck {
  const misses = directions.length;
  const quadrants = emptyQuadrants();
  let short = 0;
  let long = 0;
  let left = 0;
  let right = 0;
  let covered = 0;
  for (const d of directions) {
    if (d === null || d.trim() === '') continue;
    const c = classifyMiss(d);
    if (c.sl === 'neutral' && c.lr === 'neutral') continue;
    covered += 1;
    const sl = c.sl === 'negative' ? 'short' : c.sl === 'positive' ? 'long' : null;
    const lr = c.lr === 'negative' ? 'left' : c.lr === 'positive' ? 'right' : null;
    if (sl === 'short') short += 1;
    if (sl === 'long') long += 1;
    if (lr === 'left') left += 1;
    if (lr === 'right') right += 1;
    const q = (sl && lr ? `${sl}_${lr}` : (sl ?? lr)) as keyof MissQuadrants;
    quadrants[q] += 1;
  }
  const coverage = misses > 0 ? covered / misses : 0;
  const base = { misses, covered, coverage, short, long, left, right, quadrants };
  if (covered < SHAPE_MIN_COVERED || coverage < SHAPE_MIN_COVERAGE - 1e-9) {
    return {
      ...base,
      shortLong: null,
      leftRight: null,
      label: null,
      passed: false,
      reason: `only ${covered} of ${misses} misses have a recorded direction (need ${SHAPE_MIN_COVERED} and ${pct(SHAPE_MIN_COVERAGE)})`,
    };
  }
  const shortLong = axes.shortLong ? leading(short, long, 'short' as const, 'long' as const) : null;
  const leftRight = axes.leftRight ? leading(left, right, 'left' as const, 'right' as const) : null;
  const label = shortLong && leftRight ? `${shortLong}-${leftRight}` : (shortLong ?? leftRight);
  if (!label) {
    const parts: string[] = [];
    if (axes.shortLong) parts.push(`${short} short, ${long} long`);
    if (axes.leftRight) parts.push(`${left} left, ${right} right`);
    return { ...base, shortLong, leftRight, label: null, passed: false, reason: `no side dominates (${parts.join('; ')})` };
  }
  return { ...base, shortLong, leftRight, label, passed: true, reason: null };
}

/** "9 of 12 short, 8 of 11 right" — the counts behind a shape label. */
export function shapeCounts(s: ShapeCheck): string {
  const parts: string[] = [];
  if (s.shortLong) parts.push(`${s.shortLong === 'short' ? s.short : s.long} of ${s.short + s.long} ${s.shortLong}`);
  if (s.leftRight) parts.push(`${s.leftRight === 'left' ? s.left : s.right} of ${s.left + s.right} ${s.leftRight}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// The narrowing
// ---------------------------------------------------------------------------

export type NarrowSubject = 'approach' | 'tee' | 'par_scoring';
export type NarrowLevel = 'length' | 'par' | 'shape';

export interface NarrowStep {
  level: NarrowLevel;
  passed: boolean;
  /** Path label when passed ("175+ yd", "long par 3s", "short-right"). */
  label: string | null;
  /** The counted statement (passed) or the reason it stopped (failed). */
  statement: string;
}

export interface Narrowing {
  subject: NarrowSubject;
  /** e.g. "approaches from 175+ yd". */
  population: string;
  attempts: number;
  failures: number;
  rounds: number;
  /** Items left out and why (e.g. `{ layup: 49 }`). */
  excluded: Record<string, number>;
  steps: NarrowStep[];
  /** Labels of the passed steps, in order. */
  path: string[];
  /** The level narrowing stopped at; null when every step passed. */
  stoppedAt: NarrowLevel | null;
  /** Chosen slice (step 2), when it passed. */
  slice: SliceCheck | null;
  /** Every slice checked (for the par × length grid). */
  sliceChecks: SliceCheck[];
  /** Shape of the narrowest supported population, when read. */
  shape: ShapeCheck | null;
  /** One plain sentence: observed concentration, never a cause. */
  sentence: string;
}

interface NarrowSpec {
  subject: NarrowSubject;
  population: string;
  /** Label for step 1's path entry. */
  lengthLabel: string;
  /** "missed the green" / "missed the fairway" / "finished over par". */
  failedPhrase: string;
  /** Noun for a failure ("misses", "over-par holes"). */
  failureNoun: string;
  items: NarrowItem[];
  excluded: Record<string, number>;
  excludedNote: string | null;
  shapeAxes: { shortLong: boolean; leftRight: boolean } | null;
  /** Directions to read the shape from, given the chosen slice (or null for
   *  the whole population). Defaults to the failing items' own directions. */
  shapeDirections?: (slice: SliceKey | null) => (string | null)[];
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function narrow(spec: NarrowSpec): Narrowing {
  const { items } = spec;
  const failures = items.filter((i) => i.failed);
  const roundsN = new Set(items.map((i) => i.round_id)).size;
  const steps: NarrowStep[] = [];
  const base = {
    subject: spec.subject,
    population: spec.population,
    attempts: items.length,
    failures: failures.length,
    rounds: roundsN,
    excluded: spec.excluded,
  };

  // Step 1 — the population itself.
  const popOk =
    items.length >= NARROW_MIN_ATTEMPTS && roundsN >= NARROW_MIN_ROUNDS && failures.length >= NARROW_MIN_FAILURES;
  const popStatement = `${failures.length} of ${items.length} ${spec.population} ${spec.failedPhrase} (${rounds(roundsN)})`;
  if (!popOk) {
    steps.push({
      level: 'length',
      passed: false,
      label: null,
      statement: `${popStatement}: too few to narrow (need ${NARROW_MIN_ATTEMPTS} over ${NARROW_MIN_ROUNDS} rounds with ${NARROW_MIN_FAILURES} ${spec.failureNoun})`,
    });
    return finish(spec, base, steps, null, [], null);
  }
  steps.push({ level: 'length', passed: true, label: spec.lengthLabel, statement: popStatement });

  // Step 2 — par × length.
  const { chosen, checks } = pickSlice(items);
  if (chosen) {
    const statement =
      chosen.via === 'share'
        ? `${chosen.failures} of ${failures.length} ${spec.failureNoun} came on ${chosen.label} (${pct(chosen.rate)} there vs ${pct(chosen.restRate ?? 0)} elsewhere)`
        : `on ${chosen.label} ${chosen.failures} of ${chosen.attempts} ${spec.failedPhrase} (${pct(chosen.rate)}), vs ${chosen.restFailures} of ${chosen.restAttempts} elsewhere (${pct(chosen.restRate ?? 0)})`;
    steps.push({ level: 'par', passed: true, label: chosen.label, statement });
  } else {
    steps.push({
      level: 'par',
      passed: false,
      label: null,
      statement: `no par or hole length holds ${NARROW_MIN_FAILURES}+ ${spec.failureNoun} at a clearly higher rate`,
    });
  }

  // Step 3 — shape (of the chosen slice, else of the whole population).
  let shape: ShapeCheck | null = null;
  if (spec.shapeAxes) {
    const dirs = spec.shapeDirections
      ? spec.shapeDirections(chosen?.key ?? null)
      : items
          .filter((i) => i.failed && (!chosen || matches(i, chosen.key)))
          .map((i) => i.direction);
    shape = evaluateShape(dirs, spec.shapeAxes);
    const where = chosen ? ` on ${chosen.label}` : '';
    steps.push(
      shape.passed
        ? {
            level: 'shape',
            passed: true,
            label: shape.label,
            statement: `most misses${where} finish ${shape.label} (${shapeCounts(shape)}; ${shape.covered} of ${shape.misses} with a recorded direction)`,
          }
        : { level: 'shape', passed: false, label: null, statement: `direction not stated${where}: ${shape.reason}` },
    );
  }
  return finish(spec, base, steps, chosen, checks, shape);
}

function matches(i: NarrowItem, k: SliceKey): boolean {
  return i.par === k.par && (k.length === null || i.length === k.length);
}

function finish(
  spec: NarrowSpec,
  base: Pick<Narrowing, 'subject' | 'population' | 'attempts' | 'failures' | 'rounds' | 'excluded'>,
  steps: NarrowStep[],
  slice: SliceCheck | null,
  sliceChecks: SliceCheck[],
  shape: ShapeCheck | null,
): Narrowing {
  // A failed PAR step does not block the SHAPE step: the shape is then read
  // over the whole population ("175+ yd → short"), which is still inside the
  // last supported level. A failed population step ends everything.
  const stoppedAt: NarrowLevel | null = steps.find((s) => !s.passed)?.level ?? null;
  const passed = steps.filter((s) => s.passed).map((s) => s.statement);
  const firstFail = steps.find((s) => !s.passed);
  let sentence = passed.length > 0 ? `Observed, not a cause: ${passed.join('; ')}` : '';
  if (firstFail) sentence = sentence ? `${sentence}. Not narrowed further: ${firstFail.statement}` : `Not narrowed: ${firstFail.statement}`;
  if (spec.excludedNote) sentence = `${sentence}. ${capitalize(spec.excludedNote)}`;
  return {
    ...base,
    steps,
    path: steps.filter((s) => s.passed && s.label).map((s) => s.label!),
    stoppedAt,
    slice,
    sliceChecks,
    shape,
    sentence: `${sentence}.`,
  };
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

function isOnGreen(f: ShotFact): boolean {
  const r = (f.result ?? '').toLowerCase();
  if (r === 'green' || r === 'hole' || r === 'gir') return true;
  if (f.putt_made === true) return true;
  return (f.lie_after ?? '').toLowerCase() === 'green';
}

function holeIndex(holes: readonly HoleContext[]): Map<string, HoleContext> {
  const m = new Map<string, HoleContext>();
  for (const h of holes) m.set(`${h.round_id}:${h.hole_number}`, h);
  return m;
}

export interface BandAttempt extends NarrowItem {
  onGreen: boolean;
  /** On-green finish distance, feet (only when on the green). */
  proximityFeet: number | null;
  severe: boolean;
}

/**
 * A2-eligible approach attempts in one band (see module doc). Exported for
 * the Why view's band metrics and grid.
 */
export function collectBandAttempts(
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  band: NarrowBand,
): { attempts: BandAttempt[]; excluded: Record<string, number> } {
  const byHole = holeIndex(holes);
  const attempts: BandAttempt[] = [];
  const excluded: Record<string, number> = {};
  for (const f of facts) {
    if (f.is_penalty || f.intent === 'layup') continue;
    if (narrowBandOf(f) !== band) continue;
    const hole = f.hole_number === null ? undefined : byHole.get(`${f.round_id}:${f.hole_number}`);
    const onGreen = isOnGreen(f);
    if (!hole) {
      excluded.missing_par = (excluded.missing_par ?? 0) + 1;
      continue;
    }
    if (band === '175_plus_ft' && hole.par === 5 && !onGreen) {
      excluded.layup = (excluded.layup ?? 0) + 1;
      continue;
    }
    const r = (f.result ?? '').toLowerCase();
    attempts.push({
      round_id: f.round_id,
      par: hole.par,
      length: parLengthBandOf(hole.par, hole.yardage),
      failed: !onGreen,
      direction: onGreen ? null : f.miss_direction,
      onGreen,
      proximityFeet: onGreen ? f.distance_to_hole_after_feet : null,
      severe: f.is_penalty || r === 'sand' || r === 'other',
    });
  }
  return { attempts, excluded };
}

/** Approaches from one distance band → par × length → miss shape. */
export function narrowApproach(
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  band: NarrowBand,
): Narrowing {
  const { attempts, excluded } = collectBandAttempts(facts, holes, band);
  const layups = excluded.layup ?? 0;
  return narrow({
    subject: 'approach',
    population: `approaches from ${NARROW_BAND_LABEL[band]}`,
    lengthLabel: NARROW_BAND_LABEL[band],
    failedPhrase: 'missed the green',
    failureNoun: 'misses',
    items: attempts,
    excluded,
    excludedNote:
      layups > 0
        ? `${layups} par-5 shot${layups === 1 ? '' : 's'} from ${NARROW_BAND_LABEL[band]} that did not find the green ${layups === 1 ? 'is' : 'are'} left out as likely lay-ups`
        : null,
    shapeAxes: { shortLong: true, leftRight: true },
  });
}

function isFairway(f: ShotFact): boolean | null {
  const where = (f.lie_after ?? f.result ?? '').toLowerCase();
  if (!where) return null;
  return where === 'fairway';
}

/** Tee shots on par 4s and 5s → par × length → left/right shape. */
export function narrowTee(facts: readonly ShotFact[], holes: readonly HoleContext[]): Narrowing {
  const byHole = holeIndex(holes);
  const items: NarrowItem[] = [];
  let unknown = 0;
  for (const f of facts) {
    if (f.is_penalty || f.shot_type !== 'tee') continue;
    const hole = f.hole_number === null ? undefined : byHole.get(`${f.round_id}:${f.hole_number}`);
    if (!hole || (hole.par !== 4 && hole.par !== 5)) continue;
    const fw = isFairway(f);
    if (fw === null) {
      unknown += 1;
      continue;
    }
    items.push({
      round_id: f.round_id,
      par: hole.par,
      length: parLengthBandOf(hole.par, hole.yardage),
      failed: !fw,
      direction: fw ? null : f.miss_direction,
    });
  }
  return narrow({
    subject: 'tee',
    population: 'tee shots on par 4s and 5s',
    lengthLabel: 'par 4 and 5 tee shots',
    failedPhrase: 'missed the fairway',
    failureNoun: 'missed fairways',
    items,
    excluded: unknown > 0 ? { no_finish_recorded: unknown } : {},
    excludedNote: null,
    shapeAxes: { shortLong: false, leftRight: true },
  });
}

/**
 * One par's holes → hole length → (par 3 only) the tee shot's miss shape on
 * the over-par holes. Par 4/5 stop at the length step: the shot that cost
 * the hole is not one fixed shot there.
 */
export function narrowParScoring(
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  par: 3 | 4 | 5,
): Narrowing {
  const ofPar = holes.filter((h) => h.par === par);
  const items: NarrowItem[] = ofPar.map((h) => ({
    round_id: h.round_id,
    par: h.par,
    length: parLengthBandOf(h.par, h.yardage),
    failed: h.total_strokes > h.par,
    direction: null,
  }));
  // Par-3 shape: the first non-penalty shot on each over-par hole that
  // missed the green (the tee shot is the green attempt on a par 3, however
  // the tracker typed it).
  const firstShot = new Map<string, ShotFact>();
  if (par === 3) {
    for (const f of facts) {
      if (f.is_penalty || f.hole_number === null || f.shot_number === null) continue;
      const k = `${f.round_id}:${f.hole_number}`;
      const cur = firstShot.get(k);
      if (!cur || (cur.shot_number ?? 99) > f.shot_number) firstShot.set(k, f);
    }
  }
  return narrow({
    subject: 'par_scoring',
    population: `par ${par}s`,
    lengthLabel: `par ${par}s`,
    failedPhrase: 'finished over par',
    failureNoun: 'over-par holes',
    items,
    excluded: {},
    excludedNote: null,
    shapeAxes: par === 3 ? { shortLong: true, leftRight: true } : null,
    shapeDirections: (slice) =>
      ofPar
        .filter((h) => h.total_strokes > h.par)
        .filter((h) => !slice || slice.length === null || parLengthBandOf(h.par, h.yardage) === slice.length)
        .map((h) => firstShot.get(`${h.round_id}:${h.hole_number}`))
        .filter((s): s is ShotFact => !!s && !isOnGreen(s))
        .map((s) => s.miss_direction),
  });
}
