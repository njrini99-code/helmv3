// @vitest-environment jsdom
/**
 * ============================================================================
 * InsightPanel — bottom-sheet width regression guard (bug #949 #5)
 * ----------------------------------------------------------------------------
 * Both real callers (FairwayCoachHelmSignals, FairwayPlayerCoachHelm) force
 * `mode="sheet"` unconditionally — including on wide desktop viewports, not
 * just the narrow ones the sheet branch was designed for. The sheet's
 * `side="bottom"` class is full-width by design (`inset-x-0`), matching every
 * other `side="bottom"` Sheet in the app. InsightPanel used to ALSO apply a
 * `w-[min(32rem,…)]` cap on top of that — left, right, AND width all pinned
 * at once is an over-constrained CSS box that resolves by discarding `left`
 * and flush-fitting to the right edge, corner-docking a narrow sliver of a
 * panel instead of the roomy full-width sheet every sibling renders. This
 * locks the fix: the sheet's rendered content never carries a fixed/arbitrary
 * width class.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightPanel } from './InsightPanel';

describe('InsightPanel — mode="sheet" never re-introduces a conflicting width cap', () => {
  it('the rendered sheet content carries no arbitrary/fixed width class', () => {
    render(
      <InsightPanel mode="sheet" open title="A signal" priority="medium">
        Some signal body copy.
      </InsightPanel>,
    );
    const content = document.querySelector('[data-slot="sheet"]');
    expect(content).not.toBeNull();
    // No `w-[...]` arbitrary-value width utility, and no fixed `w-<n>` class —
    // the bottom sheet must stay full-width (`inset-x-0`), like every other
    // side="bottom" Sheet in the app.
    expect(content!.className).not.toMatch(/\bw-\[/);
  });
});
