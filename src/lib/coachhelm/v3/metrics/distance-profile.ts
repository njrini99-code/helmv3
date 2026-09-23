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
 *     (approach-miss.ts) / the migration's `on_green`.
 *   - `approach_on_green_proximity_feet`: average finish distance (feet)
 *     over the green-finding subset — mirrors the migration's
 *     `on_green_proximity_feet`, including its OWN extra floor
 *     (>= MIN_GREENS on top of the all-shot floor).
 *   - `approach_direction_coverage`: % of the band's MISSED eligible
 *     attempts that carry a non-null `miss_direction` — a data-quality/
 *     support metric, not a directional bias metric (that's
 *     `diagnosis.ts`'s `approachAxisReading`, which already states what
 *     isn't recorded on its own reading's `check` field). This is the
 *     metric that tells a caller whether a directional read is even
 *     possible before computing one.
 *   - `approach_severe_outcome_rate`: % of the band's eligible attempts
 *     that are a penalty OR finish in `'sand'`/`'other'` — a "how costly
 *     are the misses" companion to the green-hit rate, distinct from a
 *     plain miss rate (a `'fairway'`/`'rough'` miss is not severe).
 *   - `approach_measured_contribution`: the band's eligible attempt COUNT
 *     itself, always reported (never null, even when under-supported) —
 *     the metric that states how much evidence backs the other four,
 *     directly answering the "support policy" requirement rather than
 *     leaving it implicit in a shared `support` field alone.
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

export type DistanceBand = ApproachBucket;

export type DistanceProfileMetricId =
  | 'approach_green_hit_rate'
  | 'approach_on_green_proximity_feet'
  | 'approach_direction_coverage'
  | 'approach_severe_outcome_rate'
  | 'approach_measured_contribution';

export type SupportLevel = 'supported' | 'under_supported';

/** Mirrors `TeeStrategyShot.distance_method` (`engine/shot-source.ts`) —
 *  see the module doc comment's "RECORDED TRAVEL DISTANCE vs. DERIVED
 *  PROGRESS" section. Always `'recorded'` today; no approach-shot input
 *  this module reads is ever derived from hole yardage. */
export type DistanceMethod = 'recorded' | 'derived_progress';

export interface MetricResult {
  id: DistanceProfileMetricId;
  band: DistanceBand;
  playerId: string;
  /** Always `'recorded'` — see `DistanceMethod`'s doc comment. Carried on
   *  every result, not just the proximity one, so a consumer never has to
   *  special-case which metric id is safe to label "carry"/"travel": none
   *  of them are anything but a recorded value here. */
  distanceMethod: DistanceMethod;
  /**
   * Percent (0-100, 1dp) for the three rate/coverage metrics, feet (1dp)
   * for on-green proximity, a raw integer count for measured_contribution.
   * `null` when the metric is under-supported, or (on-green proximity
   * specifically) when there are fewer than `MIN_GREENS` green-finding
   * shots even though the band itself clears the all-shot floor — NEVER a
   * fabricated 0.
   */
  value: number | null;
  /** The band's eligible (lay-up-excluded) attempt count — always
   *  populated, even when `value` is null, so a caller can explain why. */
  attempts: number;
  distinctRounds: number;
  /** 175+ yd CONFIRMED par-5 approaches missing the green, excluded from
   *  every metric in this band as likely lay-ups. Always 0 outside the
   *  175+ band. */
  layupExcludedN: number;
  /** 175+ yd shots whose hole's par could not be resolved from the
   *  `holes` argument — excluded outright, never silently kept as
   *  "probably not a lay-up." Always 0 outside the 175+ band. See the
   *  module doc comment's "WHY `holes: HoleContext[]` IS A REQUIRED THIRD
   *  ARGUMENT" section. */
  missingParExcludedN: number;
  support: SupportLevel;
}

/** Addendum A2 §5.2 / migration 20260922120000: the all-shot support floor. */
const MIN_ATTEMPTS = 10;
const MIN_ROUNDS = 3;
/** Legacy on-green floor, preserved for on-green proximity specifically —
 *  same migration, same constant name (`v_min_greens`). */
const MIN_GREENS = 3;

const BANDS: readonly DistanceBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

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

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
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
    const distinctRounds = new Set(eligible.map((f) => f.round_id)).size;
    const support: SupportLevel =
      attempts >= MIN_ATTEMPTS && distinctRounds >= MIN_ROUNDS ? 'supported' : 'under_supported';

    const greenShots = eligible.filter(isOnGreen);
    results.push({
      id: 'approach_green_hit_rate',
      band,
      playerId: scope.player_id,
      distanceMethod: 'recorded',
      value: support === 'supported' ? round((100 * greenShots.length) / attempts) : null,
      attempts,
      distinctRounds,
      layupExcludedN,
      missingParExcludedN,
      support,
    });

    const onGreenSupport: SupportLevel =
      support === 'supported' && greenShots.length >= MIN_GREENS ? 'supported' : 'under_supported';
    const proximityFeet =
      onGreenSupport === 'supported'
        ? average(
            greenShots
              .map((f) => f.distance_to_hole_after_feet)
              .filter((v): v is number => v !== null),
          )
        : null;
    results.push({
      id: 'approach_on_green_proximity_feet',
      band,
      playerId: scope.player_id,
      distanceMethod: 'recorded',
      value: proximityFeet === null ? null : round(proximityFeet),
      attempts,
      distinctRounds,
      layupExcludedN,
      missingParExcludedN,
      support: onGreenSupport,
    });

    const missedShots = eligible.filter((f) => !isOnGreen(f));
    const coveredMisses = missedShots.filter(hasDirectionReading);
    results.push({
      id: 'approach_direction_coverage',
      band,
      playerId: scope.player_id,
      distanceMethod: 'recorded',
      value:
        support === 'supported' && missedShots.length > 0
          ? round((100 * coveredMisses.length) / missedShots.length)
          : null,
      attempts,
      distinctRounds,
      layupExcludedN,
      missingParExcludedN,
      support,
    });

    const severeShots = eligible.filter(isSevereOutcome);
    results.push({
      id: 'approach_severe_outcome_rate',
      band,
      playerId: scope.player_id,
      distanceMethod: 'recorded',
      value: support === 'supported' ? round((100 * severeShots.length) / attempts) : null,
      attempts,
      distinctRounds,
      layupExcludedN,
      missingParExcludedN,
      support,
    });

    // Always reported, even under-supported — this IS the metric that
    // states the support policy's input, not something it's gated by.
    results.push({
      id: 'approach_measured_contribution',
      band,
      playerId: scope.player_id,
      distanceMethod: 'recorded',
      value: attempts,
      attempts,
      distinctRounds,
      layupExcludedN,
      missingParExcludedN,
      support,
    });
  }

  return results;
}
