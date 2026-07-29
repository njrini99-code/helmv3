/**
 * Public player profile — real-framer-motion scope guard.
 *
 * DELIBERATELY DOES NOT MOCK framer-motion. The other two suites mock it so
 * their assertions don't race an entrance animation; this one exists precisely
 * to exercise the real thing, because the failure it guards against is a
 * framer-motion runtime behavior that any mock would erase.
 *
 * The `(public)` route group wraps every page in `<LazyMotion strict>`
 * (PublicMotionScope.tsx) so signed-out visitors still get the Living Annual
 * entrance animations. `strict` makes framer-motion THROW as soon as any
 * descendant renders a full `motion.*` component instead of `m.*`.
 *
 * That is a live constraint on this file, not a hypothetical: the obvious
 * "use the shared design-system control" move here is Fairway's <Segmented>
 * for the tab strip, and segmented.tsx renders a `<motion.span>` for its
 * sliding pill. Dropping it in would crash the product's most-shared page for
 * every visitor who does not have prefers-reduced-motion enabled — a failure
 * that no amount of visual review catches, because it looks correct in any
 * environment where framer-motion is mocked or reduced motion is on.
 *
 * So: render the page exactly as the route does, and fail loudly if anything
 * in the tree ever reaches for `motion.*`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/baseball/actions/watchlist', () => ({
  toggleWatchlistPlayer: vi.fn().mockResolvedValue({ success: true, action: 'added' }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PublicMotionScope } from '../../../PublicMotionScope';
import { PlayerProfileClient } from '../PlayerProfileClient';
import { makeProps } from './player-fixture';

describe('public player profile inside the real (public) LazyMotion scope', () => {
  it('renders under <LazyMotion strict> without a strict-mode violation', () => {
    // The failure mode was measured, not assumed: rendering a full `motion.*`
    // inside <PublicMotionScope> raises framer-motion's invariant as a THROW
    // out of render, and produces no matching console.error alongside it. So
    // `.not.toThrow()` is the whole signal here — a console spy would add
    // nothing but false reassurance.
    expect(() =>
      render(
        <PublicMotionScope>
          <PlayerProfileClient {...makeProps()} />
        </PublicMotionScope>,
      ),
    ).not.toThrow();

    // And the page actually painted its content, not an error boundary.
    expect(screen.getByRole('tablist', { name: 'Player sections' })).toBeInTheDocument();
  });

  it('lets the Living Annual masthead finish its entrance (not stuck at opacity 0)', async () => {
    render(
      <PublicMotionScope>
        <PlayerProfileClient {...makeProps()} />
      </PublicMotionScope>,
    );
    // `inkSettles` starts hidden; without a working LazyMotion ancestor the
    // surname would stay invisible forever — the exact bug PublicMotionScope
    // was introduced to fix, re-asserted through this page's own tree.
    await waitFor(() => expect(screen.getByText('Delgado')).toBeVisible());
  });
});
