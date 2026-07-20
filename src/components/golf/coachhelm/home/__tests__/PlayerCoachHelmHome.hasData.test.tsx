// @vitest-environment jsdom
/**
 * ============================================================================
 * PlayerCoachHelmHome — `hasData` empty-state gate (Task D #1)
 * ----------------------------------------------------------------------------
 * The whole-page empty state predates the drills absorbing my-development /
 * my-game-profile / my-standing into this composition root. A player with
 * ONLY development data (active/proposed focus areas, goals, achieved goals)
 * and nothing else previously fell through every OR branch and got the
 * "No insights yet" empty state instead of their development drill. This
 * pins the extended OR-chain so that regresses loudly.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayerCoachHelmHome } from '../PlayerCoachHelmHome';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: vi.fn(),
}));

vi.mock('@/app/golf/actions/v3/goals', () => ({
  createGoal: vi.fn(),
}));

vi.mock('@/components/fairway/modules', () => ({
  StageRouter: ({ views }: { views: Array<{ key: string; node: React.ReactNode }> }) => (
    <div data-testid="stage-router">{views.find((v) => v.key === 'home')?.node}</div>
  ),
}));

vi.mock('../PlayerSpine', () => ({
  PlayerSpine: () => <div data-testid="player-spine" />,
}));
vi.mock('../PlayerHomeBento', () => ({
  PlayerHomeBento: () => <div data-testid="player-home-bento" />,
}));
vi.mock('../DevelopmentDrill', () => ({
  DevelopmentDrill: () => <div data-testid="development-drill" />,
}));
vi.mock('../ProfileDrill', () => ({
  ProfileDrill: () => <div data-testid="profile-drill" />,
}));
vi.mock('../StandingDrill', () => ({
  StandingDrill: () => <div data-testid="standing-drill" />,
}));
vi.mock('../InsightsDrill', () => ({
  InsightsDrill: () => <div data-testid="insights-drill" />,
}));
vi.mock('../DeepDiveDrill', () => ({
  DeepDiveDrill: () => <div data-testid="deep-dive-drill" />,
}));

function baseData(): PlayerCoachHelmDashboardData {
  return {
    playerId: 'p-1',
    playerName: 'Test Player',
    lastUpdated: '2026-07-19T00:00:00Z',
    prediction: null,
    insights: [],
    focusAreas: [],
    recentRounds: [],
    playerState: 'unknown',
    alertLevel: 'none',
  };
}

const requiredGenomeProps = {
  genomeAxes: [],
  genomeDimensions: [],
  genomeStrengths: [],
  genomeWatchouts: [],
  genomeCourseProfile: null,
  genomeRoundsBasis: null,
  playerBaseline: null,
};

describe('PlayerCoachHelmHome — hasData empty-state gate (Task D #1)', () => {
  it('shows the whole-page empty state when there is truly no data anywhere', () => {
    render(
      <PlayerCoachHelmHome
        data={baseData()}
        playerId="p-1"
        developmentActiveAreas={[]}
        developmentCompletedAreas={[]}
        developmentProposedAreas={[]}
        goals={[]}
        achievedGoals={[]}
        {...requiredGenomeProps}
      />,
    );

    expect(screen.getByText('No insights yet')).toBeInTheDocument();
    expect(screen.queryByTestId('stage-router')).not.toBeInTheDocument();
  });

  it('renders the stage (not the empty state) when only developmentActiveAreas is populated', () => {
    render(
      <PlayerCoachHelmHome
        data={baseData()}
        playerId="p-1"
        developmentActiveAreas={[{ id: 'fa-1' } as never]}
        developmentCompletedAreas={[]}
        developmentProposedAreas={[]}
        goals={[]}
        achievedGoals={[]}
        {...requiredGenomeProps}
      />,
    );

    expect(screen.queryByText('No insights yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('stage-router')).toBeInTheDocument();
  });

  it('renders the stage when only developmentProposedAreas is populated', () => {
    render(
      <PlayerCoachHelmHome
        data={baseData()}
        playerId="p-1"
        developmentActiveAreas={[]}
        developmentCompletedAreas={[]}
        developmentProposedAreas={[{ id: 'fa-2' } as never]}
        goals={[]}
        achievedGoals={[]}
        {...requiredGenomeProps}
      />,
    );

    expect(screen.queryByText('No insights yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('stage-router')).toBeInTheDocument();
  });

  it('renders the stage when only goals is populated', () => {
    render(
      <PlayerCoachHelmHome
        data={baseData()}
        playerId="p-1"
        developmentActiveAreas={[]}
        developmentCompletedAreas={[]}
        developmentProposedAreas={[]}
        goals={[{ id: 'g-1' } as never]}
        achievedGoals={[]}
        {...requiredGenomeProps}
      />,
    );

    expect(screen.queryByText('No insights yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('stage-router')).toBeInTheDocument();
  });

  it('renders the stage when only achievedGoals is populated', () => {
    render(
      <PlayerCoachHelmHome
        data={baseData()}
        playerId="p-1"
        developmentActiveAreas={[]}
        developmentCompletedAreas={[]}
        developmentProposedAreas={[]}
        goals={[]}
        achievedGoals={[{ id: 'ag-1' } as never]}
        {...requiredGenomeProps}
      />,
    );

    expect(screen.queryByText('No insights yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('stage-router')).toBeInTheDocument();
  });
});
