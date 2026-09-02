/**
 * B5: client-side hole-config bounds must match (or, where the server has no
 * upper bound at all, still impose a sane one) the server's own limits, so a
 * typo cannot produce a hole that fails validation only once it reaches
 * `savePartialRound`/`submitGolfRoundComprehensive` (A3's `hole_invalid`).
 *
 * The server's `comprehensiveHoleSchema` (golf.ts) bounds `par` to 3-6 and
 * puts NO upper bound on hole `yardage` at all — this component's own
 * `yardage > 0` check was the only thing standing between a fat-fingered
 * "18500" and a hole nobody can meaningfully play. 999 is the client-side
 * ceiling this pins (longest real course holes run under 700 yards).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayHoleConfig } from '../FairwayHoleConfig';

describe('FairwayHoleConfig — yardage upper bound (B5)', () => {
  it('blocks Save with an inline message when a hole yardage exceeds the sane ceiling', () => {
    const onSave = vi.fn();
    render(
      <FairwayHoleConfig
        courseName="Test Course"
        holesPerRound={9}
        initialHoles={Array.from({ length: 9 }, (_, i) => ({
          holeNumber: i + 1,
          par: 4,
          yardage: i === 0 ? 5000 : 400,
        }))}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Start round →'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/999/)).toBeInTheDocument();
  });

  it('saves normally when every hole is within bounds', () => {
    const onSave = vi.fn();
    render(
      <FairwayHoleConfig
        courseName="Test Course"
        holesPerRound={9}
        initialHoles={Array.from({ length: 9 }, (_, i) => ({
          holeNumber: i + 1,
          par: 4,
          yardage: 400,
        }))}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Start round →'));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
