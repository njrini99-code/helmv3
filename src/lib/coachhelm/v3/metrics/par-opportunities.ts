/**
 * Par/length scoring + par-5 first-putt opportunity metrics
 * (repair-plan addendum §13, work package A3).
 *
 * Pure — no I/O, no DB. Consumes the A1 pure-core types (`ShotFact`,
 * `HoleContext`, `AnalysisScope`) and `buildHoleSequence`; nothing here is
 * wired into a generator, composite, or the feed (that is a later slice —
 * see the file header of `par-type.ts` / `course-mgmt.ts` for the existing
 * DB-backed generators this is NOT replacing yet).
 *
 * Two independent metric families:
 *
 *   1. `par_length_scoring` — average strokes-relative-to-par, grouped by
 *      par and a length band within that par. Bands are CONSTANT, versioned
 *      yardage cutoffs (`PAR_LENGTH_BANDS`, `PAR_LENGTH_BAND_VERSION`) — not
 *      derived from any player's data — so a boundary is the same fixed
 *      label under a lifetime, a recent, or an as-of scope, and can be
 *      printed to a coach ("380-429 yd") rather than silently drifting as
 *      more rounds arrive. Identity-agnostic: a hole with no `course_id`
 *      still counts here, because "unknown identity prevents cross-round
 *      specific-hole aggregation; it does not prevent par/length
 *      aggregation" (addendum §4.4). The broad `'all'` row is always
 *      emitted; a band row is only added when it clears
 *      `PAR_LENGTH_MIN_SAMPLE_N` on its own — an under-supported band is
 *      simply absent, folded back into `'all'`.
 *
 *   2. `par5_regulation_opportunity_rate` / `par5_green_in_two_rate` /
 *      `par5_putting_conversion_rate` — SPECIFIC-hole metrics, one row per
 *      `holeIdentityKey()`. A hole with no `course_id` is excluded from this
 *      family entirely (never merged by bare `hole_number` — the addendum
 *      §6.3 / course-mgmt.ts defect this mirrors). "Opportunity" (reaching
 *      the green in regulation or better), "green in two" (reaching it in
 *      `par - 3` — an eagle look, strictly rarer than regulation), and
 *      "conversion" (finishing birdie-or-better, read from
 *      `HoleContext.total_strokes - par <= -1` — the AUTHORITATIVE final
 *      score, never a per-putt make/miss tag, since a complete sequence can
 *      still carry no putt-level make/miss data) are three deliberately
 *      SEPARATE rows — a player can create an opportunity and miss the
 *      putt, and green-in-two is its own narrower opportunity, never folded
 *      into the conversion rate.
 *
 * Neither family reads `ShotFact.intent`: reaching the green in regulation
 * is read from the recorded OUTCOME (`result`/`shot_number`), never from
 * whether a shot was tagged `'go_for_green'` vs `'layup'`. A2's future
 * distance-based intent inference is explicitly out of scope here (see
 * `ShotIntent`'s doc comment in `context/types.ts`) — an ambiguous second
 * shot on a par 5 stays ambiguous; this module never resolves it.
 *
 * Neither family computes a `strokes_impact`/counterfactual number — that
 * would double the impact `par-type.ts`'s existing per-par cards already own
 * (addendum: "link par findings to their supporting distance/sequence
 * claims without adding their impact twice"). Wiring this into a generator,
 * and reconciling impact ownership when that happens, is a later slice.
 *
 * `MetricResult`/`MetricStatus` live in `./types.ts` — shared with A2
 * (`distance-profile.ts`) rather than each metrics package exporting its
 * own row shape. Re-exported here for existing callers/tests.
 */

import type { AnalysisScope, HoleContext, ShotFact } from '../context/types';
import { holeIdentityKey } from '../context/types';
import { buildHoleSequence } from '../context/build-hole-sequence';
import type { MetricResult, MetricStatus } from './types';

export type { MetricResult, MetricStatus } from './types';

const PAR_LENGTH_MIN_SAMPLE_N = 5;
const HOLE_OPPORTUNITY_MIN_SAMPLE_N = 3;

export type ParValue = 3 | 4 | 5;
type ParLengthGroup = 'all' | 'short' | 'mid' | 'long';

