/**
 * B5: client-side input bounds must match the server's Zod bounds so a typo
 * cannot create an invalid shot that only fails once it reaches
 * `savePartialRound` (A3's `hole_invalid`, golf.ts's `comprehensiveShotSchema`
 * — `distanceToHoleBefore: z.number().min(0).max(1000)`).
 *
 * `distanceAfterShot` entered here becomes the NEXT shot's
 * `distanceToHoleBefore`, so it needs the identical 1000-yard ceiling. The
 * "distance remaining" case (not putting, not on the green) is always in
 * yards (`lockedAfterUnit`), so no unit conversion is needed for the default
 * 'yards' preference this test exercises.
 */
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayShotEntry } from '../FairwayShotEntry';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

function baseProps() {
  const currentHole: RoundHole = { number: 1, par: 4, yardage: 400, score: null } as RoundHole;
  return {
    currentHole,
    currentShot: 2,
    shotHistory: [] as ShotRecord[],
    isTeeShot: false,
    isPutting: false,
    isApproachOrAroundGreen: false,
    usedDriver: null,
    resultOfShot: 'fairway' as ShotRecord['result'],
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    distanceToHole: 150,
    distanceUnit: 'yards' as const,
    distanceAfterUnit: 'yards' as const,
    isHoleComplete: false,
    undoSaving: false,
    showUndoConfirm: false,
    distanceInputRef: createRef<HTMLInputElement>(),
    dispatch: vi.fn(),
    onResultSelect: vi.fn(),
    onNextShot: vi.fn(),
    onAddPenalty: vi.fn(),
    onUndoLastShot: vi.fn(),
  };
}

describe('FairwayShotEntry — distance-remaining upper bound (B5)', () => {
  it('blocks Next Shot with an inline message when the distance remaining exceeds 1000 yards', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        distanceAfterShot="1500"
        isReadyForNextShot={() => false}
      />,
    );

    expect(screen.getByText(/1000 yards or less/i)).toBeInTheDocument();
  });

  it('does not block a distance remaining within bounds', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        distanceAfterShot="150"
        isReadyForNextShot={() => true}
      />,
    );

    expect(screen.queryByText(/1000 yards or less/i)).not.toBeInTheDocument();
  });
});

// B8: entering "0" (or a value that rounds to 0 after unit conversion, e.g.
// a fraction of a meter) passed `isReadyForNextShot()` before this fix —
// `parsed >= 0` is a valid finite number — so the primary action looked
// enabled. Tapping it then hit `handleNextShot`'s OWN
// `if (distanceAfter === 0) { ...; return; }` bail, with no player-facing
// feedback at all: a dead tap. Block it here instead, with the same inline
// message mechanism as every other blocker.
describe('FairwayShotEntry — distance-remaining cannot be 0 (B8)', () => {
  it('blocks Next Shot with an inline message when the distance remaining is 0', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        distanceAfterShot="0"
        isReadyForNextShot={() => false}
      />,
    );

    expect(screen.getByText(/select hole if you holed out/i)).toBeInTheDocument();
  });

  it('blocks Next Shot for a green-proximity entry of 0', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        resultOfShot="green"
        distanceAfterShot="0"
        distanceAfterUnit="feet"
        isReadyForNextShot={() => false}
      />,
    );

    expect(screen.getByText(/select hole if you holed out/i)).toBeInTheDocument();
  });
});
