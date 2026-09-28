/**
 * The tournament board (slice 2) against the Fall Invitational qualifier
 * (86dad12b): 7 players through 2 of 3 rounds, a 5-player travel squad with
 * one coach's pick, round cards linked. The feed totals and per-round scores
 * are the production rows (golf_rounds, qualifier_round_number 1 and 2).
 *
 *   · ties share a position ("T2") and the next one skips;
 *   · the leader is marked by an ink bar, never a green row wash;
 *   · a player's panel opens from the chevron: rounds by round (a coach can
 *     open each round card), the trend, the lead and both lines;
 *   · the season average line is a coach's (only when the page sends it);
 *   · an entry scored without linked rounds says so instead of blank chips.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, within, fireEvent } from '@testing-library/react';

const mockUseQualifierRealtime = vi.fn();

vi.mock('@/hooks/golf/use-qualifier-realtime', () => ({
  useQualifierRealtime: (...args: unknown[]) => mockUseQualifierRealtime(...args),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { selection_state: 'scoring' }, error: null }),
        }),
      }),
    }),
  }),
}));

import { FairwayQualifierLeaderboard, type LeaderboardRound } from '../FairwayQualifierLeaderboard';

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

function feedEntry(player_name: string, rounds_completed: number, total_score: number, total_to_par: number) {
  return {
    id: `e-${slug(player_name)}`,
    qualifier_id: 'q1',
    player_id: slug(player_name),
    player_name,
    position: null,
    score: total_score,
    total_score,
    total_to_par,
    rounds_completed,
    is_tied: false,
    status: 'registered',
    notes: null,
    round_id: null,
    created_at: null,
    updated_at: null,
  };
}

// Production: golf_rounds for 86dad12b, R1 on Sep 25, R2 on Sep 26.
const ROUNDS: Record<string, Array<[number, number]>> = {
  'Cole Bennett': [[71, -1], [70, -2]],
  'Mason Rivers': [[72, 0], [72, 0]],
  'Owen Carter': [[74, 2], [71, -1]],
  'Ethan Park': [[73, 1], [73, 1]],
  'Jackson Hale': [[75, 3], [72, 0]],
  'Dylan Brooks': [[76, 4], [74, 2]],
  'Tyler Hayes': [[78, 6], [77, 5]],
};

const FALL_INVITATIONAL = Object.entries(ROUNDS).map(([name, rounds]) =>
  feedEntry(
    name,
    rounds.length,
    rounds.reduce((sum, [score]) => sum + score, 0),
    rounds.reduce((sum, [, toPar]) => sum + toPar, 0),
  ),
);

const ROUNDS_BY_PLAYER = new Map<string, LeaderboardRound[]>(
  Object.entries(ROUNDS).map(([name, rounds]) => [
    slug(name),
    rounds.map(([score, toPar], i) => ({
      roundNumber: i + 1,
      score,
      toPar,
      roundId: `r-${slug(name)}-${i + 1}`,
    })),
  ]),
);

function feed(entries: ReturnType<typeof feedEntry>[], status = 'in_progress') {
  mockUseQualifierRealtime.mockReturnValue({
    leaderboard: entries,
    qualifier: { status, num_rounds: 3 },
    loading: false,
    error: null,
  });
}

function renderBoard(overrides: Partial<Parameters<typeof FairwayQualifierLeaderboard>[0]> = {}) {
  const utils = render(
    <FairwayQualifierLeaderboard
      qualifierId="86dad12b-d9e4-4d24-9d0b-8ca455634c64"
      entrantCount={7}
      selectionSlotsTotal={5}
      selectionSlotsCoachPick={1}
      numRounds={3}
      roundsByPlayer={ROUNDS_BY_PLAYER}
      canOpenRounds
      {...overrides}
    />,
  );
  const table = utils.container.querySelector('table') as HTMLTableElement;
  return { ...utils, table };
}

/** The table's detail panel for a player, opened from its chevron. */
function openPanel(table: HTMLTableElement, name: string): HTMLElement {
  const toggle = within(table).getByRole('button', { name: `Show ${name}'s rounds` });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panelId = toggle.getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  const panel = document.getElementById(panelId as string);
  expect(panel).toBeTruthy();
  return panel as HTMLElement;
}

