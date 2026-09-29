/**
 * Team intelligence (CoachHelm Home): the shell around the cause visuals.
 *
 * Carries forward the strokes-figure guarantee the retired bleed board held
 * (a coach once reported strokes gained "missing" after a redesign): the
 * team's strokes-per-round figure appears on the matching theme card and
 * nowhere else. Since the 2026-09 accuracy audit (rows 1 and 7) that figure is
 * the category's TEAM value (`category.strokesAvailable`, a roster mean), not
 * the top insight's single-player counterfactual.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryInsight, TeamCategory } from '@/app/golf/actions/team-category-insights';
import type { IntelRound, IntelStrokesAvailable, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';
import { TeamIntelligence } from '../TeamIntelligence';
import { strokesAvailable, strokesByTheme } from '../strokes';
import { NO_REFS } from '@/lib/golf/team-intelligence/__tests__/fixtures';

vi.mock('../causes/TeeCause', () => ({ TeeCause: ({ playerName }: { playerName: string | null }) => <div data-testid="cause">tee {playerName ?? 'team'}</div> }));
vi.mock('../causes/ApproachCause', () => ({ ApproachCause: ({ playerName }: { playerName: string | null }) => <div data-testid="cause">app {playerName ?? 'team'}</div> }));
vi.mock('../causes/ChipCause', () => ({ ChipCause: ({ playerName }: { playerName: string | null }) => <div data-testid="cause">atg {playerName ?? 'team'}</div> }));
vi.mock('../causes/PuttCause', () => ({ PuttCause: ({ playerName }: { playerName: string | null }) => <div data-testid="cause">putt {playerName ?? 'team'}</div> }));

const engineInsight = (strokesSavedPerRound: number | null): CategoryInsight => ({
  id: 'e',
  message: '~0.7 strokes/round on the table in putting.',
  tone: 'negative',
  engineBacked: true,
  strokesSavedPerRound,
});

const team = (perRound: number, playersWithLeak = 2, playersCounted = 4): IntelStrokesAvailable => ({
  perRound,
  playersWithLeak,
  playersCounted,
});

function category(id: string, insights: CategoryInsight[], strokesAvailable: IntelStrokesAvailable | null = null): TeamCategory {
  return {
    id,
    label: id,
    teamAvg: 0,
    teamAvgLabel: '',
    trend: 'stable',
    insights,
    players: [],
    primaryMetric: '',
    attentionCount: 0,
    playersCounted: 4,
    playersWithoutRecentRound: 0,
    strokesAvailable,
  };
}

function round(id: string, playerId: string, date: string, sg: Partial<IntelRound['sg']>, type: IntelRound['type'] = 'practice'): IntelRound {
  return { id, playerId, date, type, sg: { tee: null, app: null, atg: null, putt: null, ...sg } };
}

const data: TeamIntelligenceData = {
  teamId: 't1',
  baselineLabel: 'PGA Tour',
  tourLabel: 'PGA Tour',
  refs: NO_REFS,
  today: '2026-09-28',
  players: [
    { id: 'p1', name: 'Alex Moore', avatarUrl: null },
    { id: 'p2', name: 'Blake Hart', avatarUrl: null },
  ],
  rounds: [
    round('r1', 'p1', '2026-04-01', { tee: -0.2, app: -1.4, atg: 0.1, putt: -0.3 }, 'tournament'),
    round('r2', 'p1', '2026-05-01', { tee: -0.4, app: -1.0, atg: 0.3, putt: -0.5 }),
    round('r3', 'p2', '2026-05-02', { tee: 0.2, app: -0.2, atg: -0.1, putt: 0.4 }),
    // A counted round with no stored SG: it must be counted as missing, not vanish.
    round('r4', 'p2', '2026-05-03', {}),
  ],
  tee: [],
  approach: [],
  chips: [],
  putts: [],
};

const renderIt = (strokes = {}) =>
  render(
    <TeamIntelligence result={{ success: true, data }} strokes={strokes} playerHref={(id) => `/golf/dashboard/roster/${id}`} />,
  );

describe('strokesAvailable / strokesByTheme', () => {
  it('reads the category\'s team figure, never a single insight\'s counterfactual', () => {
    // The old chip took the first engine insight's 2.50 (one player) as the team's.
    const onePlayer = category('putting', [engineInsight(2.5)]);
    expect(strokesAvailable(onePlayer)).toBeNull();
    expect(strokesAvailable(category('putting', [engineInsight(2.5)], team(0.6)))).toEqual(team(0.6));
    expect(strokesAvailable(category('putting', [], team(0)))).toBeNull();
    expect(strokesAvailable(category('putting', [], team(Number.NaN)))).toBeNull();
  });

  it('maps engine categories onto the four Home themes and ignores scoring', () => {
    const out = strokesByTheme([
      category('driving', [], team(0.3)),
      category('short_game', [], team(0.05)),
      category('scoring', [], team(1.2)),
    ]);
    expect(Object.keys(out).sort()).toEqual(['atg', 'tee']);
  });
});

describe('TeamIntelligence', () => {
  it('opens on the theme losing the most, with team SG per round on every card', () => {
    renderIt();
    const cards = screen.getAllByRole('button', { pressed: true }).filter((b) => b.textContent?.includes('SG / round'));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Approach');
    // (−1.4 + −1.0 + −0.2) / 3 = −0.87
    expect(cards[0]).toHaveTextContent('−0.9');
    expect(screen.getByTestId('cause')).toHaveTextContent('app team');
  });

  it('keeps the team strokes-per-round figure on the matching card, and only there, with its n', () => {
    renderIt(strokesByTheme([category('putting', [], team(0.74, 2, 4))]));
    const putting = screen.getByRole('button', { name: /Putting/ });
    expect(within(putting).getByText(/~0\.7 strokes \/ round per player available/)).toBeInTheDocument();
    expect(within(putting).getByText(/2 of 4 current players carry a measured leak/)).toBeInTheDocument();
    expect(screen.getAllByText(/strokes \/ round per player available/)).toHaveLength(1);
  });

  it('counts rounds with no stored SG instead of dropping them silently', () => {
    renderIt();
    const approach = screen.getByRole('button', { name: /Approach/ });
    expect(within(approach).getByText(/3 rounds/)).toBeInTheDocument();
    expect(within(approach).getByText(/1 without SG/)).toBeInTheDocument();
  });

  it('shows the last 30 days beside the season on every card', () => {
    render(
      <TeamIntelligence
        result={{
          success: true,
          data: { ...data, rounds: [...data.rounds, round('r5', 'p1', '2026-09-20', { app: -3.0 })] },
        }}
        strokes={{}}
        playerHref={() => '#'}
      />,
    );
    const approach = screen.getByRole('button', { name: /Approach/ });
    expect(within(approach).getByText(/Last 30 days −3\.0 · 1 round/)).toBeInTheDocument();
    const putting = screen.getByRole('button', { name: /Putting/ });
    expect(within(putting).getByText(/Last 30 days: no rounds with SG/)).toBeInTheDocument();
  });

  it('lists players worst to best and filters the cause visual to a tapped player', () => {
    renderIt();
    const list = screen.getByRole('list', { name: /Players, worst to best/ });
    const names = within(list).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(names[0]).toContain('Alex Moore');
    expect(names[1]).toContain('Blake Hart');

    fireEvent.click(within(list).getByRole('button', { name: /Blake Hart/ }));
    expect(screen.getByTestId('cause')).toHaveTextContent('app Blake Hart');
    expect(screen.getByRole('region', { name: /Blake Hart/ })).toHaveTextContent('Selected player');

    fireEvent.click(screen.getByRole('button', { name: /Whole team/ }));
    expect(screen.getByTestId('cause')).toHaveTextContent('app team');
  });

  it('re-reads players against the team average when asked', () => {
    renderIt();
    fireEvent.click(screen.getByRole('radio', { name: 'vs Team avg' }));
    const list = screen.getByRole('list', { name: /SG vs team avg/ });
    // Blake −0.2 vs team −0.87 → +0.7
    expect(within(list).getByRole('button', { name: /Blake Hart/ })).toHaveTextContent('+0.7');
  });

  it('filters by round type with honest counts', () => {
    renderIt();
    const types = screen.getByRole('radiogroup', { name: 'Round type' });
    expect(within(types).getByRole('radio', { name: /All rounds/ })).toHaveTextContent('4');
    fireEvent.click(within(types).getByRole('radio', { name: /Tournament/ }));
    const list = screen.getByRole('list', { name: /Players, worst to best/ });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
  });

  it('says so when the last 30 days has no rounds, and offers the season', () => {
    renderIt();
    fireEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }));
    expect(screen.getByText('No rounds in the last 30 days')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the season' }));
    expect(screen.getByTestId('cause')).toBeInTheDocument();
  });

  it('shows a notice, not an empty board, when the read failed', () => {
    render(<TeamIntelligence result={{ success: false, error: 'boom' }} strokes={{}} playerHref={() => '#'} />);
    expect(screen.getByText("Couldn't load team intelligence")).toBeInTheDocument();
  });

  it('never prints NaN or undefined', () => {
    const { container } = renderIt();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});
