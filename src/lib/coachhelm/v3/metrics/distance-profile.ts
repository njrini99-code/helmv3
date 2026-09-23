/**
 * A2 distance profile (repair-plan addendum §13, A2 — pure metrics only,
 * no DB, no generator wiring). Computes five per-band metrics over
 * normalized `ShotFact[]` (the A1 pure core), reusing the all-shot
 * proximity semantics Package 7B / addendum A2 already shipped on main
 * (`supabase/migrations/20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql`):
 * the same three yard bands, the same on-green predicate, the same
 * 175+ yd par-5 lay-up exclusion, and the same MIN_ATTEMPTS/MIN_ROUNDS
 * support floor.
 *
 * `MetricResult`/`MetricStatus` live in `./types.ts` — shared with A3
 * (`par-opportunities.ts`) rather than this package exporting its own row
 * shape. This module predated that file with its own `id`/`band`/
 * `playerId`-shaped `MetricResult`; this is the reconciliation, following
 * `par-opportunities.ts`'s own construction pattern (`statusFor`,
 * non-zero-only `exclusions`, `value` computed whenever `denominator > 0`
 * regardless of `status`) rather than inventing an independent convention.
 *
 * ── SCOPE: approach shots only ──────────────────────────────────────────
 * The band system (50-125 / 125-175 / 175+ yd) is an approach-shot concept
 * (mirrors `ApproachMissGenerator`'s own scope) — a putt or a tee shot never
 * enters a band here, regardless of its distance.
 *
 * ── WHY `holes: HoleContext[]` IS A REQUIRED THIRD ARGUMENT ─────────────
 * The lay-up heuristic (`is_likely_layup` in the migration above) needs the
 * hole's PAR, but `ShotFact` — A1's pure-core type — carries no `par`
 * field (it only exists on `HoleContext`). `computeDistanceProfile` takes
 * the caller's `HoleContext[]` (e.g. from `load-player-context.ts`, which
 * already returns one alongside `ShotFact[]`) and builds a
 * `round_id:hole_number → par` lookup internally.
 *
 * A 175+ yd shot whose hole is NOT resolvable from `holes` (no matching
 * `HoleContext` — a genuine gap, or the hole was excluded upstream) is
 * excluded from the band outright, with reason `missing_par` — it is
 * NEVER silently kept as "probably not a lay-up." This is a real behavior
 * change from an earlier draft of this module, which treated an
 * unresolvable par the same as a confirmed non-par-5: that silently
 * counted evidence this module cannot actually vouch for. Only a shot
 * with a CONFIRMED par is ever included in the 175+ band's eligible set,
 * and only a CONFIRMED par-5 miss is excluded as a lay-up — the
 * migration's own `IS NOT DISTINCT FROM 5` NULL-safety rule, now enforced
 * on the exclusion side (`missing_par`) instead of the inclusion side.
 *
 * ── WHY `miss_direction` NEEDED ADDING TO `ShotFact` ─────────────────────
 * Direction coverage needs `golf_shots.miss_direction`, which A1's original
 * `ShotFact` didn't carry (only `ApproachShot`, in `shot-source.ts`, did).
 * It's a small, additive, raw-passthrough field (`types.ts`), threaded
 * through `normalize-shot.ts`, `load-player-context.ts`, and the
 * shot-source adapter — the same kind of incremental extension `putt_made`
 * went through in the #1981 review round.
 *
 * ── THE FIVE METRIC IDS (interpretation, documented for review) ─────────
 * The addendum names these five distinct ids without giving exact
 * denominators for each; the definitions below are this slice's concrete
 * reading, grounded in what's already shipped and open to correction:
 *
 *   - `approach_green_hit_rate`: % of the band's eligible (non-lay-up)
 *     attempts that found the green. Same predicate as `reachedGreen`
 *     (approach-miss.ts) / the migration's `on_green`. `denominator` /
 *     `eligibleCount` / `observedCount` = the band's eligible attempts;
 *     `exclusions` carries this band's `layup`/`missing_par` counts.
 *   - `approach_on_green_proximity_feet`: average finish distance (feet)
 *     over the green-finding subset that also carries a non-null finish
 *     reading — mirrors the migration's `on_green_proximity_feet`,
 *     including its OWN extra floor (>= MIN_GREENS green-finding shots,
 *     checked on `greenShots`, not on the narrower reading count).
 *     `numerator`/`denominator` are the summed/counted readings
 *     themselves, so `value` is exactly `numerator / denominator` — a
 *     further narrowing of `attempts`, not a fresh exclusion reason, so
 *     `exclusions` is empty here (mirrors `par-opportunities.ts`'s
 *     `par5_putting_conversion_rate`, whose population also narrows from
 *     an already-explained set without a new reason of its own).
 *   - `approach_direction_coverage`: % of the band's MISSED eligible
 *     attempts that carry a non-null `miss_direction` — a data-quality/
 *     support metric, not a directional bias metric (that's
 *     `diagnosis.ts`'s `approachAxisReading`, which already states what
 *     isn't recorded on its own reading's `check` field). This is the
 *     metric that tells a caller whether a directional read is even
 *     possible before computing one. Population narrows to missed shots
 *     the same way `on_green_proximity_feet` narrows to green shots, so
 *     `exclusions` is empty here too.
 *   - `approach_severe_outcome_rate`: % of the band's eligible attempts
 *     that are a penalty OR finish in `'sand'`/`'other'` — a "how costly
 *     are the misses" companion to the green-hit rate, distinct from a
 *     plain miss rate (a `'fairway'`/`'rough'` miss is not severe).
 *   - `approach_measured_contribution`: the band's eligible attempt COUNT
 *     itself, unit `'count'`, ALWAYS reported (never null, even when
 *     `status` is `'insufficient'`/`'invalid'`) — the metric that states
 *     how much evidence backs the other four, directly answering the
 *     "support policy" requirement rather than leaving it implicit in
 *     `status` alone. This is the one row whose `value` deliberately does
 *     not follow the "null when its denominator is 0" rule every other
 *     row here follows.
 *
 * ── STATUS AND "STATE IT, DON'T HIDE IT" ─────────────────────────────────
 * `types.ts`'s `MetricStatus` doc comment states the contract this module
 * now follows instead of its own earlier support policy: `'insufficient'`
 * still carries a computed `value`, it only flags a small denominator. So
 * `value` here is `null` ONLY when its own `denominator` is 0 (mirrors
 * `par-opportunities.ts`'s `statusFor`/row-construction pattern exactly:
 * `eligible > 0 ? ... : null`), never merely because a floor (MIN_ATTEMPTS/
 * MIN_ROUNDS/MIN_GREENS) isn't cleared — that now lives in `status` alone
 * (`'supported'` vs `'insufficient'`), which the caller reads to decide
 * how much weight to give an otherwise-real number. This is a genuine
 * behavior change from this module's pre-adaptation version, which nulled
 * `value` whenever `support === 'under_supported'`.
 *
 * `distinctRounds` is computed per row from THAT row's own population
 * (e.g. `approach_on_green_proximity_feet` counts rounds among the shots
 * with a valid proximity reading, not among the wider `attempts` set) —
 * following `par-opportunities.ts`'s own per-row `distinctRounds` (its
 * `par5_putting_conversion_rate` counts rounds among `created`, not among
 * the wider `eligible` set), rather than this module's earlier design of
 * computing one `distinctRounds` per band and reusing it across all five
 * rows.
 *
 * ── RECORDED TRAVEL DISTANCE vs. DERIVED PROGRESS ───────────────────────
 * `TeeStrategyShot` (this same file's tee-shot cousin) has a real
 * `distance_method: 'recorded' | 'derived_progress' | null` split: when
 * `shot_distance` itself is null, it falls back to `hole.yardage -
 * distance_to_hole_after` — an ESTIMATE of progress toward the hole, not
 * the ball's travel or carry, and its doc comment explicitly bans "carry"
 * language for that derived case (a dogleg makes the two differ by
 * construction).
 *
 * `ShotFact.distance_to_hole_before_feet` / `distance_to_hole_after_feet`
 * have no such fallback: `normalizeShot` builds both ONLY from
 * `normalizeShotValue(raw.distance_to_hole_{before,after}, unit)`, which
 * only converts a recorded value's unit — it never substitutes hole
 * yardage or any other field when the recorded value is null (it reports
 * `missing` instead; see `normalize-shot.ts`). So every distance this
 * module consumes is `'recorded'`, never `'derived_progress'` — that
 * second mode simply cannot arise from today's approach-shot data model.
 * `MetricResult.distanceMethod` states this explicitly rather than
 * leaving it implicit, so a later slice that ever teaches this module a
 * derived-progress fallback (mirroring the tee-shot one) cannot silently
 * mislabel it as `'recorded'`.
 *
 * This also settles the "carry" wording: `approach_on_green_proximity_feet`
 * is the shot's own recorded remaining distance to the hole after it came
 * to rest — a straight-line proximity number, not a flight-path or carry
 * distance, and not a computed progress estimate either. Prose describing
 * it must say "proximity" or "remaining distance," never "carry."
 */
