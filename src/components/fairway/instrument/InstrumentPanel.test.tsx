// @vitest-environment jsdom
/**
 * ============================================================================
 * InstrumentPanel.tsx — bezel stacks at phone widths (Mobile Doctrine rule 11)
 * ----------------------------------------------------------------------------
 * The bezel row (eyebrow + header vs. a top-right `readout`) used to be a
 * fixed `flex ... justify-between` row at EVERY width. A wide readout (e.g.
 * Ribbon's value+delta figure) squeezed against a long eyebrow/header at
 * 390px — the screenshotted "LAST 90 DAYS · TEAM" / "STROKES VS PAR" overlap
 * in the CoachHelm Brief strokes-vs-par card. This locks the fix: the bezel
 * stacks eyebrow → heading → readout in one column below `sm`, and returns to
 * the side-by-side row at `sm` and up. Also locks the `truncate` safety net
 * on the string header so it can never visually collide with the readout
 * column even at in-between widths.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InstrumentPanel } from './InstrumentPanel';

function getBezel(container: HTMLElement): HTMLElement {
  const bezel = container.querySelector('[data-slot="instrument-bezel"]');
  expect(bezel).not.toBeNull();
  return bezel as HTMLElement;
}

describe('InstrumentPanel — bezel composition at phone widths', () => {
  it('stacks in a column by default (< sm) and restores a row at sm+', () => {
    const { container } = render(
      <InstrumentPanel eyebrow="Last 90 days · team" header="Yardage map" readout={<span>Strokes vs par</span>} />,
    );
    const bezel = getBezel(container);
    expect(bezel.className).toContain('flex-col');
    expect(bezel.className).toContain('sm:flex-row');
    expect(bezel.className).toContain('sm:justify-between');
  });

  it('the readout slot spans full width on phones and reverts to auto width at sm+', () => {
    const { container } = render(
      <InstrumentPanel eyebrow="Overline" header="Title" readout={<span>Figure</span>} />,
    );
    const bezel = getBezel(container);
    const readoutSlot = bezel.lastElementChild as HTMLElement;
    expect(readoutSlot.className).toContain('w-full');
    expect(readoutSlot.className).toContain('sm:w-auto');
  });

  it('a string header truncates instead of wrapping into the readout column', () => {
    const { getByText } = render(
      <InstrumentPanel header="A very long instrument headline that could crowd a readout" readout={<span>42</span>} />,
    );
    const heading = getByText(/A very long instrument headline/);
    expect(heading.className).toContain('truncate');
  });

  it('no bezel is rendered at all when eyebrow/header/readout are all absent', () => {
    const { container } = render(<InstrumentPanel>Body only</InstrumentPanel>);
    expect(container.querySelector('[data-slot="instrument-bezel"]')).toBeNull();
  });
});
