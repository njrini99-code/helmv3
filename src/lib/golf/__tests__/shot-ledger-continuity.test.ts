import { describe, it, expect } from 'vitest';
import { findShotChainDiscontinuities, summarizeShotChainDiscontinuities } from '@/lib/golf/shot-ledger-continuity';

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

  it('does not flag the shot before an OB / lost-ball penalty (stroke and distance restarts the chain)', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 8,
        shots: [
          shot(1, { lie_before: 'tee', lie_after: 'rough', distance_to_hole_before: 400, distance_to_hole_after: 120 }),
          shot(2, { is_penalty: true, penalty_type: 'ob', lie_before: 'tee', lie_after: 'penalty', distance_to_hole_before: 400, distance_to_hole_after: 400 }),
          shot(3, { lie_before: 'tee', lie_after: 'fairway', distance_to_hole_before: 400, distance_to_hole_after: 150 }),
        ],
      },
    ]);
    expect(out).toEqual([]);
  });

  it('still flags the shot before a water drop that does not chain', () => {
    const out = findShotChainDiscontinuities([
      {
        hole_number: 9,
        shots: [
          shot(1, { lie_before: 'tee', lie_after: 'other', distance_to_hole_before: 400, distance_to_hole_after: 150 }),
          shot(2, { is_penalty: true, penalty_type: 'water', lie_before: 'rough', lie_after: 'penalty', distance_to_hole_before: 90, distance_to_hole_after: 90 }),
        ],
      },
    ]);
    expect(out).toEqual([expect.objectContaining({ hole_number: 9, shot_number: 1, kind: 'lie' })]);
  });
});

describe('summarizeShotChainDiscontinuities', () => {
  it('writes one short line per break', () => {
    expect(
      summarizeShotChainDiscontinuities([
        { hole_number: 8, shot_number: 1, kind: 'lie', after: 'rough', next_before: 'tee' },
        { hole_number: 12, shot_number: 3, kind: 'distance', after: 150, next_before: 70 },
      ]),
    ).toBe('h8 s1 lie rough>tee; h12 s3 distance 150>70');
  });

  it('caps the list and counts the rest', () => {
    const breaks = Array.from({ length: 5 }, (_, i) => ({
      hole_number: i + 1,
      shot_number: 1,
      kind: 'distance' as const,
      after: 100,
      next_before: 50,
    }));
    expect(summarizeShotChainDiscontinuities(breaks, 2)).toBe('h1 s1 distance 100>50; h2 s1 distance 100>50; +3 more');
  });

  it('is empty when nothing broke', () => {
    expect(summarizeShotChainDiscontinuities([])).toBe('');
  });
});