import { round } from '@/lib/golf/stat-formulas';
import { bucketApproachDistance, type ApproachBucket } from '../engine/shot-source';
import type { AnalysisScope, HoleContext, ShotFact } from '../context/types';
import type { MetricResult, MetricStatus, SupportFloorGap } from './types';

export type { MetricResult, MetricStatus, SupportFloorGap } from './types';

export type DistanceBand = ApproachBucket;

export type DistanceProfileMetricId =
  | 'approach_green_hit_rate'
  | 'approach_on_green_proximity_feet'
  | 'approach_direction_coverage'
  | 'approach_severe_outcome_rate'
  | 'approach_measured_contribution';

/** Addendum A2 §5.2 / migration 20260922120000: the all-shot support floor.
 *  Exported (not just internal to `statusFor`) so a consuming surface can
 *  state WHICH floor an `'insufficient'` row is short of — see
 *  `describeSupportGap` below — rather than hiding the actual denominator
 *  and floor behind a generic "not enough data yet". */
export const MIN_ATTEMPTS = 10;
export const MIN_ROUNDS = 3;
/** Legacy on-green floor, preserved for on-green proximity specifically —
 *  same migration, same constant name (`v_min_greens`). */
export const MIN_GREENS = 3;

const BANDS: readonly DistanceBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

