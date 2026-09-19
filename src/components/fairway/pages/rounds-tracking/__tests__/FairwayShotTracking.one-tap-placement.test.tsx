import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import type { OneTapLiveRound } from '@/lib/golf/one-tap/live-round-placement';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import FairwayShotTracking from '../FairwayShotTracking';

/** Master plan §77 placement: Meridian Live replaces the shot-entry screen
 * only for an eligible live round and only on holes its package maps. */
const location: LocationSource = { kind: 'synthetic', subscribe: () => () => {} };
const packageHoles = [...pilotPackage.holes].sort((a, b) => a.ordinal - b.ordinal);
const holes = [
  { number: packageHoles[0]!.ordinal, par: 4, yardage: 380, score: null },
  { number: 99, par: 3, yardage: 150, score: null }, // not in the package
];
const live: OneTapLiveRound = { roundId: 'r1', courseId: 'peek-n-peak-upper', geometryVersion: pilotPackage.contentHash, pkg: pilotPackage, holeKeys: packageHoles.map(h => h.key), location, storage: null };
const base = { holes, onHoleComplete: async () => true, statusSlot: <div data-testid="host-status">host status</div> };
const liveHole = () => document.querySelector('[data-slot="one-tap-live-hole"]');

describe('FairwayShotTracking one-tap placement', () => {
  beforeEach(() => {
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    Element.prototype.scrollIntoView ??= () => {};
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders the existing tracker unchanged for every round without a live round', () => {
    const { container } = render(<FairwayShotTracking {...base} currentHoleIndex={0} />);
    expect(liveHole()).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-screen"]')).toBeNull();
    expect(container.textContent).toContain('host status');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('offers the round\u2019s Live switch in the standard chrome, only for an eligible round the phone has not turned on', () => {
    const onLiveOptIn = vi.fn();
    const { container, rerender } = render(<FairwayShotTracking {...base} currentHoleIndex={0} liveStatus={{ phase: 'off', reason: 'opt_in_off' }} onLiveOptIn={onLiveOptIn} />);
    expect(liveHole()).toBeNull();
    const row = container.querySelector('[data-slot="one-tap-live-status"]')!;
    expect(row.getAttribute('data-reason')).toBe('opt_in_off');
    expect(row.textContent).toContain('Meridian Live off · for this round');
    const turnOn = container.querySelector<HTMLButtonElement>('[data-slot="one-tap-live-turn-on"]')!;
    expect(turnOn.textContent).toBe('Turn on');
    turnOn.click();
    expect(onLiveOptIn).toHaveBeenCalledWith(true);
    // The kill switch (flag off) offers nothing; another course shows no row at all.
    rerender(<FairwayShotTracking {...base} currentHoleIndex={0} liveStatus={{ phase: 'off', reason: 'feature_flag_off' }} onLiveOptIn={onLiveOptIn} />);
    expect(container.querySelector('[data-slot="one-tap-live-turn-on"]')).toBeNull();
    expect(container.querySelector('[data-slot="one-tap-live-status"]')!.textContent).toContain('not enabled in this environment');
    rerender(<FairwayShotTracking {...base} currentHoleIndex={0} liveStatus={{ phase: 'inactive' }} onLiveOptIn={onLiveOptIn} />);
    expect(container.querySelector('[data-slot="one-tap-live-status"]')).toBeNull();
  });

  it('replaces the shot-entry screen with Meridian Live on a hole the package maps, keeping the host status slot', () => {
    const { container } = render(<FairwayShotTracking {...base} liveRound={live} currentHoleIndex={0} />);
    expect(liveHole()?.getAttribute('data-hole-number')).toBe(String(holes[0]!.number));
    expect(liveHole()?.getAttribute('data-ledger')).toBe('open');
    expect(document.querySelector('[data-slot="one-tap-screen"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="one-tap-mark"]')).not.toBeNull();
    expect(container.textContent).toContain('host status');
    // Nothing is checkpointed before a hole closes; the ledger seam stays quiet.
    expect(document.querySelector('[data-slot="one-tap-manual-completion"]')).toBeNull();
  });

  it('falls back to the existing tracker on a hole the package does not map', () => {
    render(<FairwayShotTracking {...base} liveRound={live} currentHoleIndex={1} />);
    expect(liveHole()).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-screen"]')).toBeNull();
  });
});
