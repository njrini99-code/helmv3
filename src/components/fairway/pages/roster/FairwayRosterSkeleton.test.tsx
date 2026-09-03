/**
 * ============================================================================
 * FairwayRosterSkeleton — grid breakpoint must mirror the real grids
 * ----------------------------------------------------------------------------
 * The route-level loading skeleton reserves the same slots the live roster
 * paints into, so it must use the identical grid breakpoint or the real
 * content shifts on paint. GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1
 * moved both real roster grids (FairwayCoachRoster, FairwayPlayerRoster) from
 * `md:grid-cols-2` (768px) to `lg:grid-cols-2` (1024px) because tablet/
 * mobile-landscape cards were too narrow for their content — this pins that
 * the skeleton followed.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FairwayRosterSkeleton } from './FairwayRosterSkeleton';

describe('FairwayRosterSkeleton', () => {
  it('sizes the card grid at lg (1024px), not md (768px), matching the real rosters', () => {
    const { container } = render(<FairwayRosterSkeleton />);
    expect(container.innerHTML).toMatch(/\blg:grid-cols-2\b/);
    expect(container.innerHTML).not.toMatch(/\bmd:grid-cols-2\b/);
  });
});
