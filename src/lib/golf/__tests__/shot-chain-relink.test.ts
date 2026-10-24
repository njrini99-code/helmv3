import { describe, it, expect } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';
import { relinkAfterDelete, relinkAfterEdit } from '@/lib/golf/shot-chain-relink';
import { findShotChainDiscontinuities } from '@/lib/golf/shot-ledger-continuity';
import { deriveLieAfter } from '@/lib/utils/shot-helpers';

function shot(n: number, o: Partial<ShotRecord> = {}): ShotRecord {
  return {
    shotNumber: n,
    shotType: 'approach',
    clubType: 'non_driver',
    lieBefore: 'fairway',
    distanceToHoleBefore: 150,
    distanceUnitBefore: 'yards',
    result: 'green',
    distanceToHoleAfter: 20,
    distanceUnitAfter: 'feet',
    shotDistance: 143,
    isPenalty: false,
    ...o,
  };
}

function penalty(n: number, type: NonNullable<ShotRecord['penaltyType']>, o: Partial<ShotRecord> = {}): ShotRecord {
  return shot(n, {
    shotType: 'penalty',
    result: 'penalty',
    isPenalty: true,
    penaltyType: type,
    shotDistance: 0,
    ...o,
  });
}

/** The submit payload's view of a hole, as round-submit builds it. */
function chainBreaks(history: readonly ShotRecord[]) {
  return findShotChainDiscontinuities([
    {
      hole_number: 1,
      shots: history.map(s => ({
        shot_number: s.shotNumber,
        lie_before: s.lieBefore,
        lie_after: deriveLieAfter(s),
        distance_to_hole_before: s.distanceToHoleBefore,
        distance_unit_before: s.distanceUnitBefore,
        distance_to_hole_after: s.distanceToHoleAfter,
        distance_unit_after: s.distanceUnitAfter,
        is_penalty: s.isPenalty,
        penalty_type: s.penaltyType ?? null,
      })),
    },
  ]);
}

