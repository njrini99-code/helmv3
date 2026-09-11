// @vitest-environment jsdom
/**
 * ============================================================================
 * SegmentedLinks — the 7 contract lines from bridge-design-plan.md §3.1
 * ----------------------------------------------------------------------------
 * Also the proof that `IncidentLensRail`'s extraction to a thin wrapper over
 * this component is faithful: its own existing tests
 * (`src/app/admin/_components/__tests__/unified-incident-card.test.tsx`,
 * `describe('IncidentLensRail', ...)`) are required to pass UNCHANGED.
 * ========================================================================== */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedLinks, type SegmentedLinksOption } from '../segmented-links';

// next/link's prefetch path calls `new IntersectionObserver(...)`; the
// global jsdom mock in src/test/setup.tsx is a plain vi.fn() (not
// constructor-callable), so any real next/link in a mounted tree throws.
// Same workaround as unified-incident-card.test.tsx.
vi.mock('next/link', () => ({
  default: ({ children, href, className, ...rest }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

// Same pattern as ViewSwitch.test.tsx: replace framer-motion with a
// deterministic passthrough so `useReducedMotion` resolves predictably in
// jsdom, and forward `layoutId` as `data-layout-id` so its presence/absence
// (the actual reduced-motion-disables-the-glide behavior) is directly
// assertable instead of relying on framer-motion internals.
const motionState = vi.hoisted(() => ({ reducedMotion: false as boolean }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => motionState.reducedMotion,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>(({ children, layoutId, initial, animate, transition, ...rest }, ref) => {
            void initial;
            void animate;
            void transition;
            return React.createElement(
              prop as string,
              { ...rest, ref, 'data-layout-id': layoutId ?? '' },
              children,
            );
          }),
      },
    ),
  };
});

type Fruit = 'apple' | 'banana' | 'cherry';

const OPTIONS: ReadonlyArray<SegmentedLinksOption<Fruit>> = [
  { value: 'apple', label: 'Apple', href: '/fruit?v=apple', count: 4 },
  { value: 'banana', label: 'Banana', href: '/fruit?v=banana', count: 0 },
  { value: 'cherry', label: 'Cherry', href: '/fruit?v=cherry', count: null },
];

describe('SegmentedLinks', () => {
  it('renders <nav aria-label> -> <ul> -> <li> -> next/link anchors with aria-current="page" on the active one, never role="tab"', () => {
    render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);

    const nav = screen.getByRole('navigation', { name: 'Fruit view' });
    expect(nav.tagName).toBe('NAV');
    const list = nav.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll(':scope > li').length).toBe(OPTIONS.length);

    const apple = screen.getByRole('link', { name: /Apple/ });
    const banana = screen.getByRole('link', { name: /Banana/ });
    const cherry = screen.getByRole('link', { name: /Cherry/ });
    expect(apple).toHaveAttribute('aria-current', 'page');
    expect(banana).not.toHaveAttribute('aria-current');
    expect(cherry).not.toHaveAttribute('aria-current');
    expect(apple).toHaveAttribute('href', '/fruit?v=apple');

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('always renders every option, even one with a zero count', () => {
    render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
    expect(screen.getAllByRole('link')).toHaveLength(OPTIONS.length);
    expect(screen.getByRole('link', { name: /Banana/ })).toBeInTheDocument();
  });

  it('de-emphasises a zero-count option that is not active, but never the active one', () => {
    const { rerender } = render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
    const banana = screen.getByRole('link', { name: /Banana/ });
    expect(banana.className).toMatch(/(^|\s)opacity-50(\s|$)/);
    expect(banana).toHaveTextContent('0');

    // Deep-linked into the empty option: it must read as selected, not disabled.
    rerender(<SegmentedLinks options={OPTIONS} value="banana" ariaLabel="Fruit view" />);
    const activeBanana = screen.getByRole('link', { name: /Banana/ });
    expect(activeBanana.className).not.toMatch(/(^|\s)opacity-50(\s|$)/);
    expect(activeBanana).toHaveAttribute('aria-current', 'page');
  });

  it('renders "—" for a null count, never "0", and renders no count node at all for undefined', () => {
    const withUndefinedCount: ReadonlyArray<SegmentedLinksOption<Fruit>> = [
      { value: 'apple', label: 'Apple', href: '/fruit?v=apple' },
      ...OPTIONS.slice(1),
    ];
    render(<SegmentedLinks options={withUndefinedCount} value="apple" ariaLabel="Fruit view" />);

    const cherry = screen.getByRole('link', { name: /Cherry/ });
    expect(cherry).toHaveTextContent('—');
    expect(cherry).not.toHaveTextContent('0');
    expect(cherry.textContent).not.toMatch(/null/);

    const apple = screen.getByRole('link', { name: /^Apple$/ });
    expect(apple.textContent).toBe('Apple');
  });

  it('does not intercept a plain primary click — a real <a> navigates on its own, no onClick handler at all', () => {
    render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
    const banana = screen.getByRole('link', { name: /Banana/ });
    // jsdom's fireEvent.click return value is `true` when preventDefault() was
    // NOT called — this is the inverse of ViewSwitch's assertion, because
    // ViewSwitch still owns client-side `onSelect` state and SegmentedLinks
    // does not: a plain <Link> already navigates, and a modified/middle click
    // already opens a new tab without mutating anything, for free.
    const notPrevented = fireEvent.click(banana, { button: 0 });
    expect(notPrevented).toBe(true);
  });

  describe('the "use client" pill, gated by reduced motion', () => {
    it('gives the active pill a layoutId when motion is not reduced', () => {
      motionState.reducedMotion = false;
      render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
      const pill = screen.getByRole('link', { name: /Apple/ }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).not.toBe('');
    });

    it('snaps (empty data-layout-id) instead of gliding when reduced motion is on', () => {
      motionState.reducedMotion = true;
      render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
      const pill = screen.getByRole('link', { name: /Apple/ }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).toBe('');
      motionState.reducedMotion = false; // reset for subsequent tests
    });
  });

  it('scrolls horizontally with snap points, and hides its own scrollbar', () => {
    render(<SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />);
    const list = screen.getByRole('navigation', { name: 'Fruit view' }).querySelector('ul');
    expect(list?.className).toMatch(/overflow-x-auto/);
    expect(list?.className).toMatch(/snap-x/);
    expect(list?.className).toMatch(/snap-mandatory/);
    expect(list?.className).toMatch(/scrollbar-width:none/);

    const item = screen.getByRole('link', { name: /Apple/ }).closest('li');
    expect(item?.className).toMatch(/snap-start/);
  });

  it('renders the active option\'s description under the track when provided', () => {
    render(
      <SegmentedLinks
        options={OPTIONS}
        value="cherry"
        ariaLabel="Fruit view"
        description="Cherries are in season."
      />,
    );
    expect(screen.getByText('Cherries are in season.')).toBeInTheDocument();
  });
});
