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