describe('FairwayQualifierLeaderboard — the board', () => {
  it('ranks by to-par with golf ties, and marks the leader without a green wash', () => {
    feed([
      feedEntry('Cole Bennett', 2, 141, -3),
      feedEntry('Mason Rivers', 2, 144, 0),
      feedEntry('Owen Carter', 2, 144, 0),
      feedEntry('Ethan Park', 2, 146, 2),
    ]);
    const { table } = renderBoard({ selectionSlotsTotal: 0, selectionSlotsCoachPick: 0 });

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['1', 'T2', 'T2', '4']);
    // Under par reads in the accent ink; the leader's row itself is plain.
    for (const row of rows) expect(row.className).not.toMatch(/accent/);
    expect(within(rows[0] as HTMLElement).getByText('−3')).toHaveClass('text-accent-ink');
    expect(within(rows[1] as HTMLElement).getByText('E')).toHaveClass('text-text-secondary');
    // Rounds read "played / of the qualifier's rounds".
    expect(rows[0]).toHaveTextContent('2/3');
  });

  it('draws the top-score line and the travel cut after ranks 4 and 5', () => {
    feed(FALL_INVITATIONAL);
    const { table } = renderBoard();
    const lines = Array.from(table.querySelectorAll('tr[aria-hidden="true"]')).map((tr) => tr.textContent);
    expect(lines).toEqual(['Top-score line · 4 auto-qualify', 'Travel cut · top 5 make the trip']);
    // The squad chips: In lineup (1–4), Bubble (5), none below the cut.
    expect(within(table).getAllByText('In lineup')).toHaveLength(4);
    expect(within(table).getAllByText('Bubble')).toHaveLength(1);
  });

  it("opens a player's rounds, trend, the lead and both lines from the chevron", () => {
    feed(FALL_INVITATIONAL);
    const { table } = renderBoard();

    const cole = openPanel(table, 'Cole Bennett');
    expect(cole).toHaveTextContent('By round');
    const r1 = within(cole).getByRole('link', { name: /^Round 1: 71, −1/ });
    expect(r1).toHaveAttribute('href', '/golf/dashboard/rounds/r-cole-bennett-1');
    expect(within(cole).getByRole('link', { name: /^Round 2: 70, −2/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/rounds/r-cole-bennett-2',
    );
    // Round 3 is still to play.
    expect(cole).toHaveTextContent('R3To play');
    expect(cole).toHaveTextContent('Round 2 was 1 shot better than round 1');
    expect(cole).toHaveTextContent('LeadLeads by 3 shots');
    expect(cole).toHaveTextContent('Auto-qualify line6 shots clear');
    expect(cole).toHaveTextContent('Travel cut9 shots clear');

    // The bubble: one back of the auto-qualify line, three clear of the cut.
    const jackson = openPanel(table, 'Jackson Hale');
    expect(jackson).toHaveTextContent('Lead6 shots back');
    expect(jackson).toHaveTextContent('Auto-qualify line1 shot back');
    expect(jackson).toHaveTextContent('Travel cut3 shots clear');
    expect(jackson).toHaveTextContent('Round 2 was 3 shots better than round 1');

    const dylan = openPanel(table, 'Dylan Brooks');
    expect(dylan).toHaveTextContent('Travel cut3 shots back');

    // The chevron closes it again.
    const toggle = within(table).getByRole('button', { name: "Hide Cole Bennett's rounds" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(within(table).queryByRole('link', { name: /^Round 1: 71/ })).toBeNull();
  });

  it('shows the season average only when the page sends it (a coach)', () => {
    feed(FALL_INVITATIONAL);
    // Cole's countable 2026 rounds outside this qualifier: 17 × 18 holes, 74.35.
    const { table, unmount } = renderBoard({
      season: { year: 2026, byPlayer: { 'cole-bennett': { average: 1264 / 17, rounds: 17 } } },
    });
    const cole = openPanel(table, 'Cole Bennett');
    expect(cole).toHaveTextContent('Season avg17 other rounds in 2026');
    expect(cole).toHaveTextContent('74.4');
    // 70.5 a round here against 74.35: 3.9 better.
    expect(cole).toHaveTextContent('3.9 better here');
    unmount();

    // A player's page gets no season and no round-card links.
    const player = renderBoard({ season: null, canOpenRounds: false });
    const panel = openPanel(player.table, 'Cole Bennett');
    expect(panel).not.toHaveTextContent('Season avg');
    expect(within(panel).queryByRole('link')).toBeNull();
    expect(panel).toHaveTextContent('71');
  });

  it('says an entry scored without linked rounds has its total only', () => {
    feed([feedEntry('Cole Bennett', 1, 70, -2), feedEntry('Dylan Brooks', 1, 72, 0)], 'completed');
    const { table } = renderBoard({ roundsByPlayer: undefined, selectionSlotsTotal: 0, selectionSlotsCoachPick: 0 });
    const panel = openPanel(table, 'Cole Bennett');
    expect(panel).toHaveTextContent('No round cards are linked to this entry, so the board has its total only.');
    expect(panel).toHaveTextContent('LeadLeads by 2 shots');
  });

  it('marks a missed round on a closed qualifier as not played', () => {
    feed([feedEntry('Cole Bennett', 1, 71, -1), feedEntry('Mason Rivers', 2, 144, 0)], 'completed');
    const { table } = renderBoard({
      numRounds: 2,
      selectionSlotsTotal: 0,
      selectionSlotsCoachPick: 0,
      roundsByPlayer: new Map([['cole-bennett', [{ roundNumber: 1, score: 71, toPar: -1, roundId: 'r1' }]]]),
    });
    expect(openPanel(table, 'Cole Bennett')).toHaveTextContent('R2Not played');
  });
});
