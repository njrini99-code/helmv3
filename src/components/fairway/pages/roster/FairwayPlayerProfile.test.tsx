// @vitest-environment jsdom

/**
 * ============================================================================
 * FairwayPlayerProfile — field-sheet composition pins
 * ----------------------------------------------------------------------------
 * Pins the shape docs/design/fairway-facelift/screens/roster-player.v3.md
 * introduced: a bare masthead with a LINKED verdict sentence, one Surface
 * holding the round strip beside the readouts, a bare ledger row of
 * strokes-gained rows and focus areas, and a round log that renders both a
 * stacked phone list and a desktop table with CSS choosing between them.
 *
 * The failure-vs-empty distinction is the point of most of these cases: a
 * broken read and an honestly-empty player must never render the same way.
 *
 * The pins ported forward from the previous pass (identity is unboxed, no
 * "Member since" line, exactly one Message action plus the overflow menu, no
 * cross-surface link cards, no fabricated number when a read failed, focus
 * areas as rows rather than cards) all still hold below — restated against
 * the regions that replaced StatMatrix, the Standing Surface and the tab row.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FairwayPlayerProfile,
  type FairwayPlayerProfileFocusArea,
  type FairwayPlayerProfilePlayer,
  type FairwayPlayerProfileProps,
  type FairwayPlayerProfileRound,
} from './FairwayPlayerProfile';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('./FairwayPlayerActionsMenu', () => ({
  FairwayPlayerActionsMenu: () => <div data-testid="player-actions-menu" />,
}));

const TODAY = '2026-09-10';

function makePlayer(overrides: Partial<FairwayPlayerProfilePlayer> = {}): FairwayPlayerProfilePlayer {
  return {
    id: 'player-1',
    first_name: 'Cole',
    last_name: 'Bennett',
    avatar_url: null,
    hometown: 'Austin',
    state: 'TX',
    graduation_year: 2027,
    handicap: 4,
    phone: null,
    email: null,
    created_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeDetailedStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    roundsPlayed: 21,
    scoringAverage: 74.7,
    fairwayPercentage: 65,
    girPercentage: 71,
    puttsPerRound: 29.8,
    ...overrides,
  } as GolfStats;
}

function makeRound(overrides: Partial<FairwayPlayerProfileRound> = {}): FairwayPlayerProfileRound {
  return {
    id: 'r1',
    round_date: '2026-08-30',
    course_name: 'pebble beach',
    round_type: 'qualifier',
    total_score: 71,
    score_to_par: -1,
    holes_played: 18,
    total_putts: 29,
    total_gir: 12,
    total_gir_possible: 18,
    ...overrides,
  };
}

const sgTotal: PlayerStandingRow = {
  metric_id: 'sg_total',
  player_value: -1.2,
  team_avg: -2.1,
  team_n: 8,
  team_pct: 60,
  pga_value: 0,
  pga_delta: -1.2,
};

function baseProps(overrides: Partial<FairwayPlayerProfileProps> = {}): FairwayPlayerProfileProps {
  return {
    player: makePlayer(),
    membershipStatus: 'active',
    detailedStats: makeDetailedStats(),
    standingRows: [],
    standingUnavailable: false,
    focusAreas: [],
    recentRounds: [],
    roundsUnavailable: false,
    today: TODAY,
    ...overrides,
  };
}

/* ── Masthead ─────────────────────────────────────────────────────────────── */

describe('FairwayPlayerProfile — masthead', () => {
  it('renders the name and class year without a hero card wrapper around identity', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cole Bennett' })).toBeInTheDocument();
    expect(screen.getByText("'27")).toBeInTheDocument();
  });

  it('no longer renders a "Member since" line', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByText(/member since/i)).toBeNull();
  });

  it('renders exactly one primary Message action plus the overflow menu', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.getByRole('link', { name: /message/i })).toBeInTheDocument();
    expect(screen.getByTestId('player-actions-menu')).toBeInTheDocument();
  });

  it('keeps the back link as plain words, with no arrow glyph in the control', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    const back = screen.getByRole('link', { name: 'Roster' });
    expect(back).toHaveAttribute('href', '/golf/dashboard/roster');
    expect(back.querySelector('svg')).toBeNull();
  });

  it('does not render the old three cross-surface link cards', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByText('Scouting Report')).toBeNull();
    expect(screen.queryByText('Game Fingerprint')).toBeNull();
  });

  it('states the SG headline and links the worst category to the Game report', () => {
    render(
      <FairwayPlayerProfile
        {...baseProps({
          standingRows: [
            sgTotal,
            { ...sgTotal, metric_id: 'sg_putting', player_value: -0.6, team_pct: 10 },
            { ...sgTotal, metric_id: 'sg_ott', player_value: 0.2, team_pct: 70 },
          ],
        })}
      />,
    );
    const verdict = document.querySelector('[data-slot="verdict"]')!;
    expect(verdict.textContent).toContain('−1.20 strokes per round vs the field.');
    expect(within(verdict as HTMLElement).getByRole('link', { name: 'putting' })).toHaveAttribute(
      'href',
      '/golf/dashboard/players/player-1/game',
    );
  });

  it('says the standing read failed rather than reusing the cold-start sentence', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingUnavailable: true })} />);
    const verdict = document.querySelector('[data-slot="verdict"]')!;
    expect(verdict.textContent).toBe("Strokes-gained standing couldn't load.");
  });

  it('uses the cold-start sentence for a real player with no standing rows yet', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingRows: [] })} />);
    const verdict = document.querySelector('[data-slot="verdict"]')!;
    expect(verdict.textContent).toBe('Strokes-gained standing fills in after 5+ rounds with shot detail.');
  });
});

