/**
 * Team intelligence (CoachHelm Home): the shell around the cause visuals.
 *
 * Carries forward the strokes-figure guarantee the retired bleed board held
 * (a coach once reported strokes gained "missing" after a redesign): the
 * engine's live strokes-per-round figure appears on the matching theme card
 * and nowhere else, and a template or diagnostic-only row never makes one.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryInsight, TeamCategory } from '@/app/golf/actions/team-category-insights';
import type { IntelRound, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';
import { TeamIntelligence } from '../TeamIntelligence';
import { strokesAvailable, strokesByTheme } from '../strokes';

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

function category(id: string, insights: CategoryInsight[]): TeamCategory {
  return { id, label: id, teamAvg: 0, teamAvgLabel: '', trend: 'stable', insights, players: [], primaryMetric: '', attentionCount: 0 };
}

function round(id: string, playerId: string, date: string, sg: Partial<IntelRound['sg']>, type: IntelRound['type'] = 'practice'): IntelRound {
  return { id, playerId, date, type, sg: { tee: null, app: null, atg: null, putt: null, ...sg } };
}

const data: TeamIntelligenceData = {
  teamId: 't1',
  baselineLabel: 'PGA Tour',
  today: '2026-09-28',
  players: [
    { id: 'p1', name: 'Alex Moore', avatarUrl: null },
    { id: 'p2', name: 'Blake Hart', avatarUrl: null },
  ],
  rounds: [
    round('r1', 'p1', '2026-04-01', { tee: -0.2, app: -1.4, atg: 0.1, putt: -0.3 }, 'tournament'),
    round('r2', 'p1', '2026-05-01', { tee: -0.4, app: -1.0, atg: 0.3, putt: -0.5 }),
    round('r3', 'p2', '2026-05-02', { tee: 0.2, app: -0.2, atg: -0.1, putt: 0.4 }),
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
  it('reads only an engine-backed, live, positive figure', () => {
    expect(strokesAvailable(category('putting', [engineInsight(0.74)]))?.perRound).toBe(0.74);
    expect(strokesAvailable(category('putting', [{ id: 't', message: 'Template', tone: 'negative' }]))).toBeNull();
    expect(strokesAvailable(category('putting', [engineInsight(null)]))).toBeNull();
    expect(strokesAvailable(category('putting', [engineInsight(0)]))).toBeNull();
    expect(strokesAvailable(category('putting', [engineInsight(Number.NaN)]))).toBeNull();
    expect(
      strokesAvailable(category('putting', [{ id: 'x', message: 'x', tone: 'negative', strokesSavedPerRound: 0.9 }])),
    ).toBeNull();
  });

  it('maps engine categories onto the four Home themes and ignores scoring', () => {
    const out = strokesByTheme([
      category('driving', [engineInsight(0.3)]),
      category('short_game', [engineInsight(0.05)]),
      category('scoring', [engineInsight(1.2)]),
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

  it('keeps the strokes-per-round figure on the matching card, and only there', () => {
    renderIt(strokesByTheme([category('putting', [engineInsight(0.74)])]));
    const putting = screen.getByRole('button', { name: /Putting/ });
    expect(within(putting).getByText(/Up to 0\.7 strokes \/ round available/)).toBeInTheDocument();
    expect(screen.getAllByText(/strokes \/ round available/)).toHaveLength(1);
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
    expect(within(types).getByRole('radio', { name: /All rounds/ })).toHaveTextContent('3');
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
