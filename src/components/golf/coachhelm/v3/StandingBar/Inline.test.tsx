// @vitest-environment jsdom
/**
 * Inline.tsx — Package 11 (#1933 bugs confirmed present on main, fixed here).
 * Same two bugs as Hero.tsx: Card.tsx already carries the correct fixes.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Inline } from './Inline';
import type { StandingBarProps } from './types';

const BASE: StandingBarProps = {
  metric_id: 'gir_pct',
  metric_label: 'GIR %',
  player_value: 64.6,
  team_avg: 65.3,
  team_n: 8,
  team_pct: 40,
  pga_value: 68,
  direction: 'higher_better',
  unit: 'percent',
  scale: { min: 30, max: 80 },
  size: 'inline',
};

describe('Inline — coach viewer never sees "You" (bug #915 regression)', () => {
  it('shows the player\'s initials, not "You", when viewer_context is coach', () => {
    const { container } = render(<Inline {...BASE} viewer_context="coach" player_name="Jake Doe" />);
    expect(container.textContent).toContain('JD 65%');
    expect(container.textContent).not.toContain('You 65%');
  });

  it('still shows "You" for the default self view', () => {
    const { container } = render(<Inline {...BASE} />);
    expect(container.textContent).toContain('You 65%');
  });
});

describe('Inline — renders the suppressed-reference reason (Card.tsx already does this)', () => {
  it('shows the omission caption when pga_omitted + a reason are set', () => {
    render(
      <Inline
        {...BASE}
        pga_omitted
        pga_omitted_reason="no_womens_anchor"
        is_womens
      />,
    );
    expect(screen.getByText(/No women.s Tour benchmark for this metric yet\./)).toBeTruthy();
  });
});
