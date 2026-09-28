// @vitest-environment jsdom
/**
 * ============================================================================
 * ViewSwitch — the CoachHelm top toggle (Home · The Lab · Chat)
 * ----------------------------------------------------------------------------
 * Pins four things this control must never regress:
 *   1. It is real navigation: `next/link` anchors with the correct `?view=`
 *      href and `aria-current="page"` on the active view, plus the
 *      cmd/ctrl/shift/middle-click passthrough that lets a modified click
 *      open a new tab WITHOUT mutating this tab's view (the hazard
 *      `segmented.tsx`'s docblock gives for why this control can't become a
 *      Radix `ToggleGroup` instance).
 *   2. The shared `SegmentedPill` renders on the active segment only. (It is
 *      found by its `data-slot`, not a colour class: the pill's dot moved
 *      from `bg-accent-600` to `bg-text-on-accent-fill` with the solid green
 *      thumb, which silently broke the old colour-based assertions.)
 *   3. The deep-link-only `players` view marks no segment current.
 *   4. Reduced motion is resolved through `useReducedMotionGuard` and
 *      actually disables the pill's `layoutId` glide.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ViewSwitch } from '../ViewSwitch';
import type { ToggleView } from '../buildTriageViewModel';

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

const haptics = vi.hoisted(() => ({ fwHaptic: vi.fn() }));
vi.mock('@/lib/fairway/haptics', () => ({ fwHaptic: haptics.fwHaptic }));

function hrefFor(view: ToggleView) {
  return `/golf/dashboard/intelligence?view=${view}`;
}

const PILL = '[data-slot="fw-segment-pill"]';

describe('ViewSwitch', () => {
  it('renders Home, The Lab and Chat as links with URL-driven hrefs, and marks only the active one aria-current', () => {
    render(<ViewSwitch view="lab" hrefFor={hrefFor} onSelect={vi.fn()} />);

    const home = screen.getByRole('link', { name: 'Home' });
    const lab = screen.getByRole('link', { name: 'The Lab' });
    const chat = screen.getByRole('link', { name: 'Chat' });

    expect(home).toHaveAttribute('href', '/golf/dashboard/intelligence?view=home');
    expect(lab).toHaveAttribute('href', '/golf/dashboard/intelligence?view=lab');
    expect(chat).toHaveAttribute('href', '/golf/dashboard/intelligence?view=chat');

    expect(lab).toHaveAttribute('aria-current', 'page');
    expect(home).not.toHaveAttribute('aria-current');
    expect(chat).not.toHaveAttribute('aria-current');
  });

  it('offers no Players or Effectiveness segment any more', () => {
    render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Effectiveness' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Signals' })).toBeNull();
  });

  it('marks nothing current while the deep-link-only players view is showing', () => {
    const { container } = render(<ViewSwitch view="players" hrefFor={hrefFor} onSelect={vi.fn()} />);
    expect(container.querySelector('[aria-current]')).toBeNull();
    expect(container.querySelector(PILL)).toBeNull();
  });

  it('fires onSelect and prevents default navigation on a plain primary click', () => {
    const onSelect = vi.fn();
    render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={onSelect} />);

    const event = fireEvent.click(screen.getByRole('link', { name: 'The Lab' }), { button: 0 });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('lab');
    // jsdom's fireEvent.click return value is `false` when preventDefault() was called.
    expect(event).toBe(false);
  });

  it('fires one selection haptic on a real view change, none when re-tapping the active view', () => {
    haptics.fwHaptic.mockReset();
    render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('link', { name: 'Home' }), { button: 0 });
    expect(haptics.fwHaptic).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Chat' }), { button: 0 });
    expect(haptics.fwHaptic).toHaveBeenCalledTimes(1);
    expect(haptics.fwHaptic).toHaveBeenCalledWith('selection');
  });

  it('fires no haptic on a modified (new-tab) click', () => {
    haptics.fwHaptic.mockReset();
    render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }), { button: 0, metaKey: true });
    expect(haptics.fwHaptic).not.toHaveBeenCalled();
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
    render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={onSelect} />);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'The Lab' }), { button: 0, ...eventInit });

    expect(onSelect).not.toHaveBeenCalled();
    // `true` means preventDefault() was NOT called: native anchor behaviour
    // (opening a new tab) is left intact.
    expect(notPrevented).toBe(true);
  });

  describe('the active-segment pill', () => {
    it('renders the shared SegmentedPill on the active link only', () => {
      render(<ViewSwitch view="chat" hrefFor={hrefFor} onSelect={() => {}} />);

      expect(screen.getByRole('link', { name: 'Home' }).querySelector(PILL)).toBeNull();
      expect(screen.getByRole('link', { name: 'The Lab' }).querySelector(PILL)).toBeNull();
      const pill = screen.getByRole('link', { name: 'Chat' }).querySelector(PILL);
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveAttribute('aria-hidden', 'true');
    });

    it('moves the pill when the active view prop changes', () => {
      const { rerender } = render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={() => {}} />);
      expect(screen.getByRole('link', { name: 'Home' }).querySelector(PILL)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'The Lab' }).querySelector(PILL)).toBeNull();

      rerender(<ViewSwitch view="lab" hrefFor={hrefFor} onSelect={() => {}} />);

      expect(screen.getByRole('link', { name: 'Home' }).querySelector(PILL)).toBeNull();
      expect(screen.getByRole('link', { name: 'The Lab' }).querySelector(PILL)).toBeInTheDocument();
    });
  });

  describe('reduced motion', () => {
    it('gives the active pill a layoutId when motion is not reduced', () => {
      motionState.reducedMotion = false;
      render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={() => {}} />);
      const pill = screen.getByRole('link', { name: 'Home' }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).not.toBe('');
    });

    it('disables the layoutId glide (empty data-layout-id) when useReducedMotionGuard reports reduced motion', () => {
      motionState.reducedMotion = true;
      render(<ViewSwitch view="home" hrefFor={hrefFor} onSelect={() => {}} />);
      const pill = screen.getByRole('link', { name: 'Home' }).querySelector('[data-layout-id]');
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('data-layout-id')).toBe('');
      motionState.reducedMotion = false; // reset for subsequent tests
    });
  });
});
