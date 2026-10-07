/**
 * D-SUBMIT (owner decision 2026-09-23): the round-submitted moment is a
 * self-drawing checkmark (~400ms) plus ONE signature success haptic, owned by
 * the overlay so New Round and Continue Round can't double it.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fwHaptic = vi.fn();
vi.mock('@/lib/fairway/haptics', () => ({ fwHaptic: (...a: unknown[]) => fwHaptic(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
let reduced = false;
vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => reduced }));

import { CHECK_DRAW_DELAY_MS, CHECK_DRAW_MS, FairwayRoundSubmitOverlay } from '../FairwayRoundSubmitOverlay';

const props = {
  isVisible: true,
  totalScore: 72,
  toPar: 0,
  courseName: 'Test Course',
  onGoBack: () => {},
};

beforeEach(() => {
  vi.useFakeTimers();
  fwHaptic.mockClear();
  reduced = false;
});
afterEach(() => vi.useRealTimers());

describe('FairwayRoundSubmitOverlay — success signature', () => {
  it('draws a checkmark path in the success badge', () => {
    const { container } = render(<FairwayRoundSubmitOverlay {...props} completedRoundId="r1" />);
    expect(container.ownerDocument.querySelector('[data-slot="submit-check"] path')).not.toBeNull();
  });

  it('fires exactly one success haptic when the check finishes drawing', () => {
    render(<FairwayRoundSubmitOverlay {...props} completedRoundId="r1" />);
    act(() => { vi.advanceTimersByTime(CHECK_DRAW_DELAY_MS + CHECK_DRAW_MS - 1); });
    expect(fwHaptic).not.toHaveBeenCalledWith('success');
    act(() => { vi.advanceTimersByTime(1); });
    expect(fwHaptic.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(fwHaptic.mock.calls.filter(([k]) => k === 'success')).toHaveLength(1);
  });

  it('fires it immediately under reduced motion', () => {
    reduced = true;
    render(<FairwayRoundSubmitOverlay {...props} completedRoundId="r1" />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(fwHaptic).toHaveBeenCalledWith('success');
  });

  it('does not fire while submitting or on an error', () => {
    const { rerender } = render(<FairwayRoundSubmitOverlay {...props} />);
    act(() => { vi.advanceTimersByTime(2000); });
    rerender(<FairwayRoundSubmitOverlay {...props} error="Nope" />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(fwHaptic).not.toHaveBeenCalledWith('success');
  });
});
