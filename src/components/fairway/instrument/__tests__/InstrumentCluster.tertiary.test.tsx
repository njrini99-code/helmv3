import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InstrumentCluster } from '../InstrumentCluster';
import { InstrumentPanel } from '../InstrumentPanel';
import { Readout } from '../Readout';

/**
 * Regression guard for the 2026-07-25 mobile fix.
 *
 * THE BUG. The tertiary foot row was `grid grid-cols-1 … sm:grid-cols-N`, so
 * below 640px every micro-readout became a full-width bordered panel with a
 * 40px numeral and 24px padding. Four of them filled a 390px screen — the
 * shape Mobile Doctrine rule 11 explicitly bans. It affected all six
 * `tertiary` call sites at once, because the shape lives in this primitive.
 *
 * These assert the CLASS CONTRACT rather than computed styles: jsdom does not
 * evaluate media queries, so `max-sm:` behaviour cannot be observed here. What
 * we CAN pin is that the phone overrides are emitted and that none of them
 * leak past the `sm` breakpoint — which is the property that keeps desktop
 * byte-for-byte unchanged.
 */
describe('InstrumentCluster tertiary foot row', () => {
  function renderCluster(count: number) {
    const tertiary = Array.from({ length: count }, (_, i) => (
      <InstrumentPanel key={i} depth="base" padding="md">
        <Readout value={i + 1} label={`Stat ${i + 1}`} size="md" />
      </InstrumentPanel>
    ));
    return render(
      <InstrumentCluster
        ariaLabel="Test cluster"
        primary={<div>primary</div>}
        tertiaryColumns={4}
        tertiary={tertiary}
      />,
    );
  }

  function footRow(container: HTMLElement): HTMLElement {
    const cluster = container.querySelector('[data-slot="instrument-cluster"]');
    expect(cluster).toBeTruthy();
    const row = cluster!.lastElementChild as HTMLElement;
    expect(row).toBeTruthy();
    return row;
  }

  it('never renders a one-column phone grid', () => {
    const { container } = renderCluster(4);
    const cls = footRow(container).className;
    // The whole defect in one assertion: an unprefixed grid-cols-1 is what
    // turned each stat into a full-width card on a phone.
    expect(cls).not.toMatch(/(^|\s)grid-cols-1(\s|$)/);
    expect(cls).toMatch(/grid-cols-2/);
  });

  it('strips the per-cell card chrome on phone only', () => {
    const { container } = renderCluster(4);
    const cls = footRow(container).className;
    for (const prop of ['border-0', 'bg-transparent', 'shadow-none', 'rounded-none', 'p-0']) {
      expect(cls).toContain(`max-sm:[&_[data-slot=instrument-panel]]:!${prop}`);
    }
  });

  it('orders the label after the value on phone so a wrapping label cannot misalign the row', () => {
    const { container } = renderCluster(4);
    expect(footRow(container).className).toContain(
      'max-sm:[&_[data-slot=readout-label]]:!order-last',
    );
  });

  it('every phone override is scoped under max-sm, so desktop is untouched', () => {
    const { container } = renderCluster(4);
    // Any class carrying a `!` important override MUST be max-sm-scoped. If a
    // future edit adds an unscoped `!` here it would silently restyle every
    // cockpit on desktop, which is exactly what this fix promised not to do.
    const important = footRow(container)
      .className.split(/\s+/)
      .filter((c) => c.includes('!'));
    expect(important.length).toBeGreaterThan(0);
    for (const c of important) expect(c.startsWith('max-sm:')).toBe(true);
  });

  it('gives Readout the stable hooks the phone tier selects on', () => {
    const { container } = renderCluster(2);
    // The overrides target these attributes; if Readout ever drops them the
    // phone tier goes back to looking like the bug without any class changing.
    expect(container.querySelector('[data-slot="readout-label"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="readout-value"]')).toBeTruthy();
  });

  it('renders one cell per tertiary item at every supported count', () => {
    for (const n of [2, 3, 4]) {
      const { container, unmount } = renderCluster(n);
      expect(footRow(container).querySelectorAll('[data-slot="instrument-panel"]')).toHaveLength(n);
      unmount();
    }
  });
});