/* ── The stage ────────────────────────────────────────────────────────────── */

describe('FairwayPlayerProfile — the stage', () => {
  const rounds = [
    makeRound({ id: 'a', round_date: '2026-09-01', score_to_par: 2, total_score: 74 }),
    makeRound({ id: 'b', round_date: '2026-08-20', score_to_par: -1, total_score: 71 }),
  ];

  it('draws one mark per plottable round, each linking to its round detail', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: rounds })} />);
    const strip = document.querySelector('[data-slot="round-strip"]')!;
    const marks = within(strip as HTMLElement).getAllByRole('link');
    expect(marks).toHaveLength(2);
    expect(marks.map((m) => m.getAttribute('href'))).toEqual([
      '/golf/dashboard/rounds/b',
      '/golf/dashboard/rounds/a',
    ]);
  });

  it('counts only the rounds it actually drew in the stage overline', () => {
    render(
      <FairwayPlayerProfile
        {...baseProps({ recentRounds: [...rounds, makeRound({ id: 'junk', round_date: '60824-02-02' })] })}
      />,
    );
    expect(screen.getByText(/last 2 rounds/i)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="round-strip"] a')).toHaveLength(2);
  });

  it('renders a failure notice, not an empty state, when the rounds read failed', () => {
    render(<FairwayPlayerProfile {...baseProps({ roundsUnavailable: true })} />);
    expect(screen.getAllByText(/couldn’t load this player’s rounds/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('No scored rounds yet')).toBeNull();
    expect(document.querySelector('[data-slot="round-strip"]')).toBeNull();
  });

  it('renders the honest empty state, not a zero-width axis, for a player with no rounds', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: [] })} />);
    expect(screen.getByText('No scored rounds yet')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="round-strip"]')).toBeNull();
  });

  it('mounts exactly one Surface: the stage', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: rounds })} />);
    expect(document.querySelectorAll('[data-slot="surface"]')).toHaveLength(1);
  });
});

/* ── The readouts ─────────────────────────────────────────────────────────── */

describe('FairwayPlayerProfile — readouts', () => {
  it('renders the four career/standing numbers as one divided column, not four tiles', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingRows: [{ ...sgTotal, metric_id: 'gir_pct', player_value: 71, team_avg: 64 }] })} />);
    const readouts = document.querySelector('[data-slot="field-readouts"]')!;
    expect(readouts.tagName).toBe('DL');
    const labels = within(readouts as HTMLElement).getAllByRole('term').map((t) => t.textContent);
    expect(labels).toEqual(['Scoring avg · career', 'GIR %', 'Putts/rd · career', 'Rounds · career']);
    expect(within(readouts as HTMLElement).getByText('74.7')).toBeInTheDocument();
    expect(within(readouts as HTMLElement).getByText('29.8')).toBeInTheDocument();
  });

  it('shows an honest dash rather than a fabricated number when the stats read failed', () => {
    render(<FairwayPlayerProfile {...baseProps({ detailedStats: null })} />);
    const readouts = document.querySelector('[data-slot="field-readouts"]') as HTMLElement;
    expect(within(readouts).getByText('Scoring avg · career')).toBeInTheDocument();
    expect(within(readouts).getAllByText('–').length).toBeGreaterThan(0);
    expect(within(readouts).queryByText('—')).toBeNull();
    expect(within(readouts).queryByText('0.0')).toBeNull();
  });

  it('never headlines the readouts and the round log with the same word for different numbers', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: [makeRound()] })} />);
    const readoutLabels = within(document.querySelector('[data-slot="field-readouts"]') as HTMLElement)
      .getAllByRole('term')
      .map((t) => t.textContent);
    const tableHeads = within(document.querySelector('[data-slot="round-log"]') as HTMLElement)
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(readoutLabels).toContain('GIR %');
    expect(tableHeads).toContain('Greens');
    expect(tableHeads).not.toContain('GIR');
  });
});

/* ── The ledger row ───────────────────────────────────────────────────────── */

