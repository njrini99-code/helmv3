// @vitest-environment jsdom
/**
 * Hero.tsx — Package 11 (#1933 bugs confirmed present on main, fixed here).
 *
 * Card.tsx already carries the correct fixes for all three bugs below; Hero
 * never got the same wiring even though it shares `viewer_context` /
 * `player_name` / `pga_omitted_reason` in its own StandingBarProps.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Hero } from './Hero';
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
  size: 'hero',
};

describe('Hero — coach viewer never sees "You" (bug #915 regression)', () => {
  it('shows the player\'s initials, not "You", when viewer_context is coach', () => {
    render(<Hero {...BASE} viewer_context="coach" player_name="Jake Doe" />);
    expect(screen.getByText('JD')).toBeTruthy();
    expect(screen.queryByText('You')).toBeNull();
  });

  it('still shows "You" for the default self view', () => {
    render(<Hero {...BASE} />);
    expect(screen.getByText('You')).toBeTruthy();
  });
});

describe('HeroEmpty — no hardcoded "PGA Tour" (unroutable for LPGA/women\'s teams)', () => {
  it('renders a neutral empty caption instead of naming a specific tour', () => {
    render(<Hero {...BASE} state="empty" />);
    expect(screen.queryByText(/PGA Tour/)).toBeNull();
  });
});

describe('Hero — renders the suppressed-reference reason (Card.tsx already does this)', () => {
  it('shows the omission caption when pga_omitted + a reason are set', () => {
    render(
      <Hero
        {...BASE}
        pga_omitted
        pga_omitted_reason="no_womens_anchor"
        is_womens
      />,
    );
    expect(screen.getByText(/No women.s Tour benchmark for this metric yet\./)).toBeTruthy();
  });
});
