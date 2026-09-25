// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */
/**
 * Team roots as the coach landing view (owner direction 2026-09-25): an
 * absent ?view= opens Team roots when the page has the model; signal and
 * filter deep links still open Signals; without the model the desk keeps
 * its old Signals default and shows no Team roots tab.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
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

vi.mock('@/components/golf/coachhelm/root-map/TeamRootsView', () => ({
  TeamRootsView: ({ navigate }: { navigate: (u: { view: string; filter: string }) => void }) => (
    <div data-testid="team-roots-view">
      <button onClick={() => navigate({ view: 'signals', filter: 'category:putting' })}>Open Putting signals</button>
    </div>
  ),
}));

vi.mock('../BriefBand', () => ({ BriefBand: () => <div data-testid="brief-band" /> }));
vi.mock('../TeamSignalSummary', () => ({ TeamSignalSummary: () => <div data-testid="team-signal-summary" /> }));
vi.mock('../SignalQueue', () => ({ SignalQueue: () => <div data-testid="signal-queue" /> }));
vi.mock('../EffectivenessScoreboard', () => ({
  EffectivenessScoreboard: () => <div data-testid="effectiveness-view" />,
}));
vi.mock('@/components/fairway/pages/coachhelm/TeamCategoryLeakBand', () => ({
  TeamCategoryLeakBand: () => <div data-testid="team-category-leak-band" />,
}));
vi.mock('../SignalDossier', () => ({
  SignalDossier: ({ entry, onPromoted }: { entry: { signal: GroupedSignal } | null; onPromoted: (signal: GroupedSignal) => void }) => (
    <div data-testid="signal-dossier">
      {entry ? <button onClick={() => onPromoted(entry.signal)}>Test prescribe complete</button> : 'No selection'}
    </div>
  ),
}));

function signal(): GroupedSignal {
  return {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Putting leak',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.8,
    playerId: 'player-1',
    supersededCount: 0,
  };
}

function group(): SignalGroup {
  return {
    playerId: 'player-1',
    playerName: 'Alex Rivera',
    attentionScore: 10,
    worstSeverity: 'high',
    signals: [signal()],
  };
}

function renderDesk(withTeam = true) {
  return render(
    <TriageDesk
      teamRoots={withTeam ? ({} as never) : null}
      coachId="coach-1"
      groups={[group()]}
      scannedAt={null}
      groupsError={null}
      categoryInsights={{ success: false, error: 'not fetched in this test' }}
      playersDrillProps={{
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
      }}
      effectivenessDrillProps={{} as never}
    />,
  );
}

describe('TriageDesk team roots landing', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('lands on Team roots when no view is named', () => {
    for (const search of ['', 'view=', 'view=not-a-view']) {
      navigation.params = new URLSearchParams(search);
      const { unmount } = renderDesk();
      expect(screen.getByTestId('team-roots-view'), JSON.stringify(search)).toBeInTheDocument();
      expect(screen.queryByTestId('signal-queue')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('keeps Signals for signal and filter deep links without a view', () => {
    for (const search of ['signal=signal-1', 'id=signal-1', 'filter=urgent']) {
      navigation.params = new URLSearchParams(search);
      const { unmount } = renderDesk();
      expect(screen.getByTestId('signal-queue'), search).toBeInTheDocument();
      expect(screen.queryByTestId('team-roots-view')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the Team roots tab first and Signals stays a tab', () => {
    renderDesk();
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.slice(0, 4)).toEqual(['Team roots', 'Signals', 'Players', 'Effectiveness']);
    fireEvent.click(screen.getByRole('link', { name: 'Signals' }));
    expect(screen.getByTestId('signal-queue')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=signals');
    fireEvent.click(screen.getByRole('link', { name: 'Team roots' }));
    expect(screen.getByTestId('team-roots-view')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=team');
  });

  it('opens a filtered Signals queue from the team view', () => {
    renderDesk();
    fireEvent.click(screen.getByRole('button', { name: 'Open Putting signals' }));
    expect(screen.getByTestId('signal-queue')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=signals&filter=category%3Aputting');
  });

  it('without the team model keeps Signals as default, hides the tab and ignores ?view=team', () => {
    for (const search of ['', 'view=team']) {
      navigation.params = new URLSearchParams(search);
      const { unmount } = renderDesk(false);
      expect(screen.getByTestId('signal-queue'), search).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Team roots' })).not.toBeInTheDocument();
      unmount();
    }
  });
});
