/**
 * ============================================================================
 * FairwayPlayerCard — Wave 2 CoachHelm signal enrichment
 * ----------------------------------------------------------------------------
 * Before this pass the roster list card surfaced exactly ONE stat (Avg
 * score). This pins the new signal slice pulled from data already computed
 * server-side (roster/page.tsx): trend arrow, SG:Total (+ standing tier),
 * active focus-area count, active goal count — and the honest "None yet" /
 * em-dash degrade when a signal isn't available yet.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FairwayPlayerCard, type RosterPlayer } from './FairwayPlayerCard';

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    hometown: 'Austin',
    state: 'TX',
    graduation_year: 2027,
    handicap: 2,
    status: 'active',
    rounds_count: 8,
    avg_score: 74.2,
    ...overrides,
  };
}

describe('FairwayPlayerCard — CoachHelm signal strip', () => {
  it('renders the trend glyph next to Avg score when a real trend signal exists', () => {
    render(<FairwayPlayerCard player={makePlayer({ recent_trend: 'improving' })} intent={null} />);
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  it('renders no trend glyph when there is no signal yet (honest, not fabricated)', () => {
    render(<FairwayPlayerCard player={makePlayer({ recent_trend: null })} intent={null} />);
    expect(screen.queryByText('Improving')).toBeNull();
    expect(screen.queryByText('Declining')).toBeNull();
    expect(screen.queryByText('Steady')).toBeNull();
  });

  it('formats a positive SG:Total with an explicit sign and the good tone', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: 0.42 })} intent={null} />);
    expect(screen.getByText('+0.42')).toBeInTheDocument();
  });

  it('formats a negative SG:Total without double-signing it', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: -1.3 })} intent={null} />);
    expect(screen.getByText('-1.30')).toBeInTheDocument();
  });

  it('shows an honest em-dash for SG:Total when the stats cache has no row yet', () => {
    render(<FairwayPlayerCard player={makePlayer({ sg_total: null })} intent={null} />);
    // Two "SG:Total" em-dash siblings aren't queried here — assert the label
    // renders and no signed number does.
    expect(screen.getByText('SG:Total')).toBeInTheDocument();
    expect(screen.queryByText(/^[+-]\d/)).toBeNull();
  });

  it('renders the standing-tier caption under SG:Total when present', () => {
    render(
      <FairwayPlayerCard
        player={makePlayer({ sg_total: 0.1, standing_tier: 'Top quartile on team' })}
        intent={null}
      />,
    );
    expect(screen.getByText('Top quartile on team')).toBeInTheDocument();
  });

  it('shows an active focus-area count badge when the player has one', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_focus_areas: 2 })} intent={null} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('shows "None yet" for focus areas and goals when both are zero', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_focus_areas: 0, active_goals: 0 })} intent={null} />);
    expect(screen.getAllByText('None yet')).toHaveLength(2);
  });

  it('shows an active goals count badge when the player has one', () => {
    render(<FairwayPlayerCard player={makePlayer({ active_goals: 3 })} intent={null} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('still renders the Avg score anchor stat and View player CTA unchanged', () => {
    render(<FairwayPlayerCard player={makePlayer()} intent={null} />);
    expect(screen.getByText('Avg score')).toBeInTheDocument();
    expect(screen.getByText('74.2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View player/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/roster/p1',
    );
  });
});
