// @vitest-environment jsdom
/**
 * FairwayHoleHero — which hole context a round gets on the entry screen.
 *
 * Only a Peek'n Peak Upper round resolves the tracker's `geometry`
 * (`useCourseGeometry`), so every other course on every team reaches this
 * hero with no scene. That round must keep the hole card
 * shipped on main (`FairwayHoleHeroLegacy`), never "Course outline
 * unavailable" above the shot entry (caught in the #1939 landing review,
 * 2026-09-17). The course frame is only ever a replacement for a round it
 * can draw.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import { buildTrackingHoleScene } from '@/lib/golf/course-geometry/tracking-scene';
import { FairwayHoleHero } from '../FairwayHoleHero';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const cache = new Map<string | symbol, React.ComponentType<Record<string, unknown>>>();
  const tags = new Proxy({}, { get: (_t, prop) => {
    if (!cache.has(prop)) cache.set(prop, React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
      const { children, initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, whileHover: _h, whileTap: _w, ...rest } = props;
      return React.createElement(prop as string, { ...rest, ref }, children as React.ReactNode);
    }) as unknown as React.ComponentType<Record<string, unknown>>);
    return cache.get(prop);
  } });
  return { useReducedMotion: () => false, motion: tags, m: tags, AnimatePresence: ({ children }: { children: React.ReactNode }) => children, LazyMotion: ({ children }: { children: React.ReactNode }) => children };
});

const base = {
  currentHole: { number: 7, par: 4, yardage: 380, score: null },
  isHoleComplete: false, shotHistory: [], shotHistoryLength: 0, puttCount: 0, holeScore: 0, currentShot: 1,
  shotTypeLabel: 'Tee shot', currentLie: 'tee', missDirection: null, distanceToHole: 380, distanceUnit: 'yards' as const,
  progressPercent: 0, displayDistance: 380, displayUnit: 'yards' as const,
};

describe('FairwayHoleHero: which hole context a round gets', () => {
  it('without a course scene (every course today) keeps the hole card shipped on main', () => {
    const { container, queryByText, getByRole } = render(<FairwayHoleHero {...base} scene={null} />);
    expect(getByRole('region', { name: 'Hole 7, par 4' })).toBeTruthy();
    expect(container.querySelector('svg[viewBox="0 0 320 120"]')).not.toBeNull();
    expect(queryByText(/Course outline unavailable/)).toBeNull();
    expect(container.querySelector('[data-scene-context]')).toBeNull();
  });
  it('with a course scene frames the hole', () => {
    const scene = buildTrackingHoleScene({ package: pilotPackage, holeKeys: ['cacapon-07'] }, 0, pilotShots);
    expect(scene).not.toBeNull();
    const { container, getByRole } = render(<FairwayHoleHero {...base} scene={scene} />);
    expect(getByRole('region', { name: 'Current shot context' })).toBeTruthy();
    expect(container.querySelector('[data-scene-context="entry"]')).not.toBeNull();
  });
});
