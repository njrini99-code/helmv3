// @vitest-environment jsdom
/**
 * FairwayShotTracking — what changes with course geometry, and what must not.
 *
 * Plan §unlock 3 threads the approved Upper package into the tracker for a
 * Peek'n Peak Upper round only. Every other round reaches this component with
 * no `geometry`, and for it the chrome shipped on main is the contract: the
 * full scorecard header and shot pills while putting, nothing selected until
 * the player taps a pill, the hole card shipped on main above the entry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import type { ShotRecord } from '@/lib/types/golf';
import FairwayShotTracking from '../FairwayShotTracking';

const packageHoles = [...pilotPackage.holes].sort((a, b) => a.ordinal - b.ordinal);
const holes = [{ number: packageHoles[6]!.ordinal, par: 4, yardage: 380, score: null }];
const geometry = { package: pilotPackage, holeKeys: [packageHoles[6]!.key] };
// Two recorded shots, the second on the green: the next entry is a putt.
const onGreen: ShotRecord[] = [
  { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 380, distanceUnitBefore: 'yards', result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 230, isPenalty: false },
  { shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway', distanceToHoleBefore: 150, distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet', shotDistance: 143, isPenalty: false },
];
const base = { holes, currentHoleIndex: 0, onHoleComplete: async () => true, initialShots: onGreen, initialShotNumber: 3 };
const pills = (root: ParentNode) => root.querySelector('[role="group"][aria-label="Shot progress"]');
const compactPuttingChrome = (root: ParentNode) => root.querySelector('[data-putting-round-chrome="compact"]');

describe('FairwayShotTracking with and without course geometry', () => {
  beforeEach(() => {
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    Element.prototype.scrollIntoView ??= () => {};
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('without geometry (every other course) keeps the putting chrome, pills, selection and hole card shipped on main', () => {
    const { container } = render(<FairwayShotTracking {...base} />);
    expect(compactPuttingChrome(container)).toBeNull();
    expect(container.querySelector('[data-testid="round-scorecard-header"]')).not.toBeNull();
    expect(pills(container)).not.toBeNull();
    // Nothing is selected until the player taps a pill.
    expect(container.querySelectorAll('[aria-label="Shot progress"] [aria-pressed="true"]')).toHaveLength(0);
    expect(container.querySelector('[data-scene-context]')).toBeNull();
    expect(container.querySelector('svg[viewBox="0 0 320 120"]')).not.toBeNull();
  });

  it('with geometry draws the hole scene, keeps the green in view while putting, and starts on the latest recorded shot', () => {
    const { container } = render(<FairwayShotTracking {...base} geometry={geometry} />);
    expect(container.querySelector('[data-scene-context="entry"]')).not.toBeNull();
    expect(compactPuttingChrome(container)).not.toBeNull();
    expect(pills(container)).toBeNull();
    expect(container.querySelector('svg[viewBox="0 0 320 120"]')).toBeNull();
  });

  it('with geometry on a hole the package does not map keeps the chrome shipped on main', () => {
    const unmapped = { ...base, holes: [{ number: 99, par: 4, yardage: 380, score: null }] };
    const { container } = render(<FairwayShotTracking {...unmapped} geometry={{ package: pilotPackage, holeKeys: [''] }} />);
    expect(container.querySelector('[data-scene-context]')).toBeNull();
    expect(compactPuttingChrome(container)).toBeNull();
    expect(pills(container)).not.toBeNull();
  });

  it('off the green, geometry changes the hole card only: the pills stay and the latest shot is selected', () => {
    const offGreen = { ...base, initialShots: [onGreen[0]!], initialShotNumber: 2 };
    const plain = render(<FairwayShotTracking {...offGreen} />);
    expect(pills(plain.container)).not.toBeNull();
    expect(plain.container.querySelectorAll('[aria-label="Shot progress"] [aria-pressed="true"]')).toHaveLength(0);
    plain.unmount();
    const framed = render(<FairwayShotTracking {...offGreen} geometry={geometry} />);
    expect(pills(framed.container)).not.toBeNull();
    expect(compactPuttingChrome(framed.container)).toBeNull();
    const selected = framed.container.querySelectorAll('[aria-label="Shot progress"] [aria-pressed="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.getAttribute('aria-label')).toBe('View shot 1');
  });
});
