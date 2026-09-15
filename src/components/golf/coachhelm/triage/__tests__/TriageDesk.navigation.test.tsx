// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

/**
 * ============================================================================
 * TriageDesk — URL-driven drill-ins on the Intelligence field sheet
 * ----------------------------------------------------------------------------
 * These cases predate the facelift and survive it. What changed is the shape
 * they assert against: the `ResizableWorkspace` queue | dossier | CoachHelm
 * panes are gone, so "the queue stays visible" is now "the Signals table stays
 * visible" and "the dossier sheet opens" is now "the drill panel under the
 * table opens". The behaviours themselves — a stale deep link must not strand
 * the coach, `?view=` must be honoured on FIRST render and not only on click,
 * an unknown view must fall back rather than blank, tab switching must not
 * re-render the server page, and Prescribe must keep player context while
 * refreshing once — are unchanged requirements.
 * ========================================================================== */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TriageDesk } from '../TriageDesk';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh, push: navigation.push }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => navigation.params,
}));

vi.mock('@/components/fairway', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  InlineNotice: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PlayersGridView: () => <div data-testid="players-view" />,
  Surface: ({ children, ...rest }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <section aria-label={rest['aria-label']}>{children}</section>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  PressTarget: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Sparkline: () => <svg />,
  fairwayToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/app/golf/actions/insights', () => ({
  refreshTeamAnalysisAsCoach: vi.fn(),
}));

vi.mock('@/app/golf/actions/signal-groups', () => ({
  reviewSignal: vi.fn(),
  dismissSignal: vi.fn(),
}));

vi.mock('../EffectivenessScoreboard', () => ({
  EffectivenessScoreboard: () => <div data-testid="effectiveness-view" />,
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

function renderDesk() {
  return render(
    <TriageDesk
      coachId="coach-1"
      groups={[group()]}
      scannedAt={null}
      groupsError={null}
      categoryInsights={{ success: false, error: 'not fetched in this test' }}
      teamName="Test Team"
      now="2026-01-01T00:00:00.000Z"
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
      }}
      effectivenessDrillProps={{} as never}
    />,
  );
}

const signalsSection = () => screen.getByRole('region', { name: 'Signals' });

describe('TriageDesk URL-driven drill-ins', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    navigation.push.mockReset();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('keeps the signals table visible when a stale signal deep link no longer resolves', () => {
    navigation.params = new URLSearchParams('signal=removed-signal');
    renderDesk();

    expect(signalsSection()).toBeInTheDocument();
    // A stale id resolves to no entry, so no drill panel is appended at all —
    // the coach lands on the full list rather than an empty detail with no way
    // back.
    expect(screen.queryByTestId('signal-dossier')).not.toBeInTheDocument();
  });

  it('opens a valid signal in the drill panel under the table', () => {
    navigation.params = new URLSearchParams('signal=signal-1');
    renderDesk();

    expect(signalsSection()).toBeInTheDocument();
    expect(screen.getByTestId('signal-dossier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All signals/ })).toBeInTheDocument();
  });

  it('renders BOTH table branches so CSS, not a runtime breakpoint, picks one', () => {
    renderDesk();
    const section = signalsSection();
    // The stacked phone list and the dense desktop table are both mounted; a
    // client-measured width would render only one and mismatch on hydration.
    expect(section.querySelector('[data-slot="signals-compact"]')).not.toBeNull();
    expect(section.querySelector('[data-slot="signals-ledger"]')).not.toBeNull();
  });

  it('opens the view named in the URL on FIRST RENDER, not just on click', () => {
    // The block below proves clicking works. Nothing proved a direct load did —
    // and clicking is the one path a bookmark, a refresh, a shared link, or the
    // back button never take. `view` is resolved client-side, so a first-render
    // regression here is invisible to every server test and to the click test
    // underneath.
    for (const [view, testId] of [
      ['players', 'players-view'],
      ['effectiveness', 'effectiveness-view'],
    ] as const) {
      navigation.params = new URLSearchParams(`view=${view}`);
      window.history.replaceState({}, '', `/golf/dashboard/intelligence?view=${view}`);
      const { unmount } = renderDesk();
      expect(screen.getByTestId(testId), view).toBeInTheDocument();
      unmount();
    }
  });

  it('falls back to the signals field sheet for an absent or unknown view, rather than blanking', () => {
    for (const search of ['', 'view=', 'view=not-a-view', 'view=brief']) {
      navigation.params = new URLSearchParams(search);
      const { unmount } = renderDesk();
      expect(screen.getByRole('region', { name: 'Signals' }), JSON.stringify(search)).toBeInTheDocument();
      unmount();
    }
  });

  it('switches top-level tabs immediately without rerendering the server page', () => {
    renderDesk();

    fireEvent.click(screen.getByRole('link', { name: 'Players' }));
    expect(screen.getByTestId('players-view')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=players');
    expect(navigation.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Effectiveness' }));
    expect(screen.getByTestId('effectiveness-view')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=effectiveness');
  });

  it('preserves player context after Prescribe while refreshing data in place', () => {
    navigation.params = new URLSearchParams('signal=signal-1');
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?signal=signal-1');
    renderDesk();

    fireEvent.click(screen.getByRole('button', { name: 'Test prescribe complete' }));

    expect(window.location.search).toBe(
      '?view=players&player=player-1&playersTab=areas',
    );
    expect(screen.getByTestId('players-view')).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });
});
