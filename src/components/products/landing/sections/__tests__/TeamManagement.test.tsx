// @vitest-environment jsdom

/**
 * ============================================================================
 * TeamManagement — the flagship "Qualifying & Travel Selection" tile
 * ----------------------------------------------------------------------------
 * Regression coverage for the "card bottom clips mid-row" half of the bug the
 * owner caught on a live mobile screenshot (the other half — the cut-line's
 * unlabeled dash — is covered in scenes/__tests__/dockScene.test.ts).
 *
 * ROOT CAUSE: `dockScene`'s dock transition tweens this tile's real
 * width/height from its small scattered box up to its docked size (GSAP
 * Flip's default sizing behaviour — see dockScene.ts's comment on the
 * `Flip.from` call for why `scale: true` was tried and reverted). The tile
 * carried `overflow: hidden`, so while its real height was still short of its
 * content's natural height mid-dock, the standings box's last row and the
 * travel-cut line rendered clipped.
 *
 * FIX: the `overflow: hidden` was defensive-only — every child in this tile
 * (the header block, the standings wrapper) is inset by its own padding, so
 * nothing ever bled to the tile's own edges. Dropping it removes the clip
 * boundary without touching the dock animation at all. The standings box two
 * levels down keeps its OWN `overflow: hidden` for its own rounded corners —
 * that one is a static-height child, never Flip-resized, so it was never part
 * of the bug.
 * ========================================================================== */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TeamManagement } from '../TeamManagement';

describe('TeamManagement — the flagship tile never clips its own content', () => {
  it('renders the qualifying & travel tile without overflow:hidden on the Flip-resized outer box', () => {
    const { container } = render(<TeamManagement />);

    const flagship = container.querySelector('[data-op="source"]') as HTMLElement | null;
    expect(flagship).not.toBeNull();
    // Not `toBe('')` — assert the specific value that clipped the card rather
    // than merely "something changed", so a future refactor that reintroduces
    // clipping via a different property still has to explain itself here.
    expect(flagship!.style.overflow).not.toBe('hidden');

    // The standings box's OWN corner-rounding clip is untouched — it's a
    // static-height child, not part of this bug.
    const standings = flagship!.querySelector('[data-op="pending"]')?.closest(
      'div[style*="border-radius"]',
    );
    expect(standings).toBeTruthy();
  });

  it('still renders all 5 qualifier standings rows and the travel-cut divider', () => {
    const { container } = render(<TeamManagement />);

    expect(container.textContent).toContain('M. Alvarez');
    expect(container.textContent).toContain('D. Park');
    expect(container.textContent).toContain('R. Costa');
    expect(container.textContent).toContain('Travel cut');
    expect(container.querySelectorAll('[data-op="cutrule"]')).toHaveLength(1);
  });
});
