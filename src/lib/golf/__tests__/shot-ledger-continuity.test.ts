import { describe, it, expect } from 'vitest';
import { findShotChainDiscontinuities } from '@/lib/golf/shot-ledger-continuity';

type S = Parameters<typeof findShotChainDiscontinuities>[0][number]['shots'][number];

function shot(n: number, o: Partial<S> = {}): S {
  return {
    shot_number: n,
    lie_before: 'fairway',
    lie_after: 'fairway',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 20,
    distance_unit_after: 'yards',
    is_penalty: false,
    ...o,
  };
}

describe('findShotChainDiscontinuities', () => {
  it('passes a continuous chain, including unit changes onto the green', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 1,
        shots: [
          shot(1, { lie_before: 'tee', lie_after: 'fairway', distance_to_hole_before: 400, distance_to_hole_after: 150 }),
          shot(2, { lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 150, distance_to_hole_after: 10, distance_unit_after: 'feet' }),
          shot(3, { lie_before: 'green', lie_after: null, distance_to_hole_before: 10, distance_unit_before: 'feet', distance_to_hole_after: 0, distance_unit_after: 'feet' }),
        ],
      },
    ]);
    expect(out).toEqual([]);
  });

  it('flags a lie that does not chain', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 4,
        shots: [
          shot(1, { lie_before: 'tee', lie_after: 'fairway', distance_to_hole_after: 150 }),
          shot(2, { lie_before: 'sand', distance_to_hole_before: 150 }),
        ],
      },
    ]);
    expect(out).toEqual([
      expect.objectContaining({ hole_number: 4, shot_number: 1, kind: 'lie', after: 'fairway', next_before: 'sand' }),
    ]);
  });

  it('flags a distance gap between one shot and the next', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 2,
        shots: [
          shot(1, { lie_after: 'fairway', distance_to_hole_after: 150 }),
          shot(2, { lie_before: 'fairway', distance_to_hole_before: 120 }),
        ],
      },
    ]);
    expect(out).toEqual([expect.objectContaining({ kind: 'distance', hole_number: 2, shot_number: 1 })]);
  });

  it('does not flag penalty strokes, unknown lies, or rough-to-other', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 7,
        shots: [
          shot(1, { lie_after: 'penalty', is_penalty: true, distance_to_hole_after: 300 }),
          shot(2, { lie_before: 'tee', lie_after: null, distance_to_hole_before: 420, distance_to_hole_after: 160 }),
          shot(3, { lie_before: 'rough', lie_after: 'rough', distance_to_hole_before: 160, distance_to_hole_after: 40 }),
          shot(4, { lie_before: 'other', distance_to_hole_before: 40 }),
        ],
      },
    ]);
    expect(out).toEqual([]);
  });
});