describe('FairwayPlayerProfile — standing ledger', () => {
  it('renders all four strokes-gained sub-metrics, each stating its own value in mono', () => {
    render(
      <FairwayPlayerProfile
        {...baseProps({
          standingRows: [
            { ...sgTotal, metric_id: 'sg_ott', player_value: 0.31, team_pct: 80, team_n: 9 },
            { ...sgTotal, metric_id: 'sg_putting', player_value: -0.42, team_pct: 20, team_n: 9 },
          ],
        })}
      />,
    );
    const ledger = document.querySelector('[data-slot="sg-ledger"]') as HTMLElement;
    expect(within(ledger).getByText('Off the Tee')).toBeInTheDocument();
    expect(within(ledger).getByText('Approach')).toBeInTheDocument();
    expect(within(ledger).getByText('Around the Green')).toBeInTheDocument();
    expect(within(ledger).getByText('Putting')).toBeInTheDocument();
    expect(within(ledger).getByText('+0.31')).toBeInTheDocument();
    expect(within(ledger).getByText('−0.42')).toBeInTheDocument();
  });

  it('speaks in the coach voice, never the player possessive', () => {
    render(
      <FairwayPlayerProfile
        {...baseProps({ standingRows: [{ ...sgTotal, metric_id: 'sg_ott', team_pct: 80, team_n: 9 }] })}
      />,
    );
    const ledger = document.querySelector('[data-slot="sg-ledger"]') as HTMLElement;
    expect(within(ledger).getByText('Top quartile on team')).toBeInTheDocument();
    expect(ledger.textContent).not.toMatch(/your team/i);
  });

  it('warns that the read failed rather than rendering a column that quietly shows nothing', () => {
    render(<FairwayPlayerProfile {...baseProps({ standingUnavailable: true })} />);
    expect(screen.getByText(/couldn’t load strokes-gained standing/i)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sg-ledger"]')).toBeNull();
  });
});

describe('FairwayPlayerProfile — focus areas', () => {
  it('renders focus areas as rows, not empty-state cards, when present', () => {
    const focusAreas: FairwayPlayerProfileFocusArea[] = [
      {
        id: 'fa1',
        title: 'Three-putt avoidance',
        area_type: 'putting',
        status: 'in_progress',
        current_value: 2,
        target_value: 1,
        created_at: '2026-08-01T00:00:00.000Z',
      },
    ];
    render(<FairwayPlayerProfile {...baseProps({ focusAreas })} />);
    expect(screen.getByText('Three-putt avoidance')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows an honest empty line, not a card, when there are no open focus areas', () => {
    render(<FairwayPlayerProfile {...baseProps({ focusAreas: [] })} />);
    expect(screen.getByText(/no open focus areas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Genome tab' })).toHaveAttribute(
      'href',
      '/golf/dashboard/players/player-1/genome',
    );
  });
});

/* ── The round log ────────────────────────────────────────────────────────── */

describe('FairwayPlayerProfile — round log', () => {
  const rounds = [
    makeRound(),
    makeRound({
      id: 'r2',
      round_date: '2026-08-11',
      course_name: 'bandon dunes',
      total_score: 78,
      score_to_par: 6,
      total_putts: 34,
      total_gir: 7,
    }),
  ];

  it('renders every fetched round with its score, to-par, putts and greens', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: rounds })} />);
    const table = document.querySelector('[data-slot="round-log"]') as HTMLElement;
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2
    expect(within(table).getByText('71')).toBeInTheDocument();
    expect(within(table).getByText('−1')).toBeInTheDocument();
    expect(within(table).getByText('12/18')).toBeInTheDocument();
    expect(within(table).getByText('7/18')).toBeInTheDocument();
    expect(within(table).getByText('Pebble Beach')).toBeInTheDocument();
    expect(within(table).getByText('Bandon Dunes')).toBeInTheDocument();
  });

  it('keeps a stacked phone list and the table both in the DOM, with CSS choosing', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: rounds })} />);
    const compact = document.querySelector('[data-slot="round-log-compact"]')!;
    const table = document.querySelector('[data-slot="round-log"]')!;
    expect(compact.className).toContain('md:hidden');
    expect(table.parentElement!.className).toContain('hidden');
    expect(table.parentElement!.className).toContain('md:block');
  });

  it('carries the anchor the masthead trend clause links to', () => {
    render(<FairwayPlayerProfile {...baseProps({ recentRounds: rounds })} />);
    expect(document.getElementById('rounds')).not.toBeNull();
  });

  it('replaces the rows with a failure notice, never an empty table, when the read failed', () => {
    render(<FairwayPlayerProfile {...baseProps({ roundsUnavailable: true })} />);
    expect(document.querySelector('[data-slot="round-log"]')).toBeNull();
    expect(document.querySelector('[data-slot="round-log-compact"]')).toBeNull();
    expect(screen.getAllByText(/couldn’t load this player’s rounds/i).length).toBe(2);
  });
});

/* ── What the facelift removed ────────────────────────────────────────────── */

describe('FairwayPlayerProfile — removed regions', () => {
  it('no longer renders the Game / Genome / Rounds tab row or its spine stage', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByRole('radiogroup', { name: /player dossier view/i })).toBeNull();
    expect(screen.queryByTestId('stats-spine-stage')).toBeNull();
  });

  it('no longer mislabels career numbers as "Season"', () => {
    render(<FairwayPlayerProfile {...baseProps()} />);
    expect(screen.queryByText('Season')).toBeNull();
  });
});
