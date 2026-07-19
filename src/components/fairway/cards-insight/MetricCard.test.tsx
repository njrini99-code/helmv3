// @vitest-environment jsdom
/**
 * ============================================================================
 * MetricCard delta chip — "Flat" for a zero-value delta, not "— 0%" (#950)
 * ----------------------------------------------------------------------------
 * Bug: a zero-change delta (e.g. GIR% unchanged over the last 5 rounds)
 * rendered a Minus (—) icon next to a literal "0%" — visually "— 0%", an odd
 * double-negative-looking read for "nothing changed". Fix: the neutral
 * (delta.value === 0) branch renders the word "Flat" instead of pairing a
 * dash glyph with a zero.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from './MetricCard';

describe('MetricCard delta chip', () => {
  it('reads "Flat" (not "— 0%") when the delta is exactly zero', () => {
    render(
      <MetricCard
        label="GIR %"
        value={62}
        suffix="%"
        delta={{ value: 0, suffix: '%', label: 'last 5 rounds' }}
      />,
    );
    expect(screen.getByText('Flat')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('still renders the real signed value + icon for a genuine positive delta', () => {
    render(
      <MetricCard
        label="GIR %"
        value={65}
        suffix="%"
        delta={{ value: 4, suffix: '%', label: 'last 5 rounds' }}
      />,
    );
    expect(screen.queryByText('Flat')).not.toBeInTheDocument();
    expect(screen.getByText('4%')).toBeInTheDocument();
  });

  it('still renders the real signed value + icon for a genuine negative delta', () => {
    render(
      <MetricCard
        label="Putts / Rd"
        value={30}
        goodDirection="down"
        delta={{ value: -2, label: 'last 5 rounds' }}
      />,
    );
    expect(screen.queryByText('Flat')).not.toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * MetricCard label wrap — `labelLines` (audit W2, signals-header)
 * ----------------------------------------------------------------------------
 * A 3-up KPI grid at phone width (e.g. Signals' "Open / Urgent / Showing"
 * header) gives each tile too little room for a longer eyebrow label
 * ("Showing patterns") under the default single-line `truncate` — it clips
 * to an ellipsis identically on every tile at narrow widths. `labelLines={2}`
 * lets the label wrap onto a second line instead, with a reserved 2-line
 * slot so sibling tiles stay aligned regardless of how many lines any one
 * label actually uses.
 * ========================================================================== */
describe('MetricCard label wrap (labelLines)', () => {
  it('defaults to the original single-line ellipsis truncation (unchanged for existing callers)', () => {
    const { container } = render(<MetricCard label="Showing patterns" value={5} />);
    const label = screen.getByText('Showing patterns');
    expect(label.className).toContain('truncate');
    expect(label.className).not.toContain('line-clamp-2');
    // No reserved-height class fights the default single-line layout.
    expect(container.querySelector('.min-h-8')).toBeNull();
  });

  it('labelLines={2} wraps instead of truncating, and reserves a 2-line slot', () => {
    render(<MetricCard label="Showing patterns" value={5} labelLines={2} />);
    const label = screen.getByText('Showing patterns');
    expect(label.className).not.toContain('truncate');
    expect(label.className).toContain('line-clamp-2');
    expect(label.className).toContain('min-h-8');
  });
});
