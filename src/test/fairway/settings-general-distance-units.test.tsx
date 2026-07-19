/**
 * B14 — the 'Meters' distance-unit card's description rendered as garbled,
 * overlapping text at narrow widths while the sibling 'Yards' card rendered
 * correctly. Root cause: the Fairway `Button` primitive's base recipe sets
 * `whitespace-nowrap` (correct for a single-line button label), which is
 * INHERITED by descendant text nodes. `OptionTile` nests a title + hint pair
 * inside that button with nothing resetting the inherited nowrap, so a long
 * hint (Meters' "International metric system · 137 m · 3 m putts") had no
 * legal wrap point and its overflow rendered stacked onto the title's
 * baseline instead of flowing onto its own line.
 *
 * jsdom doesn't lay out text, so this is a class-contract regression test:
 * every OptionTile hint must render inside a `whitespace-normal` subtree so
 * the browser is actually allowed to wrap it.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { DistanceUnitsPanel } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';

vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => {}),
  isNativeApp: () => false,
}));

describe('DistanceUnitsPanel (B14)', () => {
  it('renders the Meters and Yards hints inside a whitespace-normal subtree (no inherited nowrap)', () => {
    render(<DistanceUnitsPanel />);

    const metersHint = screen.getByText(/International metric system/);
    const yardsHint = screen.getByText(/Standard US \/ golf measurement/);

    // Whichever ancestor sets `whitespace-normal`, one must exist between the
    // hint text and the button root — otherwise the inherited `nowrap` from
    // the Button base recipe stands and the bug reproduces.
    const metersWrapNode = metersHint.closest('.whitespace-normal');
    const yardsWrapNode = yardsHint.closest('.whitespace-normal');
    expect(metersWrapNode).not.toBeNull();
    expect(yardsWrapNode).not.toBeNull();
  });

  it('renders both distance-unit options as selectable tiles', () => {
    render(<DistanceUnitsPanel />);
    expect(screen.getByText('Yards')).toBeInTheDocument();
    expect(screen.getByText('Meters')).toBeInTheDocument();
  });
});
