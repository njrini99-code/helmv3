// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

/**
 * ============================================================================
 * TriageDesk: Home threads the team shot analysis through to its card
 * ----------------------------------------------------------------------------
 * Data-completeness audit 2026-07-23: `getTeamOverview`'s `teamShotAnalysis`
 * (topWeaknesses/deadZones) was computed on every `/intelligence` load and
 * then discarded. This locks the payload reaching the REAL
 * `TeamShotWeaknesses` card on Home (deliberately unmocked), and the two
 * honest non-data states: no ranked situations yet, and an overview read
 * that failed. The card's own formatting is covered in
 * `TeamShotWeaknesses.test.tsx`.
 * ========================================================================== */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import type { TeamShotAnalysis } from '@/app/golf/actions/team-category-insights';
import { TriageDesk } from '../TriageDesk';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => navigation.params,
}));

vi.mock('@/components/fairway', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  EmptyState: ({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) => (
    <div>
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  InlineNotice: ({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {title ? <p>{title}</p> : null}
      {children}
    </div>
  ),
  PlayersGridView: () => <div data-testid="players-view" />,
  fairwayToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/app/golf/actions/insights', () => ({
  refreshTeamAnalysisAsCoach: vi.fn(),
}));

vi.mock('@/app/golf/actions/signal-groups', () => ({
  reviewSignal: vi.fn(),
  dismissSignal: vi.fn(),
}));

vi.mock('../TeamBleedBoard', () => ({ TeamBleedBoard: () => <div data-testid="team-bleed-board" /> }));
vi.mock('../TeamSignalSummary', () => ({ TeamSignalSummary: () => <div data-testid="team-signal-summary" /> }));
vi.mock('../SignalQueue', () => ({ SignalQueue: () => <div data-testid="signal-queue" /> }));
vi.mock('../SignalDossier', () => ({ SignalDossier: () => <div data-testid="signal-dossier" /> }));

function playerGroup(): SignalGroup {
  const signal: GroupedSignal = {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Three-putt rate climbing',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 2,
    playerId: 'player-1',
    supersededCount: 0,
  };
  return {
    playerId: 'player-1',
    playerName: 'Alex Rivera',
    attentionScore: 10,
    worstSeverity: 'high',
    signals: [signal],
  };
}

const basePlayersDrillProps = {
  players: [
    {
      id: 'player-1',
      first_name: 'Alex',
      last_name: 'Rivera',
      avatar_url: null,
      graduation_year: null,
      handicap: null,
      hometown: null,
      state: null,
    },
  ],
  focusAreas: [],
  coachId: 'coach-1',
  playerStats: {},
  todayIso: '2026-09-23',
};

function renderHome(overrides: { teamShotAnalysis?: TeamShotAnalysis; overviewFailed?: boolean } = {}) {
  return render(
    <TriageDesk
      coachId="coach-1"
      groups={[playerGroup()]}
      scannedAt={null}
      groupsError={null}
      categoryInsights={{ success: false, error: 'not fetched in this test' }}
      teamShotAnalysis={overrides.teamShotAnalysis}
      overviewFailed={overrides.overviewFailed}
      playersDrillProps={basePlayersDrillProps}
    />,
  );
}

describe('TriageDesk Home: team shot weaknesses', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('renders the threaded teamShotAnalysis payload, situations and dead zones both', () => {
    const { container } = renderHome({
      teamShotAnalysis: {
        yardageCurve: [],
        deadZones: [{ rangeStart: 150, rangeEnd: 175, deficit: 0.42 }],
        topWeaknesses: [
          { context: 'fairway_150-175', lie: 'fairway', distanceRange: '150-175', avgSG: -0.55, shotCount: 24 },
        ],
      },
    });
    expect(screen.getByRole('heading', { name: 'Team shot weaknesses' })).toBeInTheDocument();
    expect(screen.getByText('150–175 yd', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('From the fairway')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dead zones' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('shows an honest empty state (never a fabricated instrument) when there is nothing to rank', () => {
    renderHome({ teamShotAnalysis: undefined });
    expect(screen.getByText('No shot-level weaknesses yet')).toBeInTheDocument();
  });

  it('says the analysis did not load, rather than "nothing yet", when the overview read failed', () => {
    renderHome({ teamShotAnalysis: undefined, overviewFailed: true });
    expect(screen.getByText("Shot analysis didn't load")).toBeInTheDocument();
    expect(screen.queryByText('No shot-level weaknesses yet')).not.toBeInTheDocument();
  });
});
