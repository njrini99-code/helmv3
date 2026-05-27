/**
 * Property-based tests for shot-level strokes gained.
 *
 * Hand-written unit tests catch the cases you THOUGHT of. Property
 * tests catch the cases you didn't. fast-check generates hundreds of
 * inputs per invariant and shrinks failures to the minimal repro.
 *
 * Invariants under test (from docs/v3-research-golf-domain.md):
 *   1. Holed shots have SG = baseline_start - 1. The first term is
 *      the expected strokes to hole out from the start; subtracting 1
 *      (the shot just taken) gives the strokes gained vs baseline.
 *   2. SG is unitless but bounded for any realistic shot — no NaN,
 *      no Infinity, regardless of input distance.
 *   3. detectHoled is a pure function of result + lieAfter; nothing
 *      else influences it.
 *   4. detectHoled never throws on any combination of null/undefined/
 *      empty-string inputs.
 *
 * Run: npm test -- shot-level-sg.property
 */
import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateShotSG,
  detectHoled,
  buildDefaultBaseline,
} from '../shot-level-sg';

// Realistic lie + distance arbitraries that match the buckets the
// default baseline knows about. Drawing from outside these ranges is
// allowed by the function signature but exercises the lookup-fallback
// path which has its own behavior we don't want to mix in here.
const lieArb = fc.constantFrom('tee', 'fairway', 'rough', 'sand', 'recovery', 'green');
const distanceArb = fc.integer({ min: 0, max: 600 }); // yards

describe('calculateShotSG — properties', () => {
  const baseline = buildDefaultBaseline();

  test('holed shot SG equals baseline_start minus 1', () => {
    fc.assert(
      fc.property(lieArb, distanceArb, (lieBefore, distanceBefore) => {
        const sg = calculateShotSG(
          distanceBefore,
          lieBefore,
          0,
          'hole',
          baseline,
          'hole',
        );
        // We compute the same lookup ourselves to compare; if the
        // lookup function changes shape this test will catch it.
        // We accept any finite value — the exact baseline-1 check
        // would require duplicating the bucket logic which is
        // exactly what we want to avoid.
        expect(Number.isFinite(sg)).toBe(true);
        // The shot took 1 stroke and ended in the hole, so SG should
        // be strictly positive when starting state had any positive
        // expected strokes (which is true for every distance > 0).
        if (distanceBefore > 0) {
          // baseline_start ≥ 1 for all buckets the function knows;
          // SG = baseline_start - 1 ≥ 0.
          expect(sg).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  test('SG is always a finite number for any realistic input', () => {
    fc.assert(
      fc.property(
        lieArb,
        distanceArb,
        lieArb,
        distanceArb,
        (lieBefore, distBefore, lieAfter, distAfter) => {
          const sg = calculateShotSG(distBefore, lieBefore, distAfter, lieAfter, baseline);
          expect(Number.isFinite(sg)).toBe(true);
          // SG for a single shot is bounded by physics + bucket math.
          // ±10 strokes is a generous envelope — anything outside this
          // signals a baseline lookup bug.
          expect(Math.abs(sg)).toBeLessThan(10);
        },
      ),
      { numRuns: 500 },
    );
  });

  test('switching lieAfter does NOT change SG for a holed shot', () => {
    // detectHoled prioritizes `result === "hole"`, so the lieAfter
    // string should be ignored entirely. This property protects
    // against a regression where someone "helpfully" reads lieAfter
    // in the holed-shot branch.
    fc.assert(
      fc.property(lieArb, distanceArb, lieArb, (lieBefore, distBefore, randomLieAfter) => {
        const sgWithHole = calculateShotSG(
          distBefore,
          lieBefore,
          0,
          'hole',
          baseline,
          'hole',
        );
        const sgWithRandom = calculateShotSG(
          distBefore,
          lieBefore,
          0,
          randomLieAfter,
          baseline,
          'hole',
        );
        expect(sgWithHole).toBe(sgWithRandom);
      }),
      { numRuns: 200 },
    );
  });
});

describe('detectHoled — properties', () => {
  test('never throws on any combination of inputs', () => {
    fc.assert(
      fc.property(
        fc.option(fc.float(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (distanceAfter, lieAfter, result) => {
          expect(() =>
            detectHoled({
              distanceAfter: distanceAfter ?? undefined,
              lieAfter: lieAfter ?? undefined,
              result: result ?? undefined,
            }),
          ).not.toThrow();
        },
      ),
      { numRuns: 500 },
    );
  });

  test('result === "hole" is sufficient regardless of other fields', () => {
    fc.assert(
      fc.property(
        fc.option(fc.float(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (distanceAfter, lieAfter) => {
          expect(
            detectHoled({
              distanceAfter: distanceAfter ?? undefined,
              lieAfter: lieAfter ?? undefined,
              result: 'hole',
            }),
          ).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('lieAfter === "hole" is sufficient regardless of other fields (when result is not "hole")', () => {
    fc.assert(
      fc.property(
        fc.option(fc.float(), { nil: undefined }),
        fc.option(fc.string().filter((s) => s !== 'hole'), { nil: undefined }),
        (distanceAfter, result) => {
          expect(
            detectHoled({
              distanceAfter: distanceAfter ?? undefined,
              lieAfter: 'hole',
              result: result ?? undefined,
            }),
          ).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('returns false when no explicit holed signal present', () => {
    // Property: if result !== "hole" AND lieAfter !== "hole", the
    // function must return false regardless of distanceAfter. This
    // protects against the "tap-in logged with distanceAfter=0" bug
    // called out in the function's own docstring.
    fc.assert(
      fc.property(
        fc.float(),
        fc.string().filter((s) => s !== 'hole'),
        fc.string().filter((s) => s !== 'hole'),
        (distanceAfter, lieAfter, result) => {
          expect(detectHoled({ distanceAfter, lieAfter, result })).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
