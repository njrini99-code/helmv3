// @vitest-environment jsdom
/**
 * ============================================================================
 * CoachIntelligenceHome — overview-failure vs empty-roster gate (Triage Desk
 * rebuild)
 * ----------------------------------------------------------------------------
 * Pins the ONE piece of branching logic that survived the Spine+Bento ->
 * Triage Desk rewrite unchanged (Triage Desk spec §5): a `getTeamOverview`
 * FAILURE must render the honest retry notice (never the empty-roster
 * onboarding screen), while a genuinely empty roster (overview succeeded,
 * `playerCount: 0`) keeps the onboarding gate. `TriageDesk` itself is mocked
 * out — this file only exercises the gate, not the desk's own behavior
 * (covered by `buildTriageViewModel.test.ts` + manual QA).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoachIntelligenceHome } from '../CoachIntelligenceHome';
import type { TeamOverviewResult } from '@/app/golf/actions/team-category-insights';
import type { PlayersGridViewProps, FairwayEffectivenessProps } from '@/components/fairway';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/golf/coachhelm/triage/TriageDesk', () => ({
  TriageDesk: () => <div data-testid="triage-desk" />,
}));

function overview(playerCount: number): TeamOverviewResult {
  return {
    success: true,
    data: {
      teamComposite: 62,
      teamCategories: { teeGame: 60, approach: 58, shortGame: 65, putting: 63, scoring: 61 },
      teamShotAnalysis: { yardageCurve: [], deadZones: [], topWeaknesses: [] },
      playerCount,
      statsRowCount: playerCount,
    },
  };
}

function failedOverview(error = 'Query timed out'): TeamOverviewResult {
  return { success: false, error };
}

function playersDrillProps(players: PlayersGridViewProps['players']): PlayersGridViewProps {
  return {
    players,
    focusAreas: [],
    coachId: 'coach-1',
    playerStats: {},
    signalCount: null,
    loadError: null,
    goalsByPlayer: {},
    playerNameById: {},
    causalByPlayer: {},
    silentPostureByPlayer: {},
    initialSelectedPlayerId: null,
  };
}

const effectivenessDrillProps: FairwayEffectivenessProps = {
  teamId: 'team-1',
  coachId: 'coach-1',
  initialView: 'cockpit',
  initialRange: '30d',
};

describe('CoachIntelligenceHome — overview-failure vs empty-roster gate', () => {
  it('shows onboarding when the overview loaded fine and the roster is genuinely empty', () => {
    render(
      <CoachIntelligenceHome
        overview={overview(0)}
        coachId="coach-1"
        groups={[]}
        scannedAt={null}
        groupsError={null}
        playersDrillProps={playersDrillProps([])}
        effectivenessDrillProps={effectivenessDrillProps}
      />,
    );

    expect(screen.getByText('No active players yet')).toBeInTheDocument();
    expect(screen.queryByTestId('triage-desk')).not.toBeInTheDocument();
  });

  it('renders the Triage Desk (not onboarding) when the overview succeeds with players', () => {
    render(
      <CoachIntelligenceHome
        overview={overview(5)}
        coachId="coach-1"
        groups={[]}
        scannedAt={null}
        groupsError={null}
        playersDrillProps={playersDrillProps([{ id: 'p-1' } as never])}
        effectivenessDrillProps={effectivenessDrillProps}
      />,
    );

    expect(screen.queryByText('No active players yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('triage-desk')).toBeInTheDocument();
  });

  it('renders the retry notice (not onboarding) when the overview fails, even with an empty roster fallback', () => {
    render(
      <CoachIntelligenceHome
        overview={failedOverview('Query timed out')}
        coachId="coach-1"
        groups={[]}
        scannedAt={null}
        groupsError={null}
        playersDrillProps={playersDrillProps([])}
        effectivenessDrillProps={effectivenessDrillProps}
      />,
    );

    expect(screen.queryByText('No active players yet')).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load team intelligence — retry")).toBeInTheDocument();
    expect(screen.getByText('Query timed out')).toBeInTheDocument();
    expect(screen.getByTestId('triage-desk')).toBeInTheDocument();
  });

  it('renders the retry notice + the Triage Desk when the overview fails but the roster fallback has players', () => {
    render(
      <CoachIntelligenceHome
        overview={failedOverview()}
        coachId="coach-1"
        groups={[]}
        scannedAt={null}
        groupsError={null}
        playersDrillProps={playersDrillProps([{ id: 'p-1' } as never, { id: 'p-2' } as never])}
        effectivenessDrillProps={effectivenessDrillProps}
      />,
    );

    expect(screen.getByText("Couldn't load team intelligence — retry")).toBeInTheDocument();
    expect(screen.getByTestId('triage-desk')).toBeInTheDocument();
  });
});
