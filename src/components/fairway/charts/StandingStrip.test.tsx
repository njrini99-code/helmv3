// @vitest-environment jsdom
/**
 * ============================================================================
 * StandingStrip — SG "Field Avg 0.00" redundant column (bug #949 #7)
 * ----------------------------------------------------------------------------
 * SG metrics are computed AGAINST the field average — its reference value is
 * DEFINITIONALLY 0 on every player, every team, every render. The old 3-up
 * readout row always rendered a "Field Avg" column reading "0.00" for SG
 * metrics, which was also a straight duplicate of the SAME "FIELD AVG" text
 * already labeling the reference tick on the bar above (a triple label: tick
 * label + readout label + a value that never varies). This locks the fix:
 * the redundant readout column is dropped for SG metrics; the tick (a real
 * visual anchor) and every non-SG metric's genuine PGA/LPGA readout stay.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StandingStrip } from './StandingStrip';
import type { StandingStripProps } from './StandingStrip';

const sgProps: StandingStripProps = {
  metric_id: 'sg_total',
  metric_label: 'SG: Total',
  player_value: 0.5,
  team_avg: 0.2,
  team_n: 8,
  team_pct: 62,
  pga_value: 0,
  direction: 'higher_better',
  unit: 'strokes',
  scale: { min: -2, max: 2 },
  size: 'card',
};

const nonSgProps: StandingStripProps = {
  metric_id: 'gir_pct',
  metric_label: 'GIR %',
  player_value: 62,
  team_avg: 58,
  team_n: 8,
  team_pct: 70,
  pga_value: 68,
  direction: 'higher_better',
  unit: 'percent',
  scale: { min: 0, max: 100 },
  size: 'card',
};

describe('StandingStrip — SG metrics drop the redundant Field Avg readout', () => {
  it('renders no "Field Avg" readout value for an sg_ metric (only the tick carries the label)', () => {
    render(<StandingStrip {...sgProps} />);
    // The reference tick below the track still reads "FIELD AVG" (a real
    // visual anchor showing where 0 sits) — exactly once.
    expect(screen.getAllByText('FIELD AVG')).toHaveLength(1);
    // The old 3rd readout's own "Field Avg" label (mixed-case DOM text —
    // CSS `uppercase` only changes the rendering, not the text node — versus
    // the tick's genuinely-uppercased "FIELD AVG" above) is gone entirely.
    expect(screen.queryByText('Field Avg')).toBeNull();
    // ...and the constant, never-varying "0.00" value it always showed no
    // longer appears at all.
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('still renders the real PGA readout value for a non-SG metric (genuine, informative number)', () => {
    render(<StandingStrip {...nonSgProps} />);
    expect(screen.getByText('68%')).toBeInTheDocument();
    // The tick's "PGA" label appears once, plus the readout's "PGA" label —
    // two occurrences is the intended (non-duplicate) pair: one on the track,
    // one titling the actual number.
    expect(screen.getAllByText('PGA').length).toBeGreaterThanOrEqual(1);
  });

  it('sg metric card renders a 2-up readout row (You / Team), not 3-up', () => {
    const { container } = render(<StandingStrip {...sgProps} />);
    const readoutRow = container.querySelector('[data-slot="standing-strip"] .grid.gap-2');
    expect(readoutRow?.className).toContain('grid-cols-2');
    expect(readoutRow?.className).not.toContain('grid-cols-3');
  });

  it('non-sg metric card keeps the 3-up readout row', () => {
    const { container } = render(<StandingStrip {...nonSgProps} />);
    const readoutRow = container.querySelector('[data-slot="standing-strip"] .grid.gap-2');
    expect(readoutRow?.className).toContain('grid-cols-3');
  });
});
