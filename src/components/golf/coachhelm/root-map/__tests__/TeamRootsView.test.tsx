// @vitest-environment jsdom
/**
 * TeamRootsView with production-today data: no observed roots yet, every
 * approach cause unsized. The view must still read: a headline, the map,
 * open rings in the matrix, one primary action, and honest copy for the
 * sections with nothing stored.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { buildTeamHeadline, buildTeamRoots, type TeamRosterPlayer } from '@/lib/coachhelm/root-map/build-team-roots';
import { TeamRootsView } from '../TeamRootsView';

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
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('gives back 1.10 a round');
    expect(screen.getByText(/A trend needs strokes-gained rounds/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Team root map/ })).toBeInTheDocument();
    // the forming branch is a real button
    expect(screen.getAllByRole('button', { name: /Lag putting/ }).length).toBeGreaterThan(0);
    // unsized approach cells are links that say so
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('link', { name: /Approach 125–150, no stroke value stored/ })).toHaveLength(3);
    expect(screen.getByText(/before-and-after reads you can see has three or more measured rounds/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing urgent or changed right now/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Putting signals' })).toBeInTheDocument();
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
    expect(screen.getByText(/Signals did not load, so causes cannot be shown/)).toBeInTheDocument();
    expect(screen.getByText(/Focus before-and-after reads are not available/)).toBeInTheDocument();
    expect(screen.queryByText(/No cause is carried by three or more/)).not.toBeInTheDocument();
  });
});

describe('TeamRootsView, a stored miss concentration', () => {
  it('speaks the path on the cell and adds the legend entry', () => {
    const model = buildTeamRoots({ players, signals: [signal('a', 'appr', 'approach', null)] });
    const row = model.rows.find((r) => r.playerId === 'a')!;
    row.cells.appr = { ...row.cells.appr!, contextPath: '175+ yd → long par 3s → short-right' };
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
    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('link', { name: /Where it concentrates: 175\+ yd → long par 3s → short-right, observed, not a cause/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Concentrates by par or shape (open the cell)')).toBeInTheDocument();
    expect(screen.getByText(/Observed, not a cause\.$/)).toBeInTheDocument();
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
    return model;
  }

  it('draws a single-player sized cause and unsized causes as labelled nodes, with the unexplained remainder named', () => {
    renderView();
    const figure = screen.getByRole('figure', { name: 'Team root map' });
    // sized even though only one player carries it
    expect(within(figure).getByRole('button', { name: /Lag putting, 0\.10 strokes a round\. 1 player/ })).toBeInTheDocument();
    // unsized cause: outlined node with its short label and carrier count
    expect(
      within(figure).getByRole('button', { name: /Putting: Downhill putts, no stroke value stored\. 3 players/ }),
    ).toBeInTheDocument();
    expect(within(figure).getAllByText('Unexplained').length).toBeGreaterThan(0);
    // a sized node too narrow for its own label is named just under the row
    const callouts = figure.querySelector('[data-slot="what-callouts"]') as HTMLElement;
    expect(within(callouts).getByText('Lag putting')).toBeInTheDocument();
    expect(within(callouts).getByText('· 1 player')).toBeInTheDocument();
    // legend once, in the coach voice
    expect(screen.getAllByRole('list', { name: 'Legend' })).toHaveLength(1);
    expect(screen.queryByText(/your/i)).not.toBeInTheDocument();
  });

  it('gives matrix columns a short header with the full label kept, and cells open the player drill', () => {
    renderView();
    const table = screen.getByRole('table');
    const header = within(table).getByRole('columnheader', { name: /Downhill vs level putt make % \(distance-controlled\)/ });
    expect(header).toHaveAttribute('title', 'Downhill vs level putt make % (distance-controlled)');
    expect(within(header).getByText('Downhill putts')).toBeInTheDocument();
    const cell = within(table).getAllByRole('link', { name: /Player A: Downhill vs level putt make %/ })[0]!;
    expect(cell).toHaveAttribute('href', '/golf/dashboard/intelligence?view=team&player=a&cause=a-putt_slope_downhill_penalty_pct');
    expect(within(table).getByRole('link', { name: "Open Player A's root map" })).toHaveAttribute(
      'href',
      '/golf/dashboard/intelligence?view=team&player=a',
    );
  });
});