export interface ParLengthBand {
  label: 'short' | 'mid' | 'long';
  /** Inclusive lower bound in yards. */
  minYards: number;
  /** Inclusive upper bound in yards; `null` = no upper bound. */
  maxYards: number | null;
}

/**
 * Bump this whenever `PAR_LENGTH_BANDS` changes. Carried on every band row's
 * `dimensions.band_version` so a stored/displayed row can be told apart from
 * one computed under a different cutoff set later (addendum: "compare future
 * opportunities without silently changing band boundaries"). These specific
 * cutoffs (par 3 <150/150-189/190+, par 4 <380/380-429/430+, par 5
 * <500/500-539/540+) are consistent with the existing single-threshold
 * "long hole" labels already in `v2/mining/course-management.ts`
 * (par 3 ≥190yd, par 4 ≥400/425yd, par 5 ≥540yd) rather than inventing an
 * unrelated cut.
 */
export const PAR_LENGTH_BAND_VERSION = 'par-length-bands-v1';

export const PAR_LENGTH_BANDS: Record<ParValue, readonly ParLengthBand[]> = {
  3: [
    { label: 'short', minYards: 0, maxYards: 149 },
    { label: 'mid', minYards: 150, maxYards: 189 },
    { label: 'long', minYards: 190, maxYards: null },
  ],
  4: [
    { label: 'short', minYards: 0, maxYards: 379 },
    { label: 'mid', minYards: 380, maxYards: 429 },
    { label: 'long', minYards: 430, maxYards: null },
  ],
  5: [
    { label: 'short', minYards: 0, maxYards: 499 },
    { label: 'mid', minYards: 500, maxYards: 539 },
    { label: 'long', minYards: 540, maxYards: null },
  ],
};

/**
 * The constant length band (`PAR_LENGTH_BANDS`) a hole falls in, or null when
 * the par is not 3/4/5 or the yardage is not recorded. Shared with
 * `engine/context-narrowing.ts` so a "long par 3" means the same yardages on
 * the par-length rows and in a root-cause narrowing.
 */
export function parLengthBandOf(par: number, yardage: number | null): ParLengthBand['label'] | null {
  if (par !== 3 && par !== 4 && par !== 5) return null;
  if (yardage === null || !Number.isFinite(yardage) || yardage <= 0) return null;
  const band = PAR_LENGTH_BANDS[par].find(
    (b) => yardage >= b.minYards && (b.maxYards === null || yardage <= b.maxYards),
  );
  return band?.label ?? null;
}

function statusFor(denominator: number, minN: number): MetricStatus {
  if (denominator === 0) return 'invalid';
  return denominator >= minN ? 'supported' : 'insufficient';
}

/**
 * Filter SHOT FACTS to the scope's window + as-of cutoff. Used ONLY by
 * Family 2 (`par5_regulation_opportunity_rate` / `par5_green_in_two_rate` /
 * `par5_putting_conversion_rate`), which reads `ShotFact.observed_at`. A
 * fact observed after `analysis_cutoff` is excluded even when it falls
 * inside `[window_start, window_end]` (mirrors `AnalysisScope`'s doc
 * comment in `context/types.ts`) — this pure function enforces that scope
 * itself rather than trusting a caller to have pre-filtered `facts`, since
 * nothing upstream of it (a live adapter) exists yet.
 *
 * This does NOT, and cannot, scope Family 1 (`par_length_scoring`):
 * `HoleContext` carries no date field at all. See `computeParLengthScoring`'s
 * doc comment below for that family's (different) scope contract.
 *
 * Exported so `sequence-attribution.ts`'s scope-wide rollup (A4 slice 2) can
 * reuse this exact filter rather than defining a second, possibly-drifting
 * copy of the same window/cutoff logic — both modules read `ShotFact`
 * timestamps the same way.
 */
