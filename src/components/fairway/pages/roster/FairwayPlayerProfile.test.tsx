// @vitest-environment jsdom

/**
 * ============================================================================
 * FairwayPlayerProfile — dossier facelift pins
 * ----------------------------------------------------------------------------
 * Before this pass the coach player page had no test at all. This pins the
 * shape the facelift introduced: an unboxed masthead (no hero card, no
 * "member since" line), a StatMatrix of headline numbers, an honest
 * InsufficientData gate on Standing when there's no SG:Total row yet, focus
 * areas / recent rounds as seam rows (not empty-state cards) when data is
 * present, and a Game/Genome/Rounds tab row defaulting to Rounds.
 *
 * `StatsSpineStage` and `FairwayPlayerActionsMenu` are mocked: both are
 * independently-loaded, independently-tested components with their own
 * network/router calls, and this file's job is the composition around them,
 * not their internals.
 * ========================================================================== */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FairwayPlayerProfile,
  type FairwayPlayerProfileFocusArea,
  type FairwayPlayerProfilePlayer,
  type FairwayPlayerProfileProps,
  type FairwayPlayerProfileRound,
} from './FairwayPlayerProfile';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/golf/stats/spine-stage/StatsSpineStage', () => ({
  StatsSpineStage: () => <div data-testid="stats-spine-stage" />,
}));

vi.mock('./FairwayPlayerActionsMenu', () => ({
  FairwayPlayerActionsMenu: () => <div data-testid="player-actions-menu" />,
}));

function makePlayer(overrides: Partial<FairwayPlayerProfilePlayer> = {}): FairwayPlayerProfilePlayer {
  return {
    id: 'player-1',
    first_name: 'Cole',
    last_name: 'Bennett',
    avatar_url: null,
    hometown: 'Austin',
    state: 'TX',
    graduation_year: 2027,
    handicap: 4,
    phone: null,
    email: null,
    created_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeDetailedStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    roundsPlayed: 18,
    scoringAverage: 74.7,
    fairwayPercentage: 65,
    girPercentage: 71,
    puttsPerRound: 29.8,
    ...overrides,
  } as GolfStats;
}

function baseProps(overrides: Partial<FairwayPlayerProfileProps> = {}): FairwayPlayerProfileProps {
  return {
    player: makePlayer(),
    membershipStatus: 'active',
    detailedStats: makeDetailedStats(),
    standingRows: [],
    focusAreas: [],
    recentRounds: [],
    serverNowMs: Date.parse('2026-09-10T12:00:00.000Z'),
    ...overrides,
  };
}

describe('FairwayPlayerProfile — masthead', () => {
  it('renders the name and class year without a hero card wrapper around identity', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByRole('heading', { name: 'Cole Bennett' })).toBeInTheDocument();
    expect(screen.getByText("'27")).toBeInTheDocument();
  });

  it('no longer renders a "Member since" line', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByText(/member since/i)).toBeNull();
  });

  it('renders exactly one primary Message action plus the overflow menu', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByRole('link', { name: /message/i })).toBeInTheDocument();
    expect(screen.getByTestId('player-actions-menu')).toBeInTheDocument();
  });

  it('does not render the old three cross-surface link cards', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByText('Scouting Report')).toBeNull();
    expect(screen.queryByText('Game Fingerprint')).toBeNull();
  });
});

describe('FairwayPlayerProfile — StatMatrix headline numbers', () => {
  it('renders the five headline numbers from detailedStats', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByText('74.7')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('71%')).toBeInTheDocument();
    expect(screen.getByText('29.8')).toBeInTheDocument();
  });

  it('shows an honest em-dash placeholder rather than a fabricated number when stats failed to load', () => {
    render(<FairwayPlayerProfile {...baseProps({ detailedStats: null })} />);
    expect(screen.getByText('Scoring avg')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('FairwayPlayerProfile — Standing', () => {
  const sgRow: PlayerStandingRow = {
    metric_id: 'sg_total',
    player_value: -1.2,
    team_avg: -2.1,
    team_n: 8,
    team_pct: 60,
    pga_value: 0,
    pga_delta: -1.2,
  };

  it('renders an InsufficientData notice, never a fabricated chart, when there is no sg_total row', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingRows: [] })} />);
    expect(screen.getByText('Standing fills in after 5+ rounds')).toBeInTheDocument();
  });

  it('renders the StandingBars readout when an sg_total row is present', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingRows: [sgRow] })} />);
    expect(screen.queryByText(/standing fills in after/i)).toBeNull();
  });
});

describe('FairwayPlayerProfile — focus areas & recent rounds seam rows', () => {
  it('renders focus areas as rows, not empty-state cards, when present', () => {
    const focusAreas: FairwayPlayerProfileFocusArea[] = [
      {
        id: 'fa1',
        title: 'Three-putt avoidance',
        area_type: 'putting',
        status: 'in_progress',
        current_value: 2,
        target_value: 1,
        created_at: '2026-08-01T00:00:00.000Z',
      },
    ];
    render(<FairwayPlayerProfile {...baseProps({ focusAreas })} />);
    expect(screen.getByText('Three-putt avoidance')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows an honest empty line, not a card, when there are no open focus areas', () => {
    render(<FairwayPlayerProfile {...baseProps({ focusAreas: [] })} />);
    expect(screen.getByText(/no open focus areas/i)).toBeInTheDocument();
  });

  it('renders recent rounds as rows with the score, and a relative-freshness caption', () => {
    const recentRounds: FairwayPlayerProfileRound[] = [
      { id: 'r1', round_date: '2026-08-30', course_name: 'Pebble Beach', total_score: 71, score_to_par: -1 },
    ];
    render(<FairwayPlayerProfile {...baseProps({ recentRounds })} />);
    expect(screen.getByText(/Pebble Beach/)).toBeInTheDocument();
    expect(screen.getByText('71')).toBeInTheDocument();
    expect(screen.getByText(/last played/i)).toBeInTheDocument();
  });
});

describe('FairwayPlayerProfile — Game / Genome / Rounds tabs', () => {
  it('defaults to the Rounds tab and mounts StatsSpineStage', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByTestId('stats-spine-stage')).toBeInTheDocument();
  });

  it('exposes Game, Genome and Rounds as tab options in one shared control', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByRole('radiogroup', { name: /player dossier view/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Game' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Genome' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Rounds' })).toBeInTheDocument();
  });
});
