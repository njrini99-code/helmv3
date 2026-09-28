// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import type { QueueFilterKey } from '../buildTriageViewModel';
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
  EmptyState: ({ title }: { title: React.ReactNode }) => <div>{title}</div>,
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

// Home's sections have their own suites; here they only mark which view is up.
vi.mock('../TeamBleedBoard', () => ({ TeamBleedBoard: () => <div data-testid="team-bleed-board" /> }));
vi.mock('../TeamShotWeaknesses', () => ({
  TeamShotWeaknesses: () => <div data-testid="team-shot-weaknesses" />,
}));
vi.mock('../TeamSignalSummary', () => ({ TeamSignalSummary: () => <div data-testid="team-signal-summary" /> }));
vi.mock('../SignalQueue', () => ({
  SignalQueue: ({ onSelectFilter }: { onSelectFilter: (filter: QueueFilterKey) => void }) => (
    <div data-testid="signal-queue">
      <button onClick={() => onSelectFilter('all')}>Test show all</button>
    </div>
  ),
}));
vi.mock('../SignalDossier', () => ({
  SignalDossier: ({
    entry,
    onPromoted,
    onBack,
  }: {
    entry: { signal: GroupedSignal } | null;
    onPromoted: (signal: GroupedSignal) => void;
    onBack: () => void;
  }) => (
    <div data-testid="signal-dossier">
      {entry ? (
        <>
          <button onClick={() => onPromoted(entry.signal)}>Test prescribe complete</button>
          <button onClick={onBack}>Test back</button>
        </>
      ) : (
        'No selection'
      )}
    </div>
  ),
}));

function signal(id: string): GroupedSignal {
  return {
    id,
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
    // Two signals, so promoting one leaves a queue to come back to.
    signals: [signal('signal-1'), signal('signal-2')],
  };
}