/** Mirrors `par-opportunities.ts`'s `statusFor(denominator, minN)`,
 *  generalized to a caller-supplied floor predicate since this module's
 *  floor is compound (attempts AND rounds, and — for on-green proximity —
 *  AND a green-count floor on top) rather than a single `minN`. */
function statusFor(denominator: number, meetsFloor: boolean): MetricStatus {
  if (denominator === 0) return 'invalid';
  return meetsFloor ? 'supported' : 'insufficient';
}

/**
 * Names EVERY floor an `'insufficient'` row is short of, so a surface can
 * say "2 of 3 rounds and 6 of 10 attempts" instead of a generic count with
 * no stated floor. Only meaningful when `row.status === 'insufficient'` —
 * the caller decides when to show it; this function doesn't check `status`
 * itself, it just renders whatever `row.failedFloors` says.
 *
 * Renders directly from `row.failedFloors` — computed once, in
 * `computeDistanceProfile`, from each row's OWN real gating population
 * (attempts/rounds, plus greens for proximity) — rather than re-deriving a
 * gap from `row.eligibleCount`/`row.distinctRounds`. An earlier version of
 * this function did exactly that re-derivation and was wrong for
 * `approach_on_green_proximity_feet` and `approach_direction_coverage`:
 * both rows narrow `eligibleCount`/`distinctRounds` to a population (green
 * shots with a reading; missed shots) that is a SUBSET of what actually
 * gates `status` (the band's full attempts/rounds). A row could clear its
 * own narrower count while the wider floor that produced `'insufficient'`
 * was still failing, so the old logic could name a floor the row cleared
 * while hiding the one it didn't (#2008 review, MUST 1 — repro:
 * `SCENARIO_B_UNDER_ATTEMPTS_50_125` reported "3 of 3 greens hit" for a row
 * whose real problem was 8 of 10 attempts).
 */
// `describeSupportGap` lives in `./support-gap.ts` now — a client component
// ('use client') needs it as a runtime value, and that file has no value
// import of anything server-only (unlike this one, which value-imports
// `bucketApproachDistance` from `../engine/shot-source`, itself importing
// `createAdminClient`). Re-exported here so every existing server-side
// caller of this module is unaffected (#2008 review, URGENT fix for a
// `node:async_hooks` client-bundle failure).
export { describeSupportGap } from './support-gap';

/** Builds this row's `failedFloors` from its OWN real gating quantities —
 *  never from a narrower per-row count like `eligibleCount` — so the
 *  reported gap can never disagree with what `statusFor` actually gated on.
 *  `undefined` (not an empty array) whenever `status !== 'insufficient'`,
 *  matching `MetricResult.failedFloors`'s own doc comment. Checks rounds
 *  before attempts (rounds is the rarer, more informative shortfall to
 *  name first when both fail), then greens last since only the proximity
 *  row's caller passes `greensHit` at all. */
function failedFloorsFor(
  status: MetricStatus,
  attempts: number,
  attemptRounds: number,
  greensHit?: number,
): SupportFloorGap[] | undefined {
  if (status !== 'insufficient') return undefined;
  const gaps: SupportFloorGap[] = [];
  if (attemptRounds < MIN_ROUNDS) gaps.push({ floor: 'rounds', current: attemptRounds, required: MIN_ROUNDS });
  if (attempts < MIN_ATTEMPTS) gaps.push({ floor: 'attempts', current: attempts, required: MIN_ATTEMPTS });
  if (greensHit !== undefined && greensHit < MIN_GREENS) {
    gaps.push({ floor: 'greens', current: greensHit, required: MIN_GREENS });
  }
  return gaps;
}

