// @vitest-environment jsdom
/**
 * ============================================================================
 * ViewSwitch — Segmented visual-treatment adoption (owner request, 2026-07-25)
 * ----------------------------------------------------------------------------
 * Pins three things this rewrite must never regress:
 *   1. It is still real navigation — `next/link` anchors with the correct
 *      `?view=` href and `aria-current="page"` on the active tab, and the
 *      cmd/ctrl/shift/middle-click passthrough that lets a modified click
 *      open a new tab WITHOUT mutating this tab's `onSelect` state (the
 *      exact hazard documented in `segmented.tsx`'s docblock for why this
 *      control can't become a `Segmented`/Radix `ToggleGroup` instance).
 *   2. The shared `SegmentedPill` (track/pill depth + green "on" dot) is
 *      wired in and renders on the active segment only.
 *   3. Reduced motion is resolved through `useReducedMotionGuard` (never the
 *      raw hook) and actually disables the pill's `layoutId` glide.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ViewSwitch } from '../ViewSwitch';
import type { TriageView } from '../buildTriageViewModel';

// Same pattern as TeamCategoryLeakBand.test.tsx: replace framer-motion with a
// deterministic passthrough so `useReducedMotionGuard` resolves predictably
// in jsdom, and forward `layoutId` as a `data-layout-id` attribute so its
// presence/absence (the actual reduced-motion-disables-the-glide behavior)
// is directly assertable instead of relying on framer-motion internals.
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

function hrefFor(view: TriageView) {
  return `/golf/dashboard/intelligence?view=${view}`;
}

describe('ViewSwitch', () => {
  it('renders every option as a link with the URL-driven href, and marks only the active one aria-current', () => {
    const onSelect = vi.fn();
    render(<ViewSwitch view="players" hrefFor={hrefFor} onSelect={onSelect} />);

    const signals = screen.getByRole('link', { name: 'Signals' });
    const players = screen.getByRole('link', { name: 'Players' });
    const effectiveness = screen.getByRole('link', { name: 'Effectiveness' });

    expect(signals).toHaveAttribute('href', '/golf/dashboard/intelligence?view=signals');
    expect(players).toHaveAttribute('href', '/golf/dashboard/intelligence?view=players');
    expect(effectiveness).toHaveAttribute('href', '/golf/dashboard/intelligence?view=effectiveness');

    expect(players).toHaveAttribute('aria-current', 'page');
    expect(signals).not.toHaveAttribute('aria-current');
    expect(effectiveness).not.toHaveAttribute('aria-current');
  });

  it('fires onSelect and prevents default navigation on a plain primary click', () => {
    const onSelect = vi.fn();
    render(<ViewSwitch view="signals" hrefFor={hrefFor} onSelect={onSelect} />);

    const players = screen.getByRole('link', { name: 'Players' });
    const event = fireEvent.click(players, { button: 0 });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('players');
    // jsdom's fireEvent.click return value is `false` when preventDefault() was called.
    expect(event).toBe(false);
  });

  // Regression pin: a modified click must NOT call onSelect, so the browser's
  // native "open in a new tab" proceeds without also mutating this tab's view.
  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['non-primary button', { button: 1 }],
  ])('does not call onSelect (and does not preventDefault) on a %s click', (_label, eventInit) => {
    const onSelect = vi.fn();
    render(<ViewSwitch view="signals" hrefFor={hrefFor} onSelect={onSelect} />);

    const players = screen.getByRole('link', { name: 'Players' });
    const notPrevented = fireEvent.click(players, { button: 0, ...eventInit });

    expect(onSelect).not.toHaveBeenCalled();
    // `true` return means preventDefault() was NOT called — native anchor
    // behavior (e.g. opening a new tab) is left intact.
    expect(notPrevented).toBe(true);
  });

  describe('the green active-segment indicator', () => {
    it('renders the shared SegmentedPill dot on the active link only', () => {
      render(<ViewSwitch view="effectiveness" hrefFor={hrefFor} onSelect={() => {}} />);

      const signals = screen.getByRole('link', { name: 'Signals' });
      const players = screen.getByRole('link', { name: 'Players' });
      const effectiveness = screen.getByRole('link', { name: 'Effectiveness' });

      expect(signals.querySelector('.bg-accent-600')).not.toBeInTheDocument();
      expect(players.querySelector('.bg-accent-600')).not.toBeInTheDocument();
      const dot = effectiveness.querySelector('.bg-accent-600');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveAttribute('aria-hidden', 'true');
    });

    it('moves the dot when the active view prop changes', () => {
      const { rerender } = render(
        <ViewSwitch view="signals" hrefFor={hrefFor} onSelect={() => {}} />,
      );
      expect(
        screen.getByRole('link', { name: 'Signals' }).querySelector('.bg-accent-600'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Players' }).querySelector('.bg-accent-600'),
      ).not.toBeInTheDocument();

      rerender(<ViewSwitch view="players" hrefFor={hrefFor} onSelect={() => {}} />);

      expect(
        screen.getByRole('link', { name: 'Signals' }).querySelector('.bg-accent-600'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Players' }).querySelector('.bg-accent-600'),
      ).toBeInTheDocument();
    });
  });

  describe('reduced motion', () => {
    it('gives the active pill a layoutId when motion is not reduced', () => {
      motionState.reducedMotion = false;
      render(<ViewSwitch view="signals" hrefFor={hrefFor} onSelect={() => {}} />);
      const pill = screen.getByRole('link', { name: 'Signals' }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).not.toBe('');
    });

    it('disables the layoutId glide (empty data-layout-id) when useReducedMotionGuard reports reduced motion', () => {
      motionState.reducedMotion = true;
      render(<ViewSwitch view="signals" hrefFor={hrefFor} onSelect={() => {}} />);
      const pill = screen.getByRole('link', { name: 'Signals' }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).toBe('');
      // The dot still renders under reduced motion — only the travel animation is disabled.
      expect(pill?.querySelector('.bg-accent-600')).toBeInTheDocument();
      motionState.reducedMotion = false; // reset for subsequent tests
    });
  });
});
