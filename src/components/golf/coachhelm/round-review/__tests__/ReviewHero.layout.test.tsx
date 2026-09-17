// @vitest-environment jsdom
/**
 * ReviewHero — which review a round gets.
 *
 * The course-framed review (HoleSceneFrame, shot selector, position copy)
 * exists only for a round whose caller supplied course geometry. Every other
 * round — every course, every team, today — must keep the legacy shot path,
 * putting zoom and shot list it has in production, never a filmstrip of
 * "Course outline unavailable" placeholders (caught in the #1939 landing review,
 * 2026-09-17).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams('hole=1'),
}));
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: (loader: () => Promise<unknown>) => {
      const Lazy = React.lazy(() => loader().then(mod => ({ default: (mod as { default?: React.ComponentType } | React.ComponentType & { default?: never }) as React.ComponentType })));
      return (props: Record<string, unknown>) => <React.Suspense fallback={null}><Lazy {...props} /></React.Suspense>;
    },
  };
});
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('./../round-review-shots', async () => {
  const actual = await vi.importActual<typeof import('../round-review-shots')>('../round-review-shots');
  return { ...actual, fetchPlayerPuttMakePct: vi.fn(async () => null) };
});
vi.mock('@/components/golf/coachhelm/v3/HoleShotPath', () => ({
  HoleShotPath: (props: { size?: string; bounded?: boolean; scene?: unknown }) => <div data-testid="hole-shot-path" data-size={props.size} data-bounded={String(!!props.bounded)} data-scene={String(!!props.scene)} />,
}));
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

import { ReviewHero } from '../ReviewHero';

const shots = [
  { shot_number: 1, lie_before: 'tee', lie_after: 'fairway', distance_to_hole_before: 380, distance_to_hole_after: 150 },
  { shot_number: 2, lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 150, distance_to_hole_after: 18 },
  { shot_number: 3, lie_before: 'green', lie_after: 'hole', distance_to_hole_before: 18, distance_to_hole_after: 0 },
];
const base = {
  totalScore: 3, scoreToPar: -1, courseDateLine: 'Somewhere · today', grade: { score: 4 as const, label: 'Solid' }, mixLine: '1 birdie',
  filmstripHoles: [{ n: 1, par: 4, score: 3 }, { n: 2, par: 4, score: 5 }],
  holeMeta: new Map([[1, { par: 4, yardage: 380, score: 3 }], [2, { par: 4, yardage: 410, score: 5 }]]),
  shotsByHole: new Map([[1, shots]]),
  playerId: null,
};

describe('ReviewHero: which review a round gets', () => {
  it('without course geometry (every round today) keeps the legacy shot path, putting zoom and shot list', async () => {
    const { container, queryByRole, queryByText, getAllByTestId } = render(<ReviewHero {...base} />);
    await waitFor(() => expect(getAllByTestId('hole-shot-path').length).toBeGreaterThanOrEqual(3));
    for (const path of getAllByTestId('hole-shot-path')) {
      expect(path.getAttribute('data-bounded')).toBe('false');
      expect(path.getAttribute('data-scene')).toBe('false');
    }
    expect(getAllByTestId('hole-shot-path').some(p => p.getAttribute('data-size') === 'review')).toBe(true);
    await waitFor(() => expect(queryByText('On the green')).not.toBeNull());
    expect(container.querySelector('ol')?.textContent).toContain('Tee → Fairway');
    expect(queryByRole('group', { name: 'Recorded shots' })).toBeNull();
    expect(queryByText(/Course outline unavailable/)).toBeNull();
  });
  it('with course geometry frames the open hole and offers the shot selector', async () => {
    const geometry = { package: pilotPackage, holeKeys: pilotPackage.holes.map(h => h.key) };
    const { getAllByTestId, getByRole } = render(<ReviewHero {...base} geometry={geometry} />);
    await waitFor(() => expect(getAllByTestId('hole-shot-path').length).toBeGreaterThanOrEqual(3));
    expect(getAllByTestId('hole-shot-path').every(p => p.getAttribute('data-bounded') === 'true')).toBe(true);
    expect(getByRole('group', { name: 'Recorded shots' }).querySelectorAll('button').length).toBe(3);
  });
});
