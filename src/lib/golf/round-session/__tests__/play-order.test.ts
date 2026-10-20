import { describe, expect, it } from 'vitest';
import {
  decidePostHoleCompleteAction,
  frontierIndex,
  isLastPlayIndex,
  lastPlayIndex,
  nextPlayIndex,
  normalizeStartHole,
  playedBefore,
  playOrder,
  playPosition,
  previousPlayIndex,
  startHoleOptions,
} from '../play-order';

describe('play order (shotgun start)', () => {
  it('normalizes the start hole to a position in the round, else hole 1', () => {
    expect(normalizeStartHole(6, 18)).toBe(6);
    expect(normalizeStartHole('6', 18)).toBe(6);
    expect(normalizeStartHole(undefined, 18)).toBe(1);
    expect(normalizeStartHole(null, 18)).toBe(1);
    expect(normalizeStartHole(0, 18)).toBe(1);
    expect(normalizeStartHole(19, 18)).toBe(1);
    expect(normalizeStartHole(12, 9)).toBe(1);
    expect(normalizeStartHole(2.5, 18)).toBe(1);
  });

  it('plays 6..18 then 1..5 from hole 6, as hole indexes', () => {
    const order = playOrder(18, 6);
    expect(order.map((i) => i + 1)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5]);
    expect(new Set(order).size).toBe(18);
  });

  it('is the plain order from hole 1', () => {
    expect(playOrder(18, 1)).toEqual(Array.from({ length: 18 }, (_, i) => i));
    expect(lastPlayIndex(18, 1)).toBe(17);
    expect(nextPlayIndex(3, 18, 1)).toBe(4);
  });

  it('wraps from hole 18 to hole 1 and ends on the hole before the start', () => {
    expect(nextPlayIndex(17, 18, 6)).toBe(0);
    expect(lastPlayIndex(18, 6)).toBe(4);
    expect(isLastPlayIndex(4, 18, 6)).toBe(true);
    expect(isLastPlayIndex(17, 18, 6)).toBe(false);
    // The last hole played has nothing after it.
    expect(nextPlayIndex(4, 18, 6)).toBe(4);
  });

  it('wraps inside a 9-hole round', () => {
    expect(playOrder(9, 4).map((i) => i + 1)).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3]);
    expect(nextPlayIndex(8, 9, 4)).toBe(0);
    expect(lastPlayIndex(9, 4)).toBe(2);
  });

  it('places each hole in the round as played', () => {
    expect(playPosition(5, 18, 6)).toBe(1);
    expect(playPosition(17, 18, 6)).toBe(13);
    expect(playPosition(0, 18, 6)).toBe(14);
    expect(playPosition(4, 18, 6)).toBe(18);
    expect(playedBefore(17, 0, 18, 6)).toBe(true);
    expect(playedBefore(0, 5, 18, 6)).toBe(false);
    expect(previousPlayIndex(0, 18, 6)).toBe(17);
    expect(previousPlayIndex(5, 18, 6)).toBeNull();
  });

  it('finds the frontier in play order, past hole 18', () => {
    const scored = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(frontierIndex(18, 6, (i) => scored.has(i))).toBe(0);
    expect(frontierIndex(18, 6, () => false)).toBe(5);
    expect(frontierIndex(18, 6, () => true)).toBe(-1);
  });

  it('offers each hole of the round, labelled by the card', () => {
    expect(startHoleOptions(9, [10, 11, 12, 13, 14, 15, 16, 17, 18])[0]).toEqual({ value: 1, label: 10 });
    expect(startHoleOptions(18).map((o) => o.value)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });
});

describe('decidePostHoleCompleteAction with a shotgun start', () => {
  it('advances from hole 18 to hole 1, not to the finish, when the round started on 6', () => {
    expect(decidePostHoleCompleteAction({ allHolesScored: false, isReEdit: false, holeIndex: 17, totalHoles: 18, startHole: 6 })).toEqual({
      type: 'advance',
      nextHoleIndex: 0,
    });
  });

  it('finishes after the 18th hole played (hole 5)', () => {
    expect(decidePostHoleCompleteAction({ allHolesScored: true, isReEdit: false, holeIndex: 4, totalHoles: 18, startHole: 6 })).toEqual({ type: 'finish' });
  });

  it('keeps the plain round unchanged without a start hole', () => {
    expect(decidePostHoleCompleteAction({ allHolesScored: false, isReEdit: false, holeIndex: 16, totalHoles: 18 })).toEqual({ type: 'advance', nextHoleIndex: 17 });
    expect(decidePostHoleCompleteAction({ allHolesScored: true, isReEdit: false, holeIndex: 17, totalHoles: 18 })).toEqual({ type: 'finish' });
  });

  it('walks a whole shotgun round: 18 holes, each once, in play order, then finish', () => {
    const scored = new Set<number>();
    let index = 5;
    const visited: number[] = [];
    for (let step = 0; step < 18; step++) {
      visited.push(index + 1);
      scored.add(index);
      const decision = decidePostHoleCompleteAction({ allHolesScored: scored.size === 18, isReEdit: false, holeIndex: index, totalHoles: 18, startHole: 6 });
      if (step < 17) {
        expect(decision.type).toBe('advance');
        if (decision.type === 'advance') index = decision.nextHoleIndex;
      } else {
        expect(decision).toEqual({ type: 'finish' });
      }
    }
    expect(visited).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5]);
  });

  it('returns to the frontier after re-editing an earlier hole', () => {
    expect(decidePostHoleCompleteAction({ allHolesScored: false, isReEdit: true, holeIndex: 7, totalHoles: 18, startHole: 6 })).toEqual({ type: 'return-to-frontier' });
  });
});
