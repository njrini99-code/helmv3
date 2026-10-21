/**
 * "The field" card against the Fall Invitational (86dad12b) production rows,
 * against a qualifier scored as totals (487f30a2), and with a scorecard the
 * round cards do not cover.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { FairwayQualifierFieldStats } from '../FairwayQualifierFieldStats';
import { deriveStandings } from '../qualifier-display';
import type { LinkedRound } from '../qualifier-stats';

const ROUNDS: Record<string, Array<[number, number]>> = {
  'Cole Bennett': [[71, -1], [70, -2]],
  'Mason Rivers': [[72, 0], [72, 0]],
  'Owen Carter': [[74, 2], [71, -1]],
  'Ethan Park': [[73, 1], [73, 1]],
  'Jackson Hale': [[75, 3], [72, 0]],
  'Dylan Brooks': [[76, 4], [74, 2]],
  'Tyler Hayes': [[78, 6], [77, 5]],
};
const id = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

const LINKED: LinkedRound[] = Object.entries(ROUNDS).flatMap(([name, rounds]) =>
  rounds.map(([score, toPar], i) => ({ playerId: id(name), playerName: name, roundNumber: i + 1, score, toPar })),
);

const STANDINGS = deriveStandings(
  Object.entries(ROUNDS).map(([name, rounds]) => ({
    player_id: id(name),
    player_name: name,
    rounds_completed: rounds.length,
    total_score: rounds.reduce((s, [score]) => s + score, 0),
    total_to_par: rounds.reduce((s, [, toPar]) => s + toPar, 0),
  })),
);

function tile(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.parentElement as HTMLElement;
}

describe('FairwayQualifierFieldStats', () => {
  it('reads the Fall Invitational: tiles, rounds on one scale, to-par buckets, movers', () => {
    render(
      <FairwayQualifierFieldStats
        standings={STANDINGS}
        linkedRounds={LINKED}
        numRounds={3}
        selectionSlotsTotal={5}
        completed={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'The field' })).toBeInTheDocument();
    expect(screen.getByText('14 scorecards · 7 players')).toBeInTheDocument();

    expect(tile('Field avg')).toHaveTextContent('73.4');
    expect(tile('Field avg')).toHaveTextContent('+1.4 to par a round');
    expect(tile('Low round')).toHaveTextContent('70−2');
    expect(tile('Low round')).toHaveTextContent('Cole Bennett · R2');
    expect(tile('Spread')).toHaveTextContent('14shots');
    expect(tile('Spread')).toHaveTextContent('−3 to +11, first to last');
    expect(tile('Travel cut')).toHaveTextContent('3shots');
    expect(tile('Travel cut')).toHaveTextContent('+3 in, +6 out');

    const byRound = screen.getByRole('region', { name: 'Scores by round' });
    const [r1, r2, r3] = within(byRound).getAllByRole('listitem');
    expect(r1).toHaveTextContent('74.17 cards');
    expect(r2).toHaveTextContent('72.77 cards');
    expect(r3).toHaveTextContent('To play');
    expect(r1).toHaveTextContent('Round 1: 7 cards, averaging 74.1, from −1 to +6.');
    expect(byRound).toHaveTextContent('Round 2 ran 1.4 shots better than round 1 for the 7 players who played both.');

    const toPar = screen.getByRole('region', { name: 'Rounds to par' });
    expect(within(toPar).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Under par3',
      'Even3',
      '+1 to +24',
      '+3 to +42',
      '+5 to +72',
      '+8 or more0',
    ]);

    const moved = screen.getByRole('region', { name: 'Movers after round 2' });
    const [owen, ethan] = within(moved).getAllByRole('listitem');
    expect(owen).toHaveTextContent('Owen Carter');
    expect(owen).toHaveTextContent('71 (−1) in round 2');
    expect(owen).toHaveTextContent('Up 1 place, from 4th to 3rd');
    expect(ethan).toHaveTextContent('Down 1 place, from 3rd to 4th');
  });

  it('gives a qualifier scored as totals the totals tiles and one honest line', () => {
    const travelTeam = deriveStandings([
      { player_id: 'cole', player_name: 'Cole Bennett', rounds_completed: 1, total_score: 70, total_to_par: -2 },
      { player_id: 'dylan', player_name: 'Dylan Brooks', rounds_completed: 1, total_score: 72, total_to_par: 0 },
      { player_id: 'mason', player_name: 'Mason Rivers', rounds_completed: 1, total_score: 73, total_to_par: 1 },
    ]);
    render(
      <FairwayQualifierFieldStats
        standings={travelTeam}
        linkedRounds={[]}
        numRounds={1}
        selectionSlotsTotal={0}
        completed
      />,
    );
    expect(tile('Field avg')).toHaveTextContent('71.7');
    expect(screen.queryByText('Low round')).toBeNull();
    expect(screen.queryByText('Travel cut')).toBeNull();
    expect(screen.getByText('Scores were entered as totals, so there are no round cards to chart by round.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scores by round' })).toBeNull();
  });

  it('says how many scorecards the round cards leave out', () => {
    render(
      <FairwayQualifierFieldStats
        standings={STANDINGS}
        linkedRounds={LINKED.filter((r) => r.playerId !== 'tyler-hayes')}
        numRounds={3}
        selectionSlotsTotal={5}
        completed={false}
      />,
    );
    expect(
      screen.getByText('2 of 14 scorecards on the board have no linked round card, so the round stats leave them out.'),
    ).toBeInTheDocument();
  });

  it('stays out of the way until the board has scores', () => {
    const { container, rerender } = render(
      <FairwayQualifierFieldStats standings={null} linkedRounds={[]} numRounds={3} selectionSlotsTotal={5} completed={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <FairwayQualifierFieldStats
        standings={deriveStandings([
          { player_id: 'a', player_name: 'A', rounds_completed: 0, total_score: null, total_to_par: null },
        ])}
        linkedRounds={[]}
        numRounds={3}
        selectionSlotsTotal={5}
        completed={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
