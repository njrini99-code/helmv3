/**
 * Before/after comparison (addendum §13, A1 slice 2): the existing "broad
 * approach totals" `approach-miss.ts` already computes from `ApproachShot[]`
 * directly, versus the SAME fixed shots run through
 * `approachShotToShotFact` + normalization. Every difference below is
 * explained as a deliberate semantic correction, not a regression —
 * `approach-miss.ts` itself is untouched (only `reachedGreen` was exported,
 * no behavior change) and no generator output changes.
 *
 * Both totals reuse the REAL `bucketApproachDistance` (shot-source.ts) and
 * `reachedGreen` (approach-miss.ts) predicates rather than a forked copy —
 * `reachedGreen` reads only `result`/`lie_after`, which `normalizeShot`
 * copies through UNCHANGED, so applying it to the original `ApproachShot`
 * is valid ground truth for the normalized path too. The only place old and
 * new CAN disagree is bucket membership, which is why the fixtures below
 * isolate exactly that.
 */
import { describe, expect, it } from 'vitest';
import { bucketApproachDistance, type ApproachShot, type ApproachBucket } from '@/lib/coachhelm/v3/engine/shot-source';
import { reachedGreen } from '@/lib/coachhelm/v3/generators/approach-miss';
import { approachShotToShotFact } from '@/lib/coachhelm/v3/context/adapters/shot-source-adapter';

const FALLBACK_OBSERVED_AT = '2026-07-01T00:00:00.000Z';
const TARGET_BUCKET: ApproachBucket = '125_175ft'; // 125-175 YARDS, despite the "ft" suffix in the id

function shot(overrides: Partial<ApproachShot>): ApproachShot {
  return {
    round_id: 'round-1',
    hole_number: 4,
    shot_number: 2,
    distance_to_hole_before: 150,
    distance_to_hole_after: 20,
    distance_unit_after: 'feet',
    distance_unit_before: 'yards',
    lie_before: 'fairway',
    lie_after: 'fairway',
    result: 'fairway',
    is_penalty: false,
    miss_direction: null,
    par: 4,
    ...overrides,
  };
}

// Eight fixed shots. Every one states its OLD-path bucket membership and
// green-hit status inline; the comparison below re-derives both and checks
// them against these stated expectations.
const NORMAL_YARDS_MISS = shot({ result: 'fairway', lie_after: 'fairway' }); // 150 yd, in band, miss
const NORMAL_YARDS_GREEN = shot({
  distance_to_hole_before: 140,
  result: 'green',
  lie_after: 'green',
}); // 140 yd, in band, green
const FEET_UNIT_SHOT = shot({
  // 450 ft === 150 yd — a unit-tagged feet row, the shape the historical
  // bug misread. bucketApproachDistance already converts this correctly
  // (unit === 'feet' divides by 3), so this shot is in-band BOTH ways —
  // it is here to prove the feet/yards conversion itself is NOT a source
  // of difference, only missing/unrecognized units are.
  distance_to_hole_before: 450,
  distance_unit_before: 'feet',
  result: 'rough',
  lie_after: 'rough',
});
const MISSING_UNIT_SHOT = shot({
  distance_to_hole_before: 150,
  distance_unit_before: null, // no unit recorded at all
  result: 'rough',
  lie_after: 'rough',
});
const UNRECOGNIZED_UNIT_SHOT = shot({
  distance_to_hole_before: 150,
  distance_unit_before: 'meters', // not a unit this data model has ever used
  result: 'sand',
  lie_after: 'sand',
});
const HOLED_APPROACH = shot({
  distance_to_hole_before: 130,
  result: 'hole', // reachedGreen's 'hole' branch, not 'green'
  lie_after: null,
});
const LIE_AFTER_FALLBACK_GREEN = shot({
  distance_to_hole_before: 160,
  result: null,
  lie_after: 'green', // reachedGreen's corroborating-lie fallback
});
const OUT_OF_BAND_SHOT = shot({ distance_to_hole_before: 200 }); // 175_plus_ft, not this band
const PENALTY_IN_BAND_SHOT = shot({
  distance_to_hole_before: 140,
  is_penalty: true,
  result: null,
  lie_after: null,
}); // the real aggregate() never excludes penalties from `inBucket`

const ALL_SHOTS: ApproachShot[] = [
  NORMAL_YARDS_MISS,
  NORMAL_YARDS_GREEN,
  FEET_UNIT_SHOT,
  MISSING_UNIT_SHOT,
  UNRECOGNIZED_UNIT_SHOT,
  HOLED_APPROACH,
  LIE_AFTER_FALLBACK_GREEN,
  OUT_OF_BAND_SHOT,
  PENALTY_IN_BAND_SHOT,
];

/** The OLD path: exactly what `ApproachMissGenerator.aggregate()` does —
 *  bucket on the raw `(distance_to_hole_before, distance_unit_before)`,
 *  which treats a missing/unrecognized unit as YARDS (never excludes it). */
function oldInBucket(shots: ApproachShot[], bucket: ApproachBucket): ApproachShot[] {
  return shots.filter((s) => bucketApproachDistance(s.distance_to_hole_before, s.distance_unit_before) === bucket);
}

/** The NEW path: adapt to `ShotFact`, then bucket on the CANONICAL feet
 *  value. A `null` `distance_to_hole_before_feet` (missing/unrecognized
 *  unit) can never match any bucket — there is no assumed-yards fallback. */