const playersDrillProps = {
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

function desk() {
  return (
    <TriageDesk
      coachId="coach-1"
      groups={[group()]}
      scannedAt={null}
      groupsError={null}
      categoryInsights={{ success: false, error: 'not fetched in this test' }}
      playersDrillProps={playersDrillProps}
      homeLead={<h1>Morning, Coach.</h1>}
      chatPanel={<div data-testid="chat-panel" />}
    />
  );
}

function renderDesk() {
  return render(desk());
}

/** Load the desk as a bookmark or a shared link would: both the router
 *  snapshot and the address bar carry the query. */
function loadAt(search: string) {
  navigation.params = new URLSearchParams(search);
  window.history.replaceState({}, '', `/golf/dashboard/intelligence${search ? `?${search}` : ''}`);
  return renderDesk();
}

function expectHome() {
  expect(screen.getByTestId('team-shot-weaknesses')).toBeInTheDocument();
  expect(screen.queryByTestId('signal-queue')).not.toBeInTheDocument();
}

function expectLab() {
  expect(screen.getByRole('heading', { name: 'The Lab' })).toBeInTheDocument();
  expect(screen.getByTestId('signal-queue')).toBeInTheDocument();
  expect(screen.queryByTestId('team-shot-weaknesses')).not.toBeInTheDocument();
}

describe('TriageDesk: Home · The Lab · Chat', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence');
  });

  it('offers exactly three toggle segments: Home, The Lab and Chat', () => {
    renderDesk();
    const toggle = screen.getByRole('navigation', { name: 'CoachHelm view' });
    const labels = Array.from(toggle.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['Home', 'The Lab', 'Chat']);
  });

  it('opens Home by default, with the greeting and the Home sections', () => {
    renderDesk();
    expectHome();
    expect(screen.getByRole('heading', { name: 'Morning, Coach.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('offers Scan team on Home, beside the greeting, with the last-scan time', async () => {
    vi.mocked(refreshTeamAnalysisAsCoach).mockResolvedValue({ success: true } as never);
    renderDesk();
    expect(screen.getByText('No scans yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Scan team' }));

    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(refreshTeamAnalysisAsCoach).toHaveBeenCalledTimes(1);
  });

  it('fades a view in only after a switch, never on the first paint', () => {
    const { container } = renderDesk();
    expect(container.innerHTML).not.toContain('animate-');

    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));

    const lab = screen.getByRole('heading', { name: 'The Lab' }).closest('section')!;
    expect(lab.className).toContain('motion-safe:animate-');
  });

  it('opens the view named in the URL on FIRST RENDER, not just on click', () => {
    // Clicking is the one path a bookmark, a refresh, a shared link and the
    // back button never take; `view` is resolved client-side, so a
    // first-render regression is invisible to the click tests below.
    let view = loadAt('view=lab');
    expectLab();
    view.unmount();

    view = loadAt('view=chat');
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    view.unmount();

    view = loadAt('view=players');
    expect(screen.getByTestId('players-view')).toBeInTheDocument();
    view.unmount();
  });

  it('keeps legacy bookmarks working: signals opens The Lab, effectiveness opens Home', () => {
    let view = loadAt('view=signals&filter=insights');
    expectLab();
    view.unmount();

    view = loadAt('view=effectiveness');
    expectHome();
    view.unmount();
  });

  it('falls back to Home for an absent or unknown view, rather than blanking', () => {
    for (const search of ['', 'view=', 'view=not-a-view', 'view=brief']) {
      const view = loadAt(search);
      expect(screen.getByTestId('team-shot-weaknesses'), JSON.stringify(search)).toBeInTheDocument();
      view.unmount();
    }
  });

  it('opens The Lab for a view-less signal link, and keeps the queue up when it no longer resolves', () => {
    loadAt('signal=removed-signal');
    const queueShell = screen.getByTestId('signal-queue').parentElement;
    expect(queueShell).not.toHaveClass('hidden');
  });

  it('opens a valid signal in the narrow-screen dossier state', () => {
    loadAt('signal=signal-1');
    expect(screen.getByTestId('signal-queue').parentElement).toHaveClass('hidden');
    expect(screen.getByTestId('signal-dossier').parentElement).not.toHaveClass('hidden');
  });

  it('switches views immediately without rerendering the server page', () => {
    renderDesk();

    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));
    expectLab();
    expect(window.location.search).toBe('?view=lab');

    fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=chat');

    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expectHome();
    expect(window.location.search).toBe('?view=home');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('switches views with history.replaceState(null, …), never router.replace, so Next syncs without a server trip', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    renderDesk();
    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));
    expect(spy).toHaveBeenCalledWith(null, '', '/golf/dashboard/intelligence?view=lab');
    expect(navigation.replace).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not write history when re-selecting the view already in the URL', () => {
    loadAt('view=lab');
    const spy = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps Chat mounted, hidden, after the coach leaves it, so a streaming reply survives', () => {
    renderDesk();
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));

    const panel = screen.getByTestId('chat-panel');
    expect(panel.closest('[data-triage-chat]')).toHaveClass('hidden');
    expectHome();
  });

  it('says Chat is unavailable, rather than offering a dead composer, when there is no chat panel', () => {
    navigation.params = new URLSearchParams('view=chat');
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?view=chat');
    render(
      <TriageDesk
        coachId="coach-1"
        groups={[group()]}
        scannedAt={null}
        groupsError={null}
        categoryInsights={{ success: false, error: 'not fetched in this test' }}
        playersDrillProps={playersDrillProps}
      />,
    );
    expect(screen.getByText(/could not load your program context/)).toBeInTheDocument();
  });

  it('keeps the coach in The Lab after Prescribe, refreshing the data in place', () => {
    loadAt('view=lab&signal=signal-1');

    fireEvent.click(screen.getByRole('button', { name: 'Test prescribe complete' }));

    expect(window.location.search).toBe('?view=lab');
    expectLab();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  // A notification, the command palette (`?id=`) or a shared link can open a
  // signal without naming a view. Closing it must not resolve to Home.
  it('stays in The Lab when a view-less signal link is closed with Back', () => {
    loadAt('signal=signal-1');
    fireEvent.click(screen.getByRole('button', { name: 'Test back' }));
    expect(window.location.search).toBe('?view=lab');
    expectLab();
  });

  it('stays in The Lab when a legacy ?id= link is closed with Back', () => {
    loadAt('id=signal-1');
    fireEvent.click(screen.getByRole('button', { name: 'Test back' }));
    expect(window.location.search).toBe('?view=lab');
    expectLab();
  });

  it('stays in The Lab after Prescribe from a view-less signal link', () => {
    loadAt('signal=signal-1');
    fireEvent.click(screen.getByRole('button', { name: 'Test prescribe complete' }));
    expect(window.location.search).toBe('?view=lab');
    expectLab();
  });

  it('stays in The Lab when a view-less filter link is widened to all signals', () => {
    loadAt('filter=urgent');
    fireEvent.click(screen.getByRole('button', { name: 'Test show all' }));
    expect(window.location.search).toBe('?view=lab');
    expectLab();
  });

  it('holds the view region open on a switch so a shorter view cannot clamp scrollY', () => {
    const { container } = renderDesk();
    const region = container.querySelector<HTMLElement>('[data-triage-view-region]');
    expect(region).not.toBeNull();
    // The switch row sits 200px down an 800px viewport; the region starts at 260px.
    const switchRow = screen.getByRole('navigation', { name: 'CoachHelm view' }).parentElement!;
    vi.spyOn(switchRow, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240 } as DOMRect);
    vi.spyOn(region!, 'getBoundingClientRect').mockReturnValue({ top: 260, bottom: 2000 } as DOMRect);
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const scrollSpy = vi.fn();
    switchRow.scrollIntoView = scrollSpy;

    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));

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

    // The same path a pressure-map area takes into The Lab from deep in Home.
    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));

    expect(region.style.minHeight).toBe('');
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('ignores a search-param snapshot that trails the live URL after rapid taps', () => {
    const { rerender } = renderDesk();
    fireEvent.click(screen.getByRole('link', { name: 'The Lab' }));
    fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
    // Next's sync of tap 1 lands after tap 2 already rewrote the address bar.
    navigation.params = new URLSearchParams('view=lab');
    rerender(desk());
    expect(screen.getByTestId('chat-panel').closest('[data-triage-chat]')).not.toHaveClass('hidden');
    expect(screen.queryByTestId('signal-queue')).not.toBeInTheDocument();
  });

  it('follows a real external navigation (address bar and snapshot agree)', () => {
    const { rerender } = renderDesk();
    window.history.replaceState({}, '', '/golf/dashboard/intelligence?view=lab');
    navigation.params = new URLSearchParams('view=lab');
    rerender(desk());
    expectLab();
  });
});
