/**
 * PublicMotionScope.tsx tests — deliberately NOT mocking framer-motion (unlike
 * Reveal.test.tsx / HoverReveal.test.tsx), because the bug this file guards
 * against IS framer-motion's real `m`-without-`LazyMotion` behavior, and a
 * `vi.mock('framer-motion', ...)` Proxy would render everything visible
 * regardless, masking the exact regression a mock would hide.
 *
 * Both assertions exercise the REAL Masthead atom + REAL framer-motion:
 *  1. Without any LazyMotion ancestor, its `inkSettles` hidden variant
 *     (`opacity: 0`) never transitions — the name stays invisible forever.
 *     This reproduces the bug that shipped on `team/[id]`, `player/[id]`
 *     (via PlayerProfileClient) before this fix.
 *  2. Wrapped in `<PublicMotionScope>`, the same atom's opacity measurably
 *     moves off `0` once the async `loadFeatures` bundle resolves and the
 *     entrance transition starts — proving the fix actually re-enables the
 *     animation feature, not just that the component renders text into the
 *     DOM (which `opacity: 0` never removes, so a plain `getByText` /
 *     `toBeInTheDocument` assertion would pass in both the broken and fixed
 *     cases and catch nothing).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Masthead } from '@/components/baseball/living-annual/Masthead';
import { PublicMotionScope } from './PublicMotionScope';
import PublicLayout from './layout';

describe('PublicMotionScope', () => {
  it('regression: an `m`-based Living Annual atom with no LazyMotion ancestor stays frozen invisible', () => {
    render(<Masthead given="Ghost" surname="Player" />);
    const surname = screen.getByText('Player');
    // Real (unmocked) framer-motion: `initial="hidden"` is applied as an
    // inline style synchronously on mount even with no LazyMotion ancestor —
    // it just never animates to `visible` without one. `toBeVisible()` reads
    // computed `opacity`, so this is the same check a real screen reader /
    // visual regression tool would fail on.
    expect(surname).not.toBeVisible();
  });

  it('fix: the same atom becomes visible once wrapped in PublicMotionScope', async () => {
    render(
      <PublicMotionScope>
        <Masthead given="Real" surname="Recruit" />
      </PublicMotionScope>,
    );
    const surname = screen.getByText('Recruit');
    await waitFor(() => expect(surname).toBeVisible());
  });

  it('the (public) route layout mounts PublicMotionScope around its children', async () => {
    render(<PublicLayout>{<Masthead given="Layout" surname="Check" />}</PublicLayout>);
    const surname = screen.getByText('Check');
    await waitFor(() => expect(surname).toBeVisible());
  });
});