function distinctRoundsOf(shots: readonly ShotFact[]): number {
  return new Set(shots.map((f) => f.round_id)).size;
}

function parKey(roundId: string, holeNumber: number | null): string | null {
  if (holeNumber === null) return null;
  return `${roundId}:${holeNumber}`;
}

/** `round_id:hole_number → par`, built from the caller's `HoleContext[]`.
 *  A hole with a null `holeIdentityKey`-style key (shouldn't happen —
 *  `HoleContext.hole_number` is non-nullable by type — kept defensive
 *  anyway) is simply never added, which is exactly the "unresolvable"
 *  state `missing_par` exclusion is for. */
function buildParByRoundHole(holes: readonly HoleContext[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const h of holes) {
    const key = parKey(h.round_id, h.hole_number);
    if (key !== null) map.set(key, h.par);
  }
  return map;
}

/** Same predicate as `approach-miss.ts`'s `reachedGreen` / the migration's
 *  `on_green` — result is canonical, lie_after is a corroborating fallback
 *  for older rows where only the lie was recorded. */
function isOnGreen(fact: ShotFact): boolean {
  const r = (fact.result ?? '').toLowerCase();
  if (r === 'green' || r === 'hole' || r === 'gir') return true;
  return (fact.lie_after ?? '').toLowerCase() === 'green';
}

/** A penalty, or a finish that needs a genuine recovery shot (sand/other) —
 *  deliberately narrower than "missed the green": a plain fairway/rough
 *  miss is not severe. */
function isSevereOutcome(fact: ShotFact): boolean {
  if (fact.is_penalty) return true;
  const r = (fact.result ?? '').toLowerCase();
  return r === 'sand' || r === 'other';
}

function hasDirectionReading(fact: ShotFact): boolean {
  return fact.miss_direction !== null && fact.miss_direction.trim() !== '';
}

/** Which band a shot belongs to, or `null` when it isn't an approach shot,
 *  or its distance is unmeasurable (missing/unrecognized unit — see
 *  `normalizeShotValue`) or outside all three bands (< 50 yd). Converts the
 *  canonical FEET value back to yards for `bucketApproachDistance`, which
 *  is exactly the round trip `shot-source-adapter.test.ts` already proved
 *  agrees with the existing bucketing for every well-unit-tagged shot. */
function bandOf(fact: ShotFact): DistanceBand | null {
  if (fact.shot_type !== 'approach') return null;
  if (fact.distance_to_hole_before_feet === null) return null;
  const yards = fact.distance_to_hole_before_feet / 3;
  return bucketApproachDistance(yards, 'yards');
}

