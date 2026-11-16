/**
 * The PGA Tour expected-strokes baseline: the one TypeScript copy.
 *
 * Every TypeScript strokes-gained engine reads this table (strokes-gained.ts,
 * sg-benchmarks.ts, golf-stats-calculator-shots.ts), and the database function
 * public.sg_expected_strokes() carries the same numbers. Before SC-03 there
 * were three hand-kept TypeScript copies of hand-picked knots, and between the
 * knots they were off the published table by up to 0.32 strokes.
 *
 * SOURCE (tee, fairway, rough, sand, recovery): Mark Broadie, "Assessing Golfer
 * Performance on the PGA TOUR", Interfaces 42(2):146-165 (2012), Appendix B,
 * Table B.1, "PGA TOUR benchmark: average number of strokes to hole out", every
 * row as published: 10-yard steps to 100 yards, 20-yard steps to 600. Tee
 * starts at 100 yards in the table. Distances are yards.
 *
 * Below the first row an engine holds the first row's value (no extrapolation):
 * 10 yards for fairway, rough, sand and recovery, 100 yards for the tee.
 *
 * OTHER is not a published curve. It is the logger's catch-all lie (trees, pine
 * straw, waste, hazard edges), priced by the owner's rule of 2026-10-23
 * (migration 20261023170000): the rough curve to 50 yards, halfway between
 * rough and recovery from 100 yards, and a straight blend of the two curves in
 * between (the recovery weight rises from 0 at 50 yards to one half at 100).
 * Here it is that rule applied to the published rough and recovery rows;
 * sg-tour-baseline.test.ts checks every row against the rule.
 *
 * GREEN is in FEET and is not in Table B.1 (the paper publishes a fitted
 * putting model, not a row). It keeps the values the database has used since
 * 20260606140000, 2 feet included (1.01).
 *
 * Changing a number here means changing public.sg_expected_strokes() in a new
 * migration in the same change: src/lib/golf/__tests__/sg-tour-baseline.test.ts
 * compares this table with supabase/schemas/functions/public.sql.
 */

export type SgTourLie = 'tee' | 'fairway' | 'rough' | 'sand' | 'other' | 'recovery' | 'green';

export const SG_TOUR_BASELINE: Readonly<Record<SgTourLie, Readonly<Record<number, number>>>> = {
  tee: {
    100: 2.92, 120: 2.99, 140: 2.97, 160: 2.99, 180: 3.05,
    200: 3.12, 220: 3.17, 240: 3.25, 260: 3.45, 280: 3.65,
    300: 3.71, 320: 3.79, 340: 3.86, 360: 3.92, 380: 3.96,
    400: 3.99, 420: 4.02, 440: 4.08, 460: 4.17, 480: 4.28,
    500: 4.41, 520: 4.54, 540: 4.65, 560: 4.74, 580: 4.79,
    600: 4.82,
  },
  fairway: {
    10: 2.18, 20: 2.40, 30: 2.52, 40: 2.60, 50: 2.66,
    60: 2.70, 70: 2.72, 80: 2.75, 90: 2.77, 100: 2.80,
    120: 2.85, 140: 2.91, 160: 2.98, 180: 3.08, 200: 3.19,
    220: 3.32, 240: 3.45, 260: 3.58, 280: 3.69, 300: 3.78,
    320: 3.84, 340: 3.88, 360: 3.95, 380: 4.03, 400: 4.11,
    420: 4.19, 440: 4.27, 460: 4.34, 480: 4.42, 500: 4.50,
    520: 4.58, 540: 4.66, 560: 4.74, 580: 4.82, 600: 4.89,
  },
  rough: {
    10: 2.34, 20: 2.59, 30: 2.70, 40: 2.78, 50: 2.87,
    60: 2.91, 70: 2.93, 80: 2.96, 90: 2.99, 100: 3.02,
    120: 3.08, 140: 3.15, 160: 3.23, 180: 3.31, 200: 3.42,
    220: 3.53, 240: 3.64, 260: 3.74, 280: 3.83, 300: 3.90,
    320: 3.95, 340: 4.02, 360: 4.11, 380: 4.21, 400: 4.30,
    420: 4.40, 440: 4.49, 460: 4.58, 480: 4.68, 500: 4.77,
    520: 4.87, 540: 4.96, 560: 5.06, 580: 5.15, 600: 5.25,
  },
  sand: {
    10: 2.43, 20: 2.53, 30: 2.66, 40: 2.82, 50: 2.92,
    60: 3.15, 70: 3.21, 80: 3.24, 90: 3.24, 100: 3.23,
    120: 3.21, 140: 3.22, 160: 3.28, 180: 3.40, 200: 3.55,
    220: 3.70, 240: 3.84, 260: 3.93, 280: 4.00, 300: 4.04,
    320: 4.12, 340: 4.26, 360: 4.41, 380: 4.55, 400: 4.69,
    420: 4.83, 440: 4.97, 460: 5.11, 480: 5.25, 500: 5.40,
    520: 5.54, 540: 5.68, 560: 5.82, 580: 5.96, 600: 6.10,
  },
  other: {
    10: 2.34, 20: 2.59, 30: 2.70, 40: 2.78, 50: 2.87,
    60: 3.002, 70: 3.112, 80: 3.224, 90: 3.322, 100: 3.41,
    120: 3.43, 140: 3.475, 160: 3.52, 180: 3.565, 200: 3.645,
    220: 3.725, 240: 3.805, 260: 3.885, 280: 3.965, 300: 4.05,
    320: 4.13, 340: 4.23, 360: 4.335, 380: 4.435, 400: 4.525,
    420: 4.62, 440: 4.715, 460: 4.805, 480: 4.905, 500: 4.995,
    520: 5.095, 540: 5.185, 560: 5.285, 580: 5.375, 600: 5.475,
  },
  recovery: {
    10: 3.45, 20: 3.51, 30: 3.57, 40: 3.71, 50: 3.79,
    60: 3.83, 70: 3.84, 80: 3.84, 90: 3.82, 100: 3.80,
    120: 3.78, 140: 3.80, 160: 3.81, 180: 3.82, 200: 3.87,
    220: 3.92, 240: 3.97, 260: 4.03, 280: 4.10, 300: 4.20,
    320: 4.31, 340: 4.44, 360: 4.56, 380: 4.66, 400: 4.75,
    420: 4.84, 440: 4.94, 460: 5.03, 480: 5.13, 500: 5.22,
    520: 5.32, 540: 5.41, 560: 5.51, 580: 5.60, 600: 5.70,
  },
  green: {
    1: 1.00, 2: 1.01, 3: 1.04, 4: 1.13, 5: 1.23,
    6: 1.34, 7: 1.42, 8: 1.50, 9: 1.56, 10: 1.61,
    15: 1.78, 20: 1.87, 30: 1.98, 40: 2.06, 50: 2.14,
    60: 2.21, 90: 2.40,
  },
};
