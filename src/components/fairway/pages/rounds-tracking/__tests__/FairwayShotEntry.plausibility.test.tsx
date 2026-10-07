/**
 * Round-entry plausibility at the field (shared rules:
 * src/lib/golf/round-entry-validation.ts). `confirm` issues ask once and then
 * let the shot through; `block` issues disable the primary action with the
 * reason. An ordinary shot shows nothing and behaves exactly as before.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayShotEntry } from '../FairwayShotEntry';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

function props(overrides: Record<string, unknown> = {}) {
  const currentHole: RoundHole = { number: 4, par: 4, yardage: 420, score: null } as RoundHole;
  return {
    currentHole,
    currentShot: 1,
    shotHistory: [] as ShotRecord[],
    isTeeShot: true,
    isPutting: false,
    isApproachOrAroundGreen: false,
    usedDriver: true,
    resultOfShot: 'green' as ShotRecord['result'],
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    distanceToHole: 420,
    distanceUnit: 'yards' as const,
    distanceAfterShot: '20',
    distanceAfterUnit: 'feet' as const,
    isHoleComplete: false,
    undoSaving: false,
    showUndoConfirm: false,
    distanceInputRef: createRef<HTMLInputElement>(),
    dispatch: vi.fn(),
    onResultSelect: vi.fn(),
    isReadyForNextShot: () => true,
    onNextShot: vi.fn(),
    onAddPenalty: vi.fn(),
    onUndoLastShot: vi.fn(),
    ...overrides,
  };
}

const nextButton = () => screen.getByRole('button', { name: /record next shot|complete hole/i });

describe('FairwayShotEntry — plausibility', () => {
  it('asks to confirm a 420-yard drive onto the green, then allows it', () => {
    const p = props();
    render(<FairwayShotEntry {...p} />);
    expect(screen.getByText('A 420-yard drive onto the green? Tap to confirm.')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(nextButton()).toBeEnabled();
    fireEvent.click(nextButton());
    expect(p.onNextShot).toHaveBeenCalledTimes(1);
  });

  it('hard-blocks a 540-yard drive onto a par-5 green with no confirm option', () => {
    render(
      <FairwayShotEntry
        {...props({ currentHole: { number: 9, par: 5, yardage: 540, score: null } as RoundHole, distanceToHole: 540 })}
      />,
    );
    expect(screen.getAllByText(/540-yard drive onto the green isn't possible/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });

  it('leaves an ordinary drive untouched', () => {
    const p = props({ resultOfShot: 'fairway', distanceAfterShot: '150', distanceAfterUnit: 'yards', missDirection: null });
    render(<FairwayShotEntry {...p} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(nextButton()).toBeEnabled();
  });

  it('asks to confirm an approach that leaves more distance than it started with', () => {
    render(
      <FairwayShotEntry
        {...props({
          currentShot: 2, isTeeShot: false, isApproachOrAroundGreen: true, resultOfShot: 'rough',
          approachMissDirection: 'left', distanceToHole: 120, distanceAfterShot: '140', distanceAfterUnit: 'yards',
        })}
      />,
    );
    expect(screen.getByText(/further away \(140 yds\)/)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });
});
