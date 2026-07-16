/**
 * ClimbArc.tsx tests — the precision/house-style bug (decimals collapsing a
 * batting-average series to 1 decimal, dropping the leading zero the wrong
 * way round) and the hardcoded "— My Development" signoff that leaked onto
 * unrelated features (recruiting Analytics, the strength-coach Performance
 * dashboard). See scratchpad note player-my-stats-analytics.md.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClimbArc } from './ClimbArc';

describe('ClimbArc — honest empty state', () => {
  it('renders the "not enough data yet" letter with NO signoff by default', () => {
    const { container } = render(<ClimbArc points={[{ value: 1 }]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
    // EditorsLetter only renders a signoff <p> when one is actually passed.
    expect(container.querySelector('p.italic')).toBeNull();
  });

  it('renders the same honest empty state for zero points', () => {
    render(<ClimbArc points={[]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
  });

  it('passes a caller-supplied signoff through to the empty state', () => {
    render(<ClimbArc points={[]} signoff="— The Passport" />);
    expect(screen.getByText('— The Passport')).toBeInTheDocument();
  });
});

describe('ClimbArc — rate-stat precision (house style)', () => {
  it('keeps 3 decimals and drops the leading zero for a sub-1 (batting-average-style) series', () => {
    render(
      <ClimbArc
        points={[
          { value: 0.25, label: 'Apr 20' },
          { value: 0.667, label: 'Jun 15' },
          { value: 0.3, label: 'Jun 27' },
        ]}
        goal={0.28}
        unit="AVG"
      />,
    );

    // "Now" = last point (.300); the PR marker is the max (.667); goal is .280.
    // None of these should ever collapse to a shared 1-decimal value (the old
    // `.toFixed(1)` bug rounded .250 AND .300 to the same "0.3").
    expect(screen.getByText('.300')).toBeInTheDocument();
    expect(screen.getByText('.667')).toBeInTheDocument();
    expect(screen.getByText('.280')).toBeInTheDocument();

    // House style (formatRate): no leading zero anywhere in these rate figures.
    expect(screen.queryByText('0.300')).not.toBeInTheDocument();
    expect(screen.queryByText('0.3')).not.toBeInTheDocument();
    expect(screen.queryByText('0.7')).not.toBeInTheDocument();
  });

  it('an explicit `decimals` prop overrides the derived precision', () => {
    render(
      <ClimbArc
        points={[{ value: 0.25 }, { value: 0.667 }, { value: 0.3 }]}
        decimals={1}
      />,
    );
    // "Now" (.300 at 3dp) becomes ".3" at the caller-forced 1dp.
    expect(screen.getByText('.3')).toBeInTheDocument();
    expect(screen.queryByText('.300')).not.toBeInTheDocument();
  });

  it('leaves an integer series (e.g. a lift-weight trend) at 0 decimals, unaffected', async () => {
    render(<ClimbArc points={[{ value: 135 }, { value: 145 }]} unit="lb" title="Bench Press" />);
    // Numeric (non-rate) path renders through the animated-number mount roll;
    // NumberFlow is globally mocked to render the raw value once it settles.
    expect(await screen.findByText('145')).toBeInTheDocument();
  });
});
