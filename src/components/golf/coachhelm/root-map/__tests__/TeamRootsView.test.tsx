// @vitest-environment jsdom
/**
 * TeamRootsView with production-today data: no observed roots yet, every
 * approach cause unsized. Redesign 2026-09-25: the view must still read as a
 * headline card, the biggest leaks, the players-by-area table, every area
 * (collapsed), one primary action, and honest copy for the sections with
 * nothing stored.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { buildTeamHeadline, buildTeamRoots, type TeamRosterPlayer } from '@/lib/coachhelm/root-map/build-team-roots';
import { TeamRootsView } from '../TeamRootsView';
import { closedDisclosureTriggers, openDisclosures } from './open-disclosures';

vi.mock('framer-motion', async () => {
  const R = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy({}, { get: (_t, tag) => R.forwardRef<HTMLElement, Record<string, unknown>>((p, ref) => R.createElement(tag as string, { ref, className: p.className as string }, p.children as React.ReactNode)) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

const players: TeamRosterPlayer[] = ['a', 'b', 'c'].map((id) => ({
  id,
  name: `Player ${id.toUpperCase()}`,
  roundsPlayed: 8,
  sgTotal: -2,
  sg: { tee: 0.2, approach: -1.1, short_game: -0.3, putting: -0.4 },
}));

function signal(playerId: string, metric: string, category: string, strokes: number | null): GroupedSignal {
  return {
    id: `${playerId}-${metric}`,
    kind: 'insight',
    category,
    severity: 'high',
    title: metric,
    claim: '',
    ageDays: 3,
    status: 'active',
    strokeImpact: 0,
    playerId,
    supersededCount: 0,
    evidence: {
      metric,
      metric_label: metric === 'appr' ? 'Approach 125-150' : 'Lag putting',
      confidence: 0.6,
      counterfactual: strokes === null ? null : { strokes_saved_per_round: strokes, suppressed: false },
      diagnosis: { causality_level: 'inferred_hypothesis', root_cause: 'r', drivers: [] },
    },
  };
}

describe('TeamRootsView, no observed roots and unsized approach', () => {
  it('leads with the headline card, then the biggest leaks and players table; every area and trend collapsed', () => {
    const model = buildTeamRoots({
      players,
      signals: ['a', 'b', 'c'].flatMap((p) => [signal(p, 'appr', 'approach', null), signal(p, 'lag', 'putting', 0.3)]),
    });
    render(
      <TeamRootsView
        model={model}
        headline={buildTeamHeadline(model)}
        trend={[]}
        slopes={[]}
        needsYou={[]}
        signalsFailed={false}
        hrefFor={() => '/golf/dashboard/intelligence?view=signals'}
        navigate={() => {}}
      />,
    );
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('Approach is the team’s biggest leak: 1.1 strokes a round vs Tour average.')).toBeInTheDocument();
    expect(within(summary).getByText(/Biggest single spot: Lag putting \(putting\), 0\.3 a round · Player A, Player B \+1\./)).toBeInTheDocument();
    expect(within(summary).getByText(/Team strength/)).toBeInTheDocument();
    expect(within(summary).getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Open putting signals' })).toBeInTheDocument();
    const leaks = document.querySelector('[data-slot="team-leaks"]') as HTMLElement;
    expect(within(leaks).getByRole('button', { name: /Lag putting, Putting: −0\.3 strokes a round vs Tour average, Player A, Player B \+1/ })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Team average' })).toBeInTheDocument();
    expect(closedDisclosureTriggers().map((b) => b.textContent)).toEqual(['Every area', 'Team trend']);
  });

  it('renders every section with honest copy and one primary action', () => {
    const model = buildTeamRoots({
      players,
      signals: ['a', 'b', 'c'].flatMap((p) => [signal(p, 'appr', 'approach', null), signal(p, 'lag', 'putting', 0.3)]),
    });
    render(
      <TeamRootsView
        model={model}
        headline={buildTeamHeadline(model)}
        trend={[]}
        slopes={[]}
        needsYou={[]}
        signalsFailed={false}
        hrefFor={() => '/golf/dashboard/intelligence?view=signals'}
        navigate={() => {}}
      />,
    );
    openDisclosures();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Where the team loses strokes');
    expect(screen.getByText(/A trend needs strokes-gained rounds/)).toBeInTheDocument();
    // every area: the unsized approach cause is listed, saying it has no value yet, with who carries it
    const approach = document.querySelector('[data-slot="area-row"][data-area="approach"]') as HTMLElement;
    expect(within(approach).getByRole('button', { name: /Approach 125–150: no stroke value yet · Player A, Player B \+1/ })).toBeInTheDocument();
    expect(within(approach).getByText('Not explained yet')).toBeInTheDocument();
    expect(screen.getByText(/before-and-after reads you can see has three or more measured rounds/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing urgent or changed right now/)).toBeInTheDocument();
    expect(screen.getByText(/^Strokes a round vs Tour average\./)).toBeInTheDocument();
    // one primary action
    expect(screen.getAllByRole('link', { name: /signals$/ })).toHaveLength(1);
    // no jargon left on the page
    expect(document.body.textContent).not.toMatch(/Tour line|\bnet\b|root map/i);
  });

  it('says signals are unavailable instead of empty when their read failed', () => {
    const model = buildTeamRoots({ players, signals: [] });
    render(
      <TeamRootsView
        model={model}
        headline={null}
        trend={[]}
        slopes={null}
        needsYou={[]}
        signalsFailed
        hrefFor={() => '#'}
        navigate={() => {}}
      />,
    );
    openDisclosures();
    expect(screen.getByText(/Signals did not load, so spots cannot be shown/)).toBeInTheDocument();
    expect(screen.getByText(/Focus before-and-after reads are not available/)).toBeInTheDocument();
    expect(screen.queryByText(/No cause is carried by three or more/)).not.toBeInTheDocument();
  });
});

describe('TeamRootsView, a stored miss concentration', () => {
  it('keeps a stored miss concentration readable in Needs you, stated as observed, not a cause', () => {
    const model = buildTeamRoots({ players, signals: [signal('a', 'appr', 'approach', null)] });
    render(
      <TeamRootsView
        model={model}
        headline={null}
        trend={[]}
        slopes={[]}
        needsYou={[
          {
            key: 'conc:a-appr',
            kind: 'concentration',
            playerId: 'a',
            playerName: 'Player A',
            title: 'appr',
            detail: 'Misses concentrate: 175+ yd → long par 3s → short-right — 8 of 10 short. Observed, not a cause.',
            signalId: 'a-appr',
          },
        ]}
        signalsFailed={false}
        hrefFor={() => '/golf/dashboard/intelligence?view=signals'}
        navigate={() => {}}
      />,
    );
    expect(screen.getByText(/175\+ yd → long par 3s → short-right — 8 of 10 short\. Observed, not a cause\.$/)).toBeInTheDocument();
  });

  it('opens a Needs-you read on the player drill, not the Signals view', () => {
    const model = buildTeamRoots({ players, signals: [signal('a', 'appr', 'approach', null)] });
    render(
      <TeamRootsView
        model={model}
        headline={null}
        trend={[]}
        slopes={[]}
        needsYou={[
          { key: 'sig:a-appr', kind: 'signal', playerId: 'a', playerName: 'Player A', title: 'appr', detail: 'd', signalId: 'a-appr' },
        ]}
        signalsFailed={false}
        hrefFor={(u) => `/golf/dashboard/intelligence?view=${u.view}${u.player ? `&player=${u.player}` : ''}${u.cause ? `&cause=${u.cause}` : ''}`}
        navigate={() => {}}
      />,
    );
    openDisclosures();
    const heading = screen.getByRole('heading', { name: 'Needs you' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByRole('link')).toHaveAttribute('href', '/golf/dashboard/intelligence?view=team&player=a&cause=a-appr');
  });
});

describe('TeamRootsView, team map What row and matrix labels (2026-09-25)', () => {
  function putting(playerId: string, metric: string, label: string, strokes: number | null): GroupedSignal {
    return {
      ...signal(playerId, 'lag', 'putting', strokes),
      id: `${playerId}-${metric}`,
      evidence: {
        metric,
        metric_label: label,
        confidence: 0.8,
        counterfactual: strokes === null ? null : { strokes_saved_per_round: strokes, suppressed: false },
        diagnosis: { causality_level: 'observed_sequence', root_cause: 'r', drivers: [] },
      },
    };
  }
  const hrefFor = (u: { view?: string; player?: string | null; cause?: string | null }) =>
    `/golf/dashboard/intelligence?view=${u.view ?? 'team'}${u.player ? `&player=${u.player}` : ''}${u.cause ? `&cause=${u.cause}` : ''}`;

  const puttingHeavy: TeamRosterPlayer[] = players.map((p) => ({
    ...p,
    sg: { tee: 0.2, approach: -0.3, short_game: -0.1, putting: -1.5 },
  }));

  function renderView() {
    const model = buildTeamRoots({
      players: puttingHeavy,
      signals: [
        ...['a', 'b', 'c'].map((p) =>
          putting(p, 'putt_slope_downhill_penalty_pct', 'Downhill vs level putt make % (distance-controlled)', null),
        ),
        putting('a', 'sized_one', 'Lag putting', 0.3),
      ],
    });
    render(
      <TeamRootsView
        model={model}
        headline={buildTeamHeadline(model)}
        trend={[]}
        slopes={[]}
        needsYou={[]}
        signalsFailed={false}
        hrefFor={hrefFor}
        navigate={() => {}}
      />,
    );
    openDisclosures();
    return model;
  }

  it('lists a single-player sized cause and unsized causes by name, with the unexplained part named', () => {
    renderView();
    const putting = document.querySelector('[data-slot="area-row"][data-area="putting"]') as HTMLElement;
    // sized even though only one player carries it
    expect(within(putting).getByRole('button', { name: /^Lag putting: −0\.1 strokes a round vs Tour average, Player$/ })).toBeInTheDocument();
    // unsized cause: its short label, no value, and who carries it
    expect(within(putting).getByRole('button', { name: /^Downhill putts: no stroke value yet · Player A, Player B \+1/ })).toBeInTheDocument();
    expect(within(putting).getByText('Not explained yet')).toBeInTheDocument();
    // coach voice throughout
    expect(screen.queryByText(/\byour\b/i)).not.toBeInTheDocument();
  });

  it('a spot opens who carries it, each linking to that player’s map; the table links each player', () => {
    renderView();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: "Open Player A's map" })).toHaveAttribute(
      'href',
      '/golf/dashboard/intelligence?view=team&player=a',
    );
    const leaks = document.querySelector('[data-slot="team-leaks"]') as HTMLElement;
    fireEvent.click(within(leaks).getByRole('button', { name: /^Lag putting/ }));
    const sheet = document.querySelector('[data-slot="team-spot-sheet"]') as HTMLElement;
    expect(within(sheet).getByRole('heading', { name: '1 player losing strokes here' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Open Player A's map, 0\.3 strokes a round here/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/intelligence?view=team&player=a',
    );
  });
});
