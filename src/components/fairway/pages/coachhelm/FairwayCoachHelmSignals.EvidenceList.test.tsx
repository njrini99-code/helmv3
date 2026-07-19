// @vitest-environment jsdom
/**
 * ============================================================================
 * EvidenceList — value column no longer squeezes a long label (audit W2)
 * ----------------------------------------------------------------------------
 * Below `sm`, EvidenceList renders each evidence line as a `flex` row: label
 * left, value right. The value column (`dd`) previously carried an
 * unconditional `shrink-0` with no ceiling, while the label (`dt`) had no
 * floor beyond `min-w-0` — so a wide value+gloss pairing (a pattern's signed
 * stroke figure beside a "high · costing" gloss, say) could claim however
 * much of the row it wanted, squeezing a genuinely long label (evidence
 * labels run up to ~30 chars, e.g. "ESTIMATED 3-PUTT RATE (15+ FT)") down to
 * a sliver and wrapping it across far more lines than the row's own gap could
 * visually separate from the value beside it.
 *
 * Fix: `dd` is capped at `max-w-[45%]` on mobile (reverted at `sm:` where the
 * column grid takes over), guaranteeing the label always keeps the majority
 * share of the row.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceList } from './FairwayCoachHelmSignals';

describe('EvidenceList — mobile label/value row', () => {
  it('caps the value column so a long label always keeps the majority of the row', () => {
    render(
      <EvidenceList
        items={[
          {
            label: 'Estimated 3-putt rate (15+ ft)',
            value: '-0.8/round',
            gloss: 'high impact · costing',
          },
        ]}
        columns={2}
      />,
    );
    const value = screen.getByText('-0.8/round');
    const dd = value.closest('dd');
    expect(dd).not.toBeNull();
    expect(dd!.className).toContain('max-w-[45%]');
    // The cap is mobile-only — the `sm:` column grid already governs width
    // there, so it must be lifted from that breakpoint up.
    expect(dd!.className).toContain('sm:max-w-none');

    const label = screen.getByText('Estimated 3-putt rate (15+ ft)');
    const dt = label.closest('dt');
    expect(dt).not.toBeNull();
    // The label keeps its full-shrink floor (no cap fighting it for space).
    expect(dt!.className).toContain('min-w-0');
  });

  it('still renders the value + gloss together inside the capped column', () => {
    render(
      <EvidenceList
        items={[{ label: 'Sample', value: '38 rounds', gloss: 'since March' }]}
        columns={3}
      />,
    );
    expect(screen.getByText('38 rounds')).toBeInTheDocument();
    expect(screen.getByText('since March')).toBeInTheDocument();
  });
});