export function factsInScope(facts: readonly ShotFact[], scope: AnalysisScope): ShotFact[] {
  const cutoff = Date.parse(scope.analysis_cutoff);
  const start = scope.window_start;
  const end = scope.window_end;
  return facts.filter((f) => {
    const observed = Date.parse(f.observed_at);
    // A cutoff/observed_at that fails to parse is deliberately NOT excluded
    // here (both `Number.isFinite` checks below fail closed on the
    // COMPARISON, not on the fact) — normalize-shot.ts/build-hole-sequence.ts
    // already treat malformed input as a validation finding elsewhere in
    // this pipeline; this filter's job is only the well-formed-date case, so
    // it fails open rather than silently dropping every fact whenever one
    // timestamp is unparseable.
    if (Number.isFinite(cutoff) && Number.isFinite(observed) && observed > cutoff) return false;
    const day = f.observed_at.slice(0, 10);
    if (start !== null && day < start) return false;
    if (end !== null && day > end) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Family 1 — par/length scoring (identity-agnostic; broad-group fallback)
// ---------------------------------------------------------------------------

function toParRow(
  scope: AnalysisScope,
  par: ParValue,
  lengthGroup: ParLengthGroup,
  holesInGroup: readonly HoleContext[],
  band: ParLengthBand | null,
): MetricResult {
  const denominator = holesInGroup.length;
  const numerator = holesInGroup.reduce((sum, h) => sum + (h.total_strokes - h.par), 0);
  const dimensions: Record<string, string | number> = { par, length_group: lengthGroup };
  if (band !== null) {
    dimensions.band_version = PAR_LENGTH_BAND_VERSION;
    dimensions.band_min_yards = band.minYards;
    if (band.maxYards !== null) dimensions.band_max_yards = band.maxYards;
  }
  return {
    scope,
    dimensions,
    metricId: 'par_length_scoring',
    unit: 'strokes',
    value: denominator > 0 ? numerator / denominator : null,
    numerator: denominator > 0 ? numerator : null,
    denominator,
    eligibleCount: denominator,
    observedCount: denominator,
    distinctRounds: new Set(holesInGroup.map((h) => h.round_id)).size,
    status: statusFor(denominator, PAR_LENGTH_MIN_SAMPLE_N),
    exclusions: {},
  };
}

/**
 * Broad `'all'` row first (always), then a row per CONSTANT length band that
 * clears `PAR_LENGTH_MIN_SAMPLE_N` on its own — an under-supported band is
 * simply absent (folded back into `'all'`), never padded out or merged with
 * a neighbor. Length-band BOUNDARIES never depend on `holes` or `scope` —
 * they are compile-time constants, not derived from data — so the same
 * par's boundaries are byte-identical no matter which `AnalysisScope` object
 * is passed in (see `par-opportunities.test.ts`'s band-boundary-stability
 * case).
 *
 * SCOPE CONTRACT: this function does NOT, and cannot, filter `holes` by
 * `scope.window_start`/`window_end`/`analysis_cutoff` — `HoleContext` has no
 * date field to filter on (see its doc comment in `context/types.ts`).
 * `holes` MUST already be scope-filtered (window, cutoff, and
 * completed-round status) by the caller before reaching this function.
 * `load-player-context.ts` (#1986) is the intended enforcer of that
 * contract once it lands; until then, passing an unscoped `holes` array
 * silently produces a lifetime aggregate regardless of `scope`.
 */
function computeParLengthScoring(holes: readonly HoleContext[], scope: AnalysisScope): MetricResult[] {
  const rows: MetricResult[] = [];
  for (const par of [3, 4, 5] as const) {
    const holesOfPar = holes.filter((h) => h.par === par);
    if (holesOfPar.length === 0) continue;

    rows.push(toParRow(scope, par, 'all', holesOfPar, null));

    for (const band of PAR_LENGTH_BANDS[par]) {
      const holesInBand = holesOfPar.filter(
        (h) => h.yardage !== null && h.yardage >= band.minYards && (band.maxYards === null || h.yardage <= band.maxYards),
      );
      if (holesInBand.length >= PAR_LENGTH_MIN_SAMPLE_N) {
        rows.push(toParRow(scope, par, band.label, holesInBand, band));
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Family 2 — par-5 first-putt opportunity + putting conversion (specific-hole)
// ---------------------------------------------------------------------------

/** Whether a shot's outcome counts as "reached the green" — mirrors
 *  `engine/shot-source.ts`'s sand-save `reached` predicate exactly (lines
 *  337-339 there): `result` in `'green' | 'hole' | 'gir'`, OR
 *  `lie_after === 'green'`, both matched case-insensitively. `'hole'` MUST
 *  be included: a par-5 hole-out from OFF the green (an albatross via a
 *  holed 2nd shot, or an eagle via a holed 3rd-shot chip-in) is the best
 *  possible outcome, and has to count as reaching the green at that shot's
 *  number — a generator that only matched `'green'`/`'gir'` would score the
 *  best outcome on the hole as a miss, since it never separately logged a
 *  green-finding result before going in. */
function reachedGreen(s: ShotFact): boolean {
  const result = (s.result ?? '').toLowerCase();
  return (
    result === 'green' ||
    result === 'hole' ||
    result === 'gir' ||
    (s.lie_after ?? '').toLowerCase() === 'green'
  );
}

/** The recorded `shot_number` of the shot that first reaches the green (see
 *  `reachedGreen`), or `null` if none did. `shot_number` already counts
 *  every recorded shot in order INCLUDING penalty rows (see
 *  `buildHoleSequence`'s penalty-representation check), so a penalty
 *  earlier in the hole automatically pushes this number up — no special
 *  case needed for "third shot reaches green after a penalty" (fixture
 *  matrix): the shot's true `shot_number` already reflects the penalty. */
function greenReachedAtShotNumber(shots: readonly ShotFact[]): number | null {
  const greenShot = shots.find(reachedGreen);
  return greenShot?.shot_number ?? null;
}

/** Regulation for a par-5 birdie/eagle putt: green reached within `par - 2`
 *  recorded shots. */
function reachedGreenInRegulationOrBetter(shots: readonly ShotFact[], par: number): boolean {
  const n = greenReachedAtShotNumber(shots);
  return n !== null && n <= par - 2;
}

/** "Green in two" — a strictly narrower, eagle-look opportunity: green
 *  reached within `par - 3` recorded shots. Kept as its own metric row,
 *  never folded into the regulation opportunity rate or the putting
 *  conversion rate — a player can create a regulation opportunity without
 *  ever having had a green-in-two look, and the two rates answer different
 *  coaching questions (bogey-avoidance sequencing vs eagle-hunting). */
function reachedGreenInTwo(shots: readonly ShotFact[], par: number): boolean {
  const n = greenReachedAtShotNumber(shots);
  return n !== null && n <= par - 3;
}

interface HoleGroup {
  identityKey: string;
  courseId: string;
  holeNumber: number;
  plays: HoleContext[];
}

function groupPar5sByIdentity(holes: readonly HoleContext[]): {
  groups: HoleGroup[];
  identityUnknownCount: number;
} {
  const par5s = holes.filter((h) => h.par === 5);
  const byKey = new Map<string, HoleGroup>();
  let identityUnknownCount = 0;
  for (const h of par5s) {
    const key = holeIdentityKey(h);
    if (key === null) {
      identityUnknownCount += 1;
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.plays.push(h);
    } else {
      // `key` is non-null here, so `h.course_id` is non-null too.
      byKey.set(key, { identityKey: key, courseId: h.course_id as string, holeNumber: h.hole_number, plays: [h] });
    }
  }
  return { groups: [...byKey.values()], identityUnknownCount };
}

function computePar5Opportunities(
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  scope: AnalysisScope,
): MetricResult[] {
  const inScopeFacts = factsInScope(facts, scope);
  const { groups } = groupPar5sByIdentity(holes);
  const rows: MetricResult[] = [];

  for (const group of groups) {
    let eligible = 0;
    let created = 0;
    let greenInTwo = 0;
    let converted = 0;
    let incompleteSequence = 0;
    let outOfScope = 0;
    // Rounds among the CREATED-opportunity subset — collected in this same
    // pass so `par5_putting_conversion_rate`'s `distinctRounds` never needs
    // a second `buildHoleSequence` call over the same plays.
    const createdRoundIds: string[] = [];

    for (const play of group.plays) {
      const hadAnyFacts = facts.some(
        (f) => f.round_id === play.round_id && f.hole_number === play.hole_number,
      );
      const hasInScopeFacts = inScopeFacts.some(
        (f) => f.round_id === play.round_id && f.hole_number === play.hole_number,
      );
      if (hadAnyFacts && !hasInScopeFacts) {
        // Every fact this play ever had was cut by the window/cutoff — a
        // SCOPE decision (the round happened, but outside what this call was
        // asked about), not a data-quality gap. Kept as its own exclusion
        // reason so a reader can tell "excluded on purpose by the scope"
        // apart from "the recorded sequence itself is broken" below. A play
        // with NO facts at all (never recorded, not a scope question) falls
        // through to `buildHoleSequence`, which reports it via its own
        // `no_shots_recorded` reason under `incomplete_sequence`.
        outOfScope += 1;
        continue;
      }
      const sequence = buildHoleSequence(inScopeFacts, play);
      if (!sequence.complete) {
        incompleteSequence += 1;
        continue;
      }
      eligible += 1;
      const opportunityCreated = reachedGreenInRegulationOrBetter(sequence.shots, play.par);
      if (opportunityCreated) {
        created += 1;
        createdRoundIds.push(play.round_id);
        // Conversion ("birdie-or-better") is read from the AUTHORITATIVE
        // `HoleContext.total_strokes - par`, never from shot-level putt
        // make/miss: a hole can have a complete sequence (order, termination,
        // and penalty representation all check out) with no per-putt
        // make/miss tag recorded at all, and `total_strokes` is non-nullable
        // BY CONTRACT for any constructed `HoleContext` (see its doc
        // comment) — it is always the more reliable source of "how many
        // strokes did this hole actually take" than counting putts.
        if (play.total_strokes - play.par <= -1) converted += 1;
      }
      if (reachedGreenInTwo(sequence.shots, play.par)) greenInTwo += 1;
    }

    const dimensions = {
      course_hole_key: group.identityKey,
      course_id: group.courseId,
      hole_number: group.holeNumber,
      par: 5,
    };

    const eligibilityExclusions: Record<string, number> = {};
    if (incompleteSequence > 0) eligibilityExclusions.incomplete_sequence = incompleteSequence;
    if (outOfScope > 0) eligibilityExclusions.out_of_scope = outOfScope;

    rows.push({
      scope,
      dimensions,
      metricId: 'par5_regulation_opportunity_rate',
      unit: 'percent',
      value: eligible > 0 ? (100 * created) / eligible : null,
      numerator: eligible > 0 ? created : null,
      denominator: eligible,
      eligibleCount: eligible,
      observedCount: group.plays.length,
      distinctRounds: new Set(group.plays.map((h) => h.round_id)).size,
      status: statusFor(eligible, HOLE_OPPORTUNITY_MIN_SAMPLE_N),
      exclusions: eligibilityExclusions,
    });

    rows.push({
      scope,
      dimensions,
      metricId: 'par5_green_in_two_rate',
      unit: 'percent',
      value: eligible > 0 ? (100 * greenInTwo) / eligible : null,
      numerator: eligible > 0 ? greenInTwo : null,
      denominator: eligible,
      eligibleCount: eligible,
      observedCount: group.plays.length,
      distinctRounds: new Set(group.plays.map((h) => h.round_id)).size,
      status: statusFor(eligible, HOLE_OPPORTUNITY_MIN_SAMPLE_N),
      exclusions: eligibilityExclusions,
    });

    rows.push({
      scope,
      dimensions,
      metricId: 'par5_putting_conversion_rate',
      unit: 'percent',
      value: created > 0 ? (100 * converted) / created : null,
      numerator: created > 0 ? converted : null,
      denominator: created,
      eligibleCount: created,
      observedCount: created,
      distinctRounds: new Set(createdRoundIds).size,
      status: statusFor(created, HOLE_OPPORTUNITY_MIN_SAMPLE_N),
      exclusions: {},
    });
  }

  return rows;
}

/**
 * Compute the A3 par/length + par-5 opportunity metric families. Pure: takes
 * a snapshot of normalized facts + hole totals + scope, returns rows. Never
 * mutates its inputs, never reaches a database.
 *
 * SCOPE CONTRACT: `facts` is self-scoped by this function (see
 * `factsInScope`). `holes` is NOT — `HoleContext` has no date field, so
 * `holes` must already be window/cutoff/completed-status-filtered by the
 * caller (see `computeParLengthScoring`'s doc comment).
 */
export function computeParOpportunities(
  facts: ShotFact[],
  holes: HoleContext[],
  scope: AnalysisScope,
): MetricResult[] {
  return [...computeParLengthScoring(holes, scope), ...computePar5Opportunities(facts, holes, scope)];
}
