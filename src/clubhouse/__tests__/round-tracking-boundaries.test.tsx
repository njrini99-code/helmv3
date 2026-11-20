import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole } from '@/lib/types/golf';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

/**
 * GAP-S-10: on the tracking screen the hole map and the shot log are sections. A drawing that throws is named in place
 * (CH-11291) and the shot card and its keys stay, so the round can still be scored. ShotEntry is never wrapped.
 */
const broken = vi.hoisted(() => ({ map: false, log: false }));
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
vi.mock('../screens/rounds/track/parts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../screens/rounds/track/parts')>();
  return {
    ...real,
    HoleMap: (p: Parameters<typeof real.HoleMap>[0]) => {
      if (broken.map) throw new Error('map broke');
      return real.HoleMap(p);
    },
    ShotLog: (p: Parameters<typeof real.ShotLog>[0]) => {
      if (broken.log) throw new Error('log broke');
      return real.ShotLog(p);
    },
  };
});

Element.prototype.scrollIntoView ??= function () {};

const { RoundTracking } = await import('../screens/rounds/track/RoundTracking');

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 420, score: null },
  { number: 2, par: 5, yardage: 540, score: null },
];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };

const draw = () =>
  render(
    <ToastProvider>
      <RoundTracking round={ROUND} holes={HOLES} currentHoleIndex={0} onHoleComplete={vi.fn(async () => true)} onNavigateToHole={vi.fn()} />
    </ToastProvider>,
  );

beforeEach(() => {
  broken.map = false;
  broken.log = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the tracking screen’s sections', () => {
  it('a hole map that throws is named in place, and the shot card still scores', () => {
    broken.map = true;
    const { container } = draw();
    const notice = container.querySelector('[data-ch-code="CH-11291"]')!;
    expect(notice.textContent).toContain('The hole map couldn’t be shown');
    expect(container.querySelector('.ch-rt-panel')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Next shot$|^Hole out, score/ })).toBeTruthy();
  });

  it('a shot log that throws is named in place too', () => {
    broken.log = true;
    const { container } = draw();
    expect(container.querySelector('[data-ch-code="CH-11291"]')!.textContent).toContain('The shots on this hole couldn’t be shown');
    expect(container.querySelector('.ch-rt-hero__map')).not.toBeNull();
  });

  it('draws no notice when nothing throws', () => {
    const { container } = draw();
    expect(container.querySelector('[data-ch-code="CH-11291"]')).toBeNull();
  });
});
