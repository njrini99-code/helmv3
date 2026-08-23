// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayCompletedHole } from './FairwayCompletedHole';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

const hole: RoundHole = { number: 1, par: 4, yardage: 410, score: 4 };
const shots: ShotRecord[] = [
  {
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 410,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 120,
    distanceUnitAfter: 'yards',
    shotDistance: 290,
    isPenalty: false,
  },
  {
    shotNumber: 4,
    shotType: 'putting',
    clubType: 'putter',
    lieBefore: 'green',
    distanceToHoleBefore: 4,
    distanceUnitBefore: 'feet',
    result: 'hole',
    distanceToHoleAfter: 0,
    distanceUnitAfter: 'feet',
    shotDistance: 1,
    isPenalty: false,
  },
];

describe('FairwayCompletedHole checkpoint recovery', () => {
  it('offers one explicit retry when a completed-hole checkpoint fails', () => {
    const onRetryCheckpoint = vi.fn();

    render(
      <FairwayCompletedHole
        shotHistory={shots}
        currentHole={hole}
        checkpointStatus="failed"
        showBackToCurrentHole={false}
        nextUnplayedIdx={1}
        onEditShot={vi.fn()}
        onNavigateToHole={vi.fn()}
        onRetryCheckpoint={onRetryCheckpoint}
      />,
    );

    expect(screen.getByText('This hole needs a save retry')).toBeInTheDocument();
    expect(screen.getByText('Your shots are safely retained on this device. Retry once you are connected.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(onRetryCheckpoint).toHaveBeenCalledOnce();
  });

  it('holds edits while a completed-hole checkpoint is in flight', () => {
    render(
      <FairwayCompletedHole
        shotHistory={shots}
        currentHole={hole}
        checkpointStatus="saving"
        showBackToCurrentHole={false}
        nextUnplayedIdx={1}
        onEditShot={vi.fn()}
        onNavigateToHole={vi.fn()}
        onRetryCheckpoint={vi.fn()}
      />,
    );

    expect(screen.getByText('Saving this hole…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tee/i })).toBeDisabled();
  });
});
