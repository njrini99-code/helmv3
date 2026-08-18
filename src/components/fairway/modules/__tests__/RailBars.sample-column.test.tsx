/**
 * The sample count is clipped off the end of every RailBars row that has one.
 *
 * Seen in production 2026-08-18 on a coach's player-stats drill-down
 * (`/golf/dashboard/stats?player=…`, Larsen Gallimore). The Approach card reads:
 *
 *     GIR     ██████████▏      62%  133/2⌐     <- cut mid-number at the card edge
 *
 * `RailBars` lays each row out as
 *
 *     gridTemplateColumns: `${labelWidth}px 1fr 38px`
 *
 * and the LAST track carries `row.value` AND `row.sample` together. 38px fits
 * "62%". It cannot fit "62% 133/216", so the denominator runs past the track
 * and is clipped by the card.
 *
 * The sample was added to that span later — its own comment argues the case
 * ("A percentage with no denominator is not actionable — one sand save from two
 * tries reads 50%, the same weight as twenty from forty") — but the column it
 * went into was never widened for it. So the evidence that comment exists to
 * surface is exactly the part a coach cannot read.
 *
 * The track must be allowed to grow to its content, while never getting
 * narrower than the 38px it reserves today (which would squeeze rows that have
 * no sample).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RailBars } from '../RailBars';

const WITH_SAMPLE = [
  { label: 'GIR', pct: 62, value: '62%', sample: '133/216' },
  { label: 'Par 3', pct: 71, value: '71%' },
];

function firstRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>('[data-slot="rail-bars"] > *');
  if (!row) throw new Error('no rail-bars row rendered');
  return row;
}

describe('RailBars — the value track has to hold the sample too', () => {
  it('does not cap the value column at a fixed 38px', () => {
    const { container } = render(<RailBars rows={WITH_SAMPLE} />);

    // "62% 133/216" in mono caption is far wider than 38px; a fixed track
    // clips the denominator.
    expect(firstRow(container).style.gridTemplateColumns).not.toMatch(/38px\s*$/);
  });

  it('lets the value column grow to its content', () => {
    const { container } = render(<RailBars rows={WITH_SAMPLE} />);
    expect(firstRow(container).style.gridTemplateColumns).toMatch(/max-content|auto/);
  });

  it('never lets the value column get NARROWER than it is today', () => {
    // Rows with no sample must keep their current alignment — this fix widens,
    // it does not reflow the whole module.
    const { container } = render(<RailBars rows={WITH_SAMPLE} />);
    expect(firstRow(container).style.gridTemplateColumns).toMatch(/38px/);
  });

  it('still renders the sample text itself', () => {
    const { getByText } = render(<RailBars rows={WITH_SAMPLE} />);
    expect(getByText('133/216')).toBeInTheDocument();
  });

  it('keeps honouring an explicit labelWidth', () => {
    const { container } = render(<RailBars rows={WITH_SAMPLE} labelWidth={80} />);
    expect(firstRow(container).style.gridTemplateColumns).toMatch(/^80px/);
  });
});