const PAR4 = (): ShotRecord[] => [
  shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250 }),
  shot(2, { distanceToHoleBefore: 150, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
  shot(3, { shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 7, puttDistanceFeet: 20 }),
];

/** Tee to fairway 150, an errant stroke from 150 that went OB, the OB row at 150, the replay from 150. */
const OB_PAIR = (): ShotRecord[] => [
  shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250 }),
  shot(2, { lieBefore: 'fairway', distanceToHoleBefore: 150, result: 'other', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 0 }),
  penalty(3, 'ob', { lieBefore: 'fairway', distanceToHoleBefore: 150, distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
  shot(4, { lieBefore: 'fairway', distanceToHoleBefore: 150, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
];

describe('relinkAfterEdit', () => {
  it('moves the next shot\'s lie as well as its distance when a result changes', () => {
    const before = PAR4();
    const edited = { ...before[0]!, result: 'rough' as const, distanceToHoleAfter: 160 };
    const history = [edited, before[1]!, before[2]!];

    const { history: out, changed } = relinkAfterEdit(history, 0, before[0]!);

    expect(changed).toEqual([1]);
    expect(out[1]).toMatchObject({ lieBefore: 'rough', distanceToHoleBefore: 160, distanceUnitBefore: 'yards' });
    expect(chainBreaks(out)).toEqual([]);
  });

  it('keeps a recovery lie the player chose after a ball in the rough', () => {
    const before = PAR4();
    const recovery = { ...before[1]!, lieBefore: 'other' as const };
    const original = { ...before[0]!, result: 'rough' as const };
    const edited = { ...original, distanceToHoleAfter: 140 };

    const { history: out } = relinkAfterEdit([edited, recovery, before[2]!], 0, original);

    expect(out[1]).toMatchObject({ lieBefore: 'other', distanceToHoleBefore: 140 });
  });

  it('moves the previous shot\'s end when the player changes where a shot was played from', () => {
    const before = PAR4();
    const edited = { ...before[1]!, lieBefore: 'rough' as const, distanceToHoleBefore: 120 };
    const history = [before[0]!, edited, before[2]!];

    const { history: out, changed } = relinkAfterEdit(history, 1, before[1]!);

    expect(changed).toEqual([0]);
    expect(out[0]).toMatchObject({ result: 'rough', distanceToHoleAfter: 120, distanceUnitAfter: 'yards', shotDistance: 280 });
    expect(chainBreaks(out)).toEqual([]);
  });

  it('moves a putt\'s start and its putt length when the approach before it changes', () => {
    const before = PAR4();
    const edited = { ...before[1]!, distanceToHoleAfter: 8 };

    const { history: out, changed } = relinkAfterEdit([before[0]!, edited, before[2]!], 1, before[1]!);

    expect(changed).toEqual([2]);
    expect(out[2]).toMatchObject({ distanceToHoleBefore: 8, distanceUnitBefore: 'feet', puttDistanceFeet: 8 });
    expect(chainBreaks(out)).toEqual([]);
  });

  it('carries a changed end through a water drop to the shot after it', () => {
    const history = [
      shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'other', distanceToHoleAfter: 130, distanceUnitAfter: 'yards' }),
      penalty(2, 'water', { lieBefore: 'other', distanceToHoleBefore: 130, distanceToHoleAfter: 130, distanceUnitAfter: 'yards' }),
      shot(3, { lieBefore: 'other', distanceToHoleBefore: 130 }),
    ];
    const edited = { ...history[0]!, distanceToHoleAfter: 110 };

    const { history: out, changed } = relinkAfterEdit([edited, history[1]!, history[2]!], 0, history[0]!);

    expect(changed).toEqual([1, 2]);
    expect(out[1]).toMatchObject({ distanceToHoleBefore: 110, distanceToHoleAfter: 110 });
    expect(out[2]).toMatchObject({ distanceToHoleBefore: 110 });
    expect(chainBreaks(out)).toEqual([]);
  });

  it('leaves the re-tee alone when only the end of an out-of-bounds shot changes', () => {
    const history = [
      shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'other', distanceToHoleAfter: 140, distanceUnitAfter: 'yards' }),
      penalty(2, 'ob', { lieBefore: 'tee', distanceToHoleBefore: 400, distanceToHoleAfter: 400, distanceUnitAfter: 'yards' }),
      shot(3, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
    ];
    const edited = { ...history[0]!, distanceToHoleAfter: 120 };

    const { changed } = relinkAfterEdit([edited, history[1]!, history[2]!], 0, history[0]!);

    expect(changed).toEqual([]);
  });

  it('replays from the corrected tee when the start of an out-of-bounds shot changes', () => {
    const history = [
      shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'other', distanceToHoleAfter: 140, distanceUnitAfter: 'yards' }),
      penalty(2, 'ob', { lieBefore: 'tee', distanceToHoleBefore: 400, distanceToHoleAfter: 400, distanceUnitAfter: 'yards' }),
      shot(3, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
    ];
    const edited = { ...history[0]!, distanceToHoleBefore: 385 };

    const { history: out, changed } = relinkAfterEdit([edited, history[1]!, history[2]!], 0, history[0]!);

    expect(changed).toEqual([1, 2]);
    expect(out[1]).toMatchObject({ distanceToHoleBefore: 385, distanceToHoleAfter: 385 });
    expect(out[2]).toMatchObject({ lieBefore: 'tee', distanceToHoleBefore: 385 });
  });

  it('stops at a penalty row when walking back: only the row moves', () => {
    const history = [
      shot(1, { shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'other', distanceToHoleAfter: 130, distanceUnitAfter: 'yards' }),
      penalty(2, 'water', { lieBefore: 'other', distanceToHoleBefore: 130, distanceToHoleAfter: 130, distanceUnitAfter: 'yards' }),
      shot(3, { lieBefore: 'other', distanceToHoleBefore: 130 }),
    ];
    const edited = { ...history[2]!, lieBefore: 'rough' as const, distanceToHoleBefore: 125 };

    const { history: out, changed } = relinkAfterEdit([history[0]!, history[1]!, edited], 2, history[2]!);

    expect(changed).toEqual([1]);
    expect(out[0]).toEqual(history[0]);
    expect(out[1]).toMatchObject({ lieBefore: 'rough', distanceToHoleBefore: 125, distanceToHoleAfter: 125 });
  });

  it('updates the miss lie with the result so the stored lie follows', () => {
    const before = PAR4();
    const original = { ...before[1]!, result: 'sand' as const, distanceToHoleAfter: 15, distanceUnitAfter: 'yards' as const, approachMissDirection: 'short' as const, approachMissLieType: 'bunker' as const };
    const putt = { ...before[2]!, lieBefore: 'sand' as const, distanceToHoleBefore: 15, distanceUnitBefore: 'yards' as const };
    const editedPutt = { ...putt, lieBefore: 'rough' as const };

    const { history: out } = relinkAfterEdit([before[0]!, original, editedPutt], 2, putt);

    expect(out[1]).toMatchObject({ result: 'rough', approachMissLieType: 'rough' });
    expect(deriveLieAfter(out[1]!)).toBe('rough');
  });

  it('files an approach that now ends in other under the rough miss, as live entry does', () => {
    const before = PAR4();
    const original = { ...before[1]!, result: 'sand' as const, distanceToHoleAfter: 15, distanceUnitAfter: 'yards' as const, approachMissDirection: 'short' as const, approachMissLieType: 'bunker' as const };
    const putt = { ...before[2]!, lieBefore: 'sand' as const, distanceToHoleBefore: 15, distanceUnitBefore: 'yards' as const };
    const editedPutt = { ...putt, lieBefore: 'other' as const };

    const { history: out } = relinkAfterEdit([before[0]!, original, editedPutt], 2, putt);

    expect(out[1]).toMatchObject({ result: 'other', approachMissLieType: 'rough' });
  });

  it('moves the OB row and the replay when the shot before the OB stroke changes', () => {
    const history = OB_PAIR();
    const edited = { ...history[0]!, result: 'rough' as const, distanceToHoleAfter: 160 };

    const { history: out, changed } = relinkAfterEdit([edited, ...history.slice(1)], 0, history[0]!);

    expect(changed).toEqual([1, 2, 3]);
    // The errant stroke starts and ends where the tee shot now finished.
    expect(out[1]).toMatchObject({ lieBefore: 'rough', distanceToHoleBefore: 160, distanceToHoleAfter: 160, shotDistance: 0 });
    expect(out[2]).toMatchObject({ lieBefore: 'rough', distanceToHoleBefore: 160, distanceToHoleAfter: 160 });
    expect(out[3]).toMatchObject({ lieBefore: 'rough', distanceToHoleBefore: 160 });
  });

  it('turns a putt that now starts just off the green into an around-the-green shot', () => {
    const before = PAR4();
    const putt = { ...before[2]!, clubType: 'putter' as const, puttBreak: 'left_to_right' as const, puttSlope: 'uphill' as const };
    const edited = { ...before[1]!, result: 'rough' as const, distanceToHoleAfter: 10, distanceUnitAfter: 'yards' as const };

    const { history: out, changed } = relinkAfterEdit([before[0]!, edited, putt], 1, before[1]!);

    expect(changed).toEqual([2]);
    expect(out[2]).toMatchObject({
      shotType: 'around_green',
      clubType: 'non_driver',
      lieBefore: 'rough',
      distanceToHoleBefore: 10,
      distanceUnitBefore: 'yards',
    });
    expect(out[2]!.puttDistanceFeet).toBeUndefined();
    expect(out[2]!.puttBreak).toBeUndefined();
    expect(out[2]!.puttSlope).toBeUndefined();
  });

  it('turns a putt that now starts 50 yd or more out into an approach', () => {
    const before = PAR4();
    const edited = { ...before[1]!, result: 'rough' as const, distanceToHoleAfter: 60, distanceUnitAfter: 'yards' as const };

    const { history: out } = relinkAfterEdit([before[0]!, edited, before[2]!], 1, before[1]!);

    expect(out[2]).toMatchObject({ shotType: 'approach', lieBefore: 'rough', distanceToHoleBefore: 60 });
  });

  it('splits a moved putt at 50 yd exactly as live entry does: 49 is around the green, 50 is an approach', () => {
    const before = PAR4();
    const at = (yards: number) => {
      const edited = { ...before[1]!, result: 'rough' as const, distanceToHoleAfter: yards, distanceUnitAfter: 'yards' as const };
      return relinkAfterEdit([before[0]!, edited, before[2]!], 1, before[1]!).history[2]!.shotType;
    };

    expect(at(49)).toBe('around_green');
    expect(at(50)).toBe('approach');
  });

  it('changes nothing around an edit that keeps the shot\'s start and end', () => {
    const before = PAR4();
    const edited = { ...before[1]!, clubType: 'driver' as const };

    expect(relinkAfterEdit([before[0]!, edited, before[2]!], 1, before[1]!).changed).toEqual([]);
  });
});

describe('relinkAfterDelete', () => {
  it('starts the shot after a deleted one where the shot before it ended', () => {
    const history = [
      shot(1, { shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 30, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 5, distanceUnitAfter: 'feet' }),
      shot(2, { shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 1, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', puttDistanceFeet: 1 }),
    ];

    const { history: out, changed } = relinkAfterDelete(history, 1);

    expect(changed).toEqual([1]);
    expect(out[1]).toMatchObject({ distanceToHoleBefore: 5, puttDistanceFeet: 5 });
    expect(chainBreaks(out)).toEqual([]);
  });

  it('leaves the OB row and the replay where they are when the OB stroke is deleted', () => {
    const history = OB_PAIR();
    const remaining = [history[0]!, history[2]!, history[3]!];

    const { history: out, changed } = relinkAfterDelete(remaining, 1);

    expect(changed).toEqual([]);
    expect(out[1]).toMatchObject({ distanceToHoleBefore: 150 });
    expect(out[2]).toMatchObject({ lieBefore: 'fairway', distanceToHoleBefore: 150 });
  });

  it('leaves a new first shot as it is', () => {
    const before = PAR4();
    expect(relinkAfterDelete([before[1]!, before[2]!], 0).changed).toEqual([]);
  });
});
