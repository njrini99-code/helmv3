import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { ShotLog } from '../parts';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * F-0019 / F-0020 (audit 2026-10-29): the shot card grew 150 px when a result was picked (the distance row mounted then)
 * and snapped back 258 px on Next shot. The row is held, hidden and inert, from the first frame; the log line settles in.
 * Layout and motion only: nothing about what is recorded changes.
 */
Element.prototype.scrollIntoView ??= function () {};
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
afterEach(cleanup);

const HOLES: RoundHole[] = [{ number: 1, par: 4, yardage: 380, score: null }];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };

describe('the distance row is held before a result (F-0019, F-0020)', () => {
  it('exists, inert and hidden, before a result; live after one', async () => {
    const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete: vi.fn(async () => true), onNavigateToHole: vi.fn(), onAutoSave: vi.fn(async () => undefined) };
    render(
      <ToastProvider>
        <RoundTracking {...props} />
      </ToastProvider>,
    );
    const input = document.getElementById('ch-rt-dist');
    expect(input, 'the row is in the card before a result').not.toBeNull();
    const reserved = input!.closest('.is-reserved');
    expect(reserved).not.toBeNull();
    expect(reserved!.hasAttribute('inert')).toBe(true);
    expect(reserved!.getAttribute('aria-hidden')).toBe('true');
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Fairway' }));
    const live = document.getElementById('ch-rt-dist')!;
    expect(live.closest('.is-reserved')).toBeNull();
    expect(live.closest('[inert]')).toBeNull();
  });
});

describe('the log line settles in on the next shot (F-0020)', () => {
  const tee: ShotRecord = { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 380, distanceUnitBefore: 'yards', result: 'fairway', distanceToHoleAfter: 140, distanceUnitAfter: 'yards', shotDistance: 240, isPenalty: false };
  const approach: ShotRecord = { ...tee, shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway', distanceToHoleBefore: 140, result: 'green', distanceToHoleAfter: 12, distanceUnitAfter: 'feet', shotDistance: 136 };
  it('the Last line is an inline swap keyed by the shot count', () => {
    const view = (shots: ShotRecord[]) => (
      <LazyMotion features={domAnimation}>
        <ShotLog shots={shots} pref="yards" />
      </LazyMotion>
    );
    const { rerender } = render(view([tee]));
    rerender(view([tee, approach]));
    const swap = document.querySelector('.ch-rt-log__t .ch-swap--inline');
    expect(swap).not.toBeNull();
    expect(swap!.textContent).toMatch(/Last:/);
  });
});