export function computeDistanceProfile(
  facts: readonly ShotFact[],
  scope: AnalysisScope,
  holes: readonly HoleContext[],
): MetricResult[] {
  const parByRoundHole = buildParByRoundHole(holes);
  const results: MetricResult[] = [];

  for (const band of BANDS) {
    const inBand = facts.filter((f) => bandOf(f) === band);

    let layupExcludedN = 0;
    let missingParExcludedN = 0;
    const eligible = inBand.filter((f) => {
      if (band !== '175_plus_ft') return true;
      const key = parKey(f.round_id, f.hole_number);
      const par = key === null ? undefined : parByRoundHole.get(key);
      if (par === undefined) {
        // Unresolvable par — never silently treated as "not a lay-up".
        missingParExcludedN += 1;
        return false;
      }
      const isLikelyLayup = par === 5 && !isOnGreen(f);
      if (isLikelyLayup) layupExcludedN += 1;
      return !isLikelyLayup;
    });

    const attempts = eligible.length;
    const attemptRounds = distinctRoundsOf(eligible);
    const meetsAttemptFloor = attempts >= MIN_ATTEMPTS && attemptRounds >= MIN_ROUNDS;

    const bandExclusions: Record<string, number> = {};
    if (layupExcludedN > 0) bandExclusions.layup = layupExcludedN;
    if (missingParExcludedN > 0) bandExclusions.missing_par = missingParExcludedN;

    const dimensions = { band };

    const greenHitStatus = statusFor(attempts, meetsAttemptFloor);
    const greenShots = eligible.filter(isOnGreen);
    results.push({
      scope,
      dimensions,
      metricId: 'approach_green_hit_rate',
      unit: 'percent',
      value: attempts > 0 ? round((100 * greenShots.length) / attempts) : null,
      numerator: attempts > 0 ? greenShots.length : null,
      denominator: attempts,
      eligibleCount: attempts,
      observedCount: inBand.length,
      distinctRounds: attemptRounds,
      status: greenHitStatus,
      exclusions: bandExclusions,
      distanceMethod: 'recorded',
      failedFloors: failedFloorsFor(greenHitStatus, attempts, attemptRounds),
    });

    const proximityReadings = greenShots
      .map((f) => f.distance_to_hole_after_feet)
      .filter((v): v is number => v !== null);
    const meetsProximityFloor = meetsAttemptFloor && greenShots.length >= MIN_GREENS;
    const proximityStatus = statusFor(proximityReadings.length, meetsProximityFloor);
    const proximitySum = proximityReadings.reduce((a, b) => a + b, 0);
    results.push({
      scope,
      dimensions,
      metricId: 'approach_on_green_proximity_feet',
      unit: 'feet',
      value: proximityReadings.length > 0 ? round(proximitySum / proximityReadings.length) : null,
      numerator: proximityReadings.length > 0 ? round(proximitySum) : null,
      denominator: proximityReadings.length,
      eligibleCount: proximityReadings.length,
      observedCount: proximityReadings.length,
      distinctRounds: distinctRoundsOf(
        greenShots.filter((f) => f.distance_to_hole_after_feet !== null),
      ),
      status: proximityStatus,
      exclusions: {},
      distanceMethod: 'recorded',
      // `greenShots.length` (not `proximityReadings.length`) — the MIN_GREENS
      // floor gates on green-finding shots, and `meetsProximityFloor` above
      // is computed the same way; see this row's own doc comment (module
      // header) for why the two counts track but aren't the same field.
      failedFloors: failedFloorsFor(proximityStatus, attempts, attemptRounds, greenShots.length),
    });

    const missedShots = eligible.filter((f) => !isOnGreen(f));
    const coveredMisses = missedShots.filter(hasDirectionReading);
    const directionStatus = statusFor(missedShots.length, meetsAttemptFloor);
    results.push({
      scope,
      dimensions,
      metricId: 'approach_direction_coverage',
      unit: 'percent',
      value: missedShots.length > 0 ? round((100 * coveredMisses.length) / missedShots.length) : null,
      numerator: missedShots.length > 0 ? coveredMisses.length : null,
      denominator: missedShots.length,
      eligibleCount: missedShots.length,
      observedCount: missedShots.length,
      distinctRounds: distinctRoundsOf(missedShots),
      status: directionStatus,
      exclusions: {},
      distanceMethod: 'recorded',
      // Gated on the BAND's attempts/rounds (`meetsAttemptFloor`), not on
      // `missedShots`'s own narrower count — same reasoning as the
      // proximity row above, and the exact bug #2008's review caught.
      failedFloors: failedFloorsFor(directionStatus, attempts, attemptRounds),
    });

    const severeShots = eligible.filter(isSevereOutcome);
    const severeStatus = statusFor(attempts, meetsAttemptFloor);
    results.push({
      scope,
      dimensions,
      metricId: 'approach_severe_outcome_rate',
      unit: 'percent',
      value: attempts > 0 ? round((100 * severeShots.length) / attempts) : null,
      numerator: attempts > 0 ? severeShots.length : null,
      denominator: attempts,
      eligibleCount: attempts,
      observedCount: inBand.length,
      distinctRounds: attemptRounds,
      status: severeStatus,
      exclusions: bandExclusions,
      distanceMethod: 'recorded',
      failedFloors: failedFloorsFor(severeStatus, attempts, attemptRounds),
    });

    // Always reported, even when `status` is `'insufficient'`/`'invalid'` —
    // this IS the metric that states the support policy's input, not
    // something the policy gates. `numerator`/`denominator` both equal
    // `attempts`: unlike every other row in this file, this one does not
    // null `value` when its denominator is 0 (0 attempts is itself the
    // reportable fact).
    const measuredStatus = statusFor(attempts, meetsAttemptFloor);
    results.push({
      scope,
      dimensions,
      metricId: 'approach_measured_contribution',
      unit: 'count',
      value: attempts,
      numerator: attempts,
      denominator: attempts,
      eligibleCount: attempts,
      observedCount: inBand.length,
      distinctRounds: attemptRounds,
      status: measuredStatus,
      exclusions: bandExclusions,
      distanceMethod: 'recorded',
      failedFloors: failedFloorsFor(measuredStatus, attempts, attemptRounds),
    });
  }

  return results;
}
