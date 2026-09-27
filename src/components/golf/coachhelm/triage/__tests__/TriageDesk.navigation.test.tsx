// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

function renderDesk(effectivenessDrillProps: unknown = {}) {
  return render(
    <TriageDesk
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
      effectivenessDrillProps={effectivenessDrillProps as never}
    />,
  );
}

describe('TriageDesk URL-driven drill-ins', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('keeps the queue visible when a stale signal deep link no longer resolves', () => {
    navigation.params = new URLSearchParams('signal=removed-signal');
    renderDesk();

    const queueShell = screen.getByTestId('signal-queue').parentElement;
    expect(queueShell).not.toHaveClass('hidden');
  });

  it('opens a valid signal in the narrow-screen dossier state', () => {
    navigation.params = new URLSearchParams('signal=signal-1');
    renderDesk();

    expect(screen.getByTestId('signal-queue').parentElement).toHaveClass('hidden');
    expect(screen.getByTestId('signal-dossier').parentElement).not.toHaveClass('hidden');
  });

  it('opens the view named in the URL on FIRST RENDER, not just on click', () => {
    // The block below proves clicking works. Nothing proved a direct load did —
    // and clicking is the one path a bookmark, a refresh, a shared link, or the
    // back button never take. `view` is resolved client-side (the page's own
    // searchParams docblock says so), so a first-render regression here is
    // invisible to every server test and to the click test underneath.
    //
    // Observed on production 2026-08-17 as coach Nick Rini: loading
    // `/golf/dashboard/intelligence?view=effectiveness` — and `?view=signals` —
    // rendered the Brief instead, breadcrumb "Dashboard / CoachHelm AI / Brief",
    // `document.title` "Brief | CoachHelm", while the nav on that very page
    // linked to those exact URLs. Whether that is this component or the
    // deployed build being behind main, the assertion belongs here: it is the
    // contract, and until now nothing checked it.
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

  it('falls back to the signals queue for an absent or unknown view, rather than blanking', () => {
    for (const search of ['', 'view=', 'view=not-a-view', 'view=brief']) {
      navigation.params = new URLSearchParams(search);
      const { unmount } = renderDesk();
      expect(screen.getByTestId('signal-queue'), JSON.stringify(search)).toBeInTheDocument();
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
  it('switches views with history.replaceState(null, …) — never router.replace — so Next syncs without a server trip', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    renderDesk();
    fireEvent.click(screen.getByRole('link', { name: 'Effectiveness' }));
    expect(spy).toHaveBeenCalledWith(null, '', '/golf/dashboard/intelligence?view=effectiveness');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not write history when re-selecting the view already in the URL', () => {
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?view=players');
    navigation.params = new URLSearchParams('view=players');
    renderDesk();
    const spy = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('link', { name: 'Players' }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('holds the view region open on a switch so a shorter view cannot clamp scrollY', () => {
    const { container } = renderDesk();
    const region = container.querySelector<HTMLElement>('[data-triage-view-region]');
    expect(region).not.toBeNull();
    // The switch row sits 200px down a 800px viewport; the region starts at 260px.
    const switchRow = screen.getByRole('navigation', { name: 'CoachHelm view' }).parentElement!;
    vi.spyOn(switchRow, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240 } as DOMRect);
    vi.spyOn(region!, 'getBoundingClientRect').mockReturnValue({ top: 260, bottom: 2000 } as DOMRect);
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const scrollSpy = vi.fn();
    switchRow.scrollIntoView = scrollSpy;

    fireEvent.click(screen.getByRole('link', { name: 'Effectiveness' }));

    expect(region!.style.minHeight).toBe('540px');
    expect(scrollSpy).not.toHaveBeenCalled();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
  });

  it('brings the switch into view instead of holding blank space when the switch was scrolled off-screen', () => {
    const { container } = renderDesk();
    const region = container.querySelector<HTMLElement>('[data-triage-view-region]')!;
    const switchRow = screen.getByRole('navigation', { name: 'CoachHelm view' }).parentElement!;
    vi.spyOn(switchRow, 'getBoundingClientRect').mockReturnValue({ top: -900, bottom: -860 } as DOMRect);
    const scrollSpy = vi.fn();
    switchRow.scrollIntoView = scrollSpy;

    // Same code path TeamSignalSummary's player rows use, deep below the switch.
    fireEvent.click(screen.getByRole('link', { name: 'Players' }));

    expect(region.style.minHeight).toBe('');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('ignores a search-param snapshot that trails the live URL after rapid taps', () => {
    const { rerender } = renderDesk();
    fireEvent.click(screen.getByRole('link', { name: 'Players' }));
    fireEvent.click(screen.getByRole('link', { name: 'Effectiveness' }));
    // Next's sync of tap 1 lands after tap 2 already rewrote the address bar.
    navigation.params = new URLSearchParams('view=players');
    rerender(
      <TriageDesk
        coachId="coach-1"
        groups={[group()]}
        scannedAt={null}
        groupsError={null}
        categoryInsights={{ success: false, error: 'not fetched in this test' }}
        playersDrillProps={{ players: [], focusAreas: [], coachId: 'coach-1', playerStats: {}, todayIso: '2026-09-23' }}
        effectivenessDrillProps={{} as never}
      />,
    );
    expect(screen.getByTestId('effectiveness-view')).toBeInTheDocument();
    expect(screen.queryByTestId('players-view')).not.toBeInTheDocument();
  });

  it('follows a real external navigation (address bar and snapshot agree)', () => {
    const { rerender } = renderDesk();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?view=effectiveness');
    navigation.params = new URLSearchParams('view=effectiveness');
    rerender(
      <TriageDesk
        coachId="coach-1"
        groups={[group()]}
        scannedAt={null}
        groupsError={null}
        categoryInsights={{ success: false, error: 'not fetched in this test' }}
        playersDrillProps={{ players: [], focusAreas: [], coachId: 'coach-1', playerStats: {}, todayIso: '2026-09-23' }}
        effectivenessDrillProps={{} as never}
      />,
    );
    expect(screen.getByTestId('effectiveness-view')).toBeInTheDocument();
  });

  it('streams the effectiveness payload: suspends behind a fallback, then renders the scoreboard', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    navigation.params = new URLSearchParams('view=effectiveness');
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?view=effectiveness');
    await act(async () => {
      renderDesk(pending);
    });
    expect(screen.getByText('Loading effectiveness…')).toBeInTheDocument();
    expect(screen.queryByTestId('effectiveness-view')).not.toBeInTheDocument();
    await act(async () => {
      resolve({ initialOverview: undefined });
      await pending;
    });
    expect(await screen.findByTestId('effectiveness-view')).toBeInTheDocument();
  });

  it('does not suspend the signals view on the streamed effectiveness payload', () => {
    renderDesk(new Promise(() => {}));
    expect(screen.getByTestId('signal-queue')).toBeInTheDocument();
  });
});
