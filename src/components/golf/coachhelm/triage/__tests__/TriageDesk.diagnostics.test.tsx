// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

/**
 * ============================================================================
 * TriageDesk — "Team diagnostics" (Team shot weaknesses) coverage
 * ----------------------------------------------------------------------------
 * Data-completeness audit 2026-07-23: `getTeamOverview`'s `teamShotAnalysis`
 * (topWeaknesses/deadZones) was computed on every `/intelligence` load and
 * discarded down to `playerCount`. This locks:
 *   - the Team shot weaknesses panel renders `teamShotAnalysis` when present
 *     and an honest empty state when it's undefined (overview failed/thin).
 *   - the disclosure toggle actually hides/shows the section.
 *
 * (LeakBoard was mounted alongside this panel in an earlier revision but was
 * pulled — on real prod data, most `golf_coach_insights` rows carry no
 * `strokes_impact`, so 7 of 8 LeakBoard categories read a hollow "−0.0 total"
 * despite real leak/player counts. That's a generation-pipeline gap, not a
 * mapping bug; LeakBoard stays available at `/vizlab` pending that fix and a
 * future re-mount. See `LeakBoard.tsx` / `signal-groups.ts:189-201`.)
 * ========================================================================== */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  InlineNotice: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('../BriefBand', () => ({ BriefBand: () => <div data-testid="brief-band" /> }));
vi.mock('../SignalQueue', () => ({ SignalQueue: () => <div data-testid="signal-queue" /> }));
vi.mock('../EffectivenessScoreboard', () => ({
  EffectivenessScoreboard: () => <div data-testid="effectiveness-view" />,
}));
vi.mock('@/components/fairway/pages/coachhelm/TeamCategoryLeakBand', () => ({
  TeamCategoryLeakBand: () => <div data-testid="team-category-leak-band" />,
}));
vi.mock('../SignalDossier', () => ({
  SignalDossier: () => <div data-testid="signal-dossier" />,
}));

// The internal TeamShotWeaknessesPanel is intentionally left UNMOCKED — the
// point of this suite is to verify it renders real, visible content from the
// threaded payload, not just that a stub was mounted.

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
};

function renderDesk(overrides: { teamShotAnalysis?: TeamShotAnalysis } = {}) {
  return render(
    <TriageDesk
      coachId="coach-1"
      groups={[playerGroup()]}
      scannedAt={null}
      groupsError={null}
      categoryInsights={{ success: false, error: 'not fetched in this test' }}
      teamShotAnalysis={overrides.teamShotAnalysis}
      playersDrillProps={basePlayersDrillProps}
      effectivenessDrillProps={{} as never}
    />,
  );
}

describe('TriageDesk — Team diagnostics section', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('renders team shot weaknesses when teamShotAnalysis is present', () => {
    renderDesk({
      teamShotAnalysis: {
        yardageCurve: [],
        deadZones: [{ rangeStart: 150, rangeEnd: 175, deficit: 0.42 }],
        topWeaknesses: [
          { context: 'fairway_150-175', lie: 'fairway', distanceRange: '150-175', avgSG: -0.55, shotCount: 24 },
        ],
      },
    });
    expect(screen.getByText('Team shot weaknesses')).toBeInTheDocument();
    expect(screen.getByText('150-175 yd approach from fairway')).toBeInTheDocument();
    expect(screen.getByText('Dead zones')).toBeInTheDocument();
  });

  it('shows an honest empty state (never a fabricated instrument) when teamShotAnalysis is absent', () => {
    renderDesk({ teamShotAnalysis: undefined });
    expect(screen.getByText('No team shot analysis yet')).toBeInTheDocument();
  });

  it('the disclosure toggle hides and re-shows the diagnostics section', () => {
    renderDesk({ teamShotAnalysis: undefined });
    const toggle = screen.getByRole('button', { name: /Team diagnostics/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No team shot analysis yet')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('No team shot analysis yet')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No team shot analysis yet')).toBeInTheDocument();
  });
});
