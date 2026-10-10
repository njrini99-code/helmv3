/**
 * Tap in on the Fairway entry: the same plan as Clubhouse (shot-entry-rules
 * planTapIn, written by useShotTracking.handleTapIn), drawn as a quiet ghost
 * action under the putt result, only when the plan offers it.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayShotEntry } from '../FairwayShotEntry';
import { planTapIn } from '@/lib/golf/shot-entry-rules';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

const HOLE = { number: 4, par: 4, yardage: 420, score: null } as RoundHole;
const HISTORY: ShotRecord[] = [
  { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 420, distanceUnitBefore: 'yards', result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 270, isPenalty: false },
  { shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway', distanceToHoleBefore: 150, distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 150, isPenalty: false },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    currentHole: HOLE,
    currentShot: 3,
    shotHistory: HISTORY,
    isTeeShot: false,
    isPutting: true,
    isApproachOrAroundGreen: false,
    usedDriver: null,
    resultOfShot: null,
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    distanceToHole: 2,
    distanceUnit: 'feet' as const,
    distanceAfterShot: '',
    distanceAfterUnit: 'feet' as const,
    isHoleComplete: false,
    undoSaving: false,
    showUndoConfirm: false,
    distanceInputRef: createRef<HTMLInputElement>(),
    dispatch: vi.fn(),
    onResultSelect: vi.fn(),
    isReadyForNextShot: () => false,
    onNextShot: vi.fn(),
    onAddPenalty: vi.fn(),
    onUndoLastShot: vi.fn(),
    ...overrides,
  };
}

const plan = planTapIn({
  hole: HOLE,
  currentShot: 3,
  shotHistory: HISTORY,
  currentLie: 'green',
  isPutting: true,
  distanceToHole: 2,
  distanceUnit: 'feet',
  resultOfShot: null,
  distanceAfterShot: '',
  puttBreak: null,
  puttSlope: null,
});

describe('FairwayShotEntry — tap in', () => {
  it('draws a quiet Tap in with the strokes and score it writes, and calls the engine on one tap', () => {
    const onTapIn = vi.fn(async () => true);
    render(<FairwayShotEntry {...props({ tapIn: plan, onTapIn })} />);
    expect(screen.getByText('Holed from 2 ft · score 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tap in: holed from 2 ft, score 3' }));
    expect(onTapIn).toHaveBeenCalledTimes(1);
  });

  it('is not drawn when the plan does not offer it (off the green, a result picked, a holed hole)', () => {
    render(<FairwayShotEntry {...props({ tapIn: null, onTapIn: vi.fn() })} />);
    expect(screen.queryByRole('button', { name: /^Tap in/ })).toBeNull();
  });
});
