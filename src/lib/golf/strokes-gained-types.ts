/**
 * Shared strokes-gained type definitions.
 *
 * Split from strokes-gained.ts / sg-benchmarks.ts to break the circular
 * import between benchmark data and the calculation engine.
 */

export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green';

/** Key is distance (yards for non-green, feet for green), value is expected strokes. */
export type BaselineData = Record<LieType, Record<number, number>>;