function newInBucket(shots: ApproachShot[], bucket: ApproachBucket): ApproachShot[] {
  return shots.filter((s) => {
    const fact = approachShotToShotFact(s, FALLBACK_OBSERVED_AT);
    if (fact.distance_to_hole_before_feet === null) return false;
    const yards = fact.distance_to_hole_before_feet / 3;
    return bucketApproachDistance(yards, 'yards') === bucket;
  });
}

describe('shot-source adapter — before/after comparison on fixed fixtures', () => {
  it('old path assumes yards for a missing or unrecognized unit, including it in the band', () => {
    const inBand = oldInBucket(ALL_SHOTS, TARGET_BUCKET);
    expect(inBand).toContain(MISSING_UNIT_SHOT);
    expect(inBand).toContain(UNRECOGNIZED_UNIT_SHOT);
  });

  it('new path excludes a missing or unrecognized unit instead of assuming yards', () => {
    const inBand = newInBucket(ALL_SHOTS, TARGET_BUCKET);
    expect(inBand).not.toContain(MISSING_UNIT_SHOT);
    expect(inBand).not.toContain(UNRECOGNIZED_UNIT_SHOT);
  });

  it('a well-unit-tagged shot (yards or feet) buckets identically both ways — no difference', () => {
    const oldBand = oldInBucket(ALL_SHOTS, TARGET_BUCKET);
    const newBand = newInBucket(ALL_SHOTS, TARGET_BUCKET);
    for (const s of [NORMAL_YARDS_MISS, NORMAL_YARDS_GREEN, FEET_UNIT_SHOT, HOLED_APPROACH, LIE_AFTER_FALLBACK_GREEN, PENALTY_IN_BAND_SHOT]) {
      expect(oldBand).toContain(s);
      expect(newBand).toContain(s);
    }
    // Out-of-band stays out-of-band both ways.
    expect(oldBand).not.toContain(OUT_OF_BAND_SHOT);
    expect(newBand).not.toContain(OUT_OF_BAND_SHOT);
  });

  it('SEMANTIC CORRECTION: the only difference in band membership is exactly the two unmeasurable-unit shots, and it shrinks attempts rather than growing them', () => {
    const oldBand = oldInBucket(ALL_SHOTS, TARGET_BUCKET);
    const newBand = newInBucket(ALL_SHOTS, TARGET_BUCKET);

    const onlyInOld = oldBand.filter((s) => !newBand.includes(s));
    const onlyInNew = newBand.filter((s) => !oldBand.includes(s));

    // Explanation: MISSING_UNIT_SHOT and UNRECOGNIZED_UNIT_SHOT were counted
    // as "150-yard approaches" under the old, unit-assuming path purely
    // because bucketApproachDistance's fallback treats an absent/unknown
    // unit as yards. normalizeShotValue instead returns `missing` for both
    // (`reason: 'no_unit'` / `'unrecognized_unit'`), so the adapter's
    // ShotFact carries `distance_to_hole_before_feet: null` — there is no
    // distance to bucket at all. This is a CORRECTION: an approach whose
    // distance was never reliably recorded should not silently count as
    // evidence for a specific band. The correction only ever REMOVES shots
    // from `attempts` (never adds one that wasn't there), so a real
    // adoption of this path could only shrink an over-counted denominator,
    // never inflate one.
    expect(onlyInOld).toEqual([MISSING_UNIT_SHOT, UNRECOGNIZED_UNIT_SHOT]);
    expect(onlyInNew).toEqual([]);
  });

  it('SEMANTIC CORRECTION (rate): dropping the two unmeasurable shots changes the reported green-hit rate, without changing the green-hit COUNT', () => {
    // green-hit determination itself never differs: reachedGreen reads only
    // result/lie_after, and normalizeShot copies both through unchanged —
    // applying reachedGreen to the ORIGINAL ApproachShot is valid ground
    // truth for the ShotFact-based aggregate too.
    const oldBand = oldInBucket(ALL_SHOTS, TARGET_BUCKET);
    const newBand = newInBucket(ALL_SHOTS, TARGET_BUCKET);

    const oldGreenHitN = oldBand.filter(reachedGreen).length;
    const newGreenHitN = newBand.filter(reachedGreen).length;
    expect(oldGreenHitN).toBe(3); // NORMAL_YARDS_GREEN, HOLED_APPROACH, LIE_AFTER_FALLBACK_GREEN
    expect(newGreenHitN).toBe(3); // identical — neither excluded shot was a green hit

    expect(oldBand.length).toBe(8); // includes the two unmeasurable-unit shots
    expect(newBand.length).toBe(6); // excludes them

    // Same numerator, smaller denominator: 3/8 (37.5%) → 3/6 (50%). The old
    // rate was DILUTED by two attempts that were never really measurable —
    // the new rate is not a different measurement, it's the same evidence
    // without the padding.
    expect(Math.round((100 * oldGreenHitN) / oldBand.length)).toBe(38);
    expect(Math.round((100 * newGreenHitN) / newBand.length)).toBe(50);
  });

  it('the adapter carries club_type/intent/putt_made as their documented "not recorded" values, never guessed', () => {
    const fact = approachShotToShotFact(NORMAL_YARDS_MISS, FALLBACK_OBSERVED_AT);
    expect(fact.club_type).toBeNull();
    expect(fact.intent).toBe('unknown');
    expect(fact.putt_made).toBeNull();
    expect(fact.shot_type).toBe('approach');
  });
});
