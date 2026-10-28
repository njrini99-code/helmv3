/**
 * One qualifier order for every surface (owner, 2026-10-28: "the server decides qualifier tie order once, and both
 * Clubhouse and Fairway use it").
 *
 * The order is decided by one function, ranking.ts `rankStandings` (the board's rule: a card a round short below
 * every full card, then to par, strokes, more rounds, name). This checks that each surface places with it, and that
 * over many generated fields they come out identical: the order, the rank, the position and the ties.
 *   - Clubhouse's board: screens/qualifiers/model.ts buildBoard (run on the server by data/qualifiers.ts).
 *   - The selection workspace both Clubhouse and Fairway confirm from: loader.ts rankCandidates.
 *   - Fairway's live leaderboard: qualifier-display.ts deriveStandings.
 * It lives beside the Fairway code because Clubhouse code may not import Fairway (eslint `no-restricted-imports`).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coachhelm/v3/qualifying/ranking', async (orig) => {
  const real = await orig<typeof import('@/lib/coachhelm/v3/qualifying/ranking')>();
  return { ...real, rankStandings: vi.fn(real.rankStandings) };
});

import { rankStandings } from '@/lib/coachhelm/v3/qualifying/ranking';
import { rankCandidates } from '@/lib/coachhelm/v3/qualifying/loader';
import { buildBoard, type ChQRound } from '@/clubhouse/screens/qualifiers/model';
import { deriveStandings } from '../qualifier-display';

type Card = { id: string; rounds: Array<[total: number, toPar: number]> };
/** Order, then position with its T, per scored player. */
type Placed = Array<[id: string, label: string]>;

const sum = (c: Card, i: 0 | 1) => c.rounds.reduce((s, r) => s + r[i], 0);

function clubhouse(cards: Card[]): Placed {
  const board = buildBoard({
    entrants: cards.map((c) => ({ playerId: c.id, name: c.id, classYear: null })),
    rounds: cards.flatMap((c) =>
      c.rounds.map(([total, toPar], i): ChQRound => ({ id: `${c.id}-${i}`, playerId: c.id, number: i + 1, total, toPar, date: '2026-10-02', course: null, holesPlayed: 18 })),
    ),
    squad: 2,
    picks: 0,
    status: 'completed',
    selectionState: 'closed',
    selections: null,
  });
  return board.rows.map((r) => [r.playerId, `${r.tied ? 'T' : ''}${r.position}`]);
}

function workspace(cards: Card[]): Placed {
  return rankCandidates(
    cards.map((c) => ({
      player_id: c.id,
      player_first_name: c.id,
      player_last_name: '',
      rounds_completed: c.rounds.length,
      total_score: c.rounds.length ? sum(c, 0) : null,
      total_to_par: c.rounds.length ? sum(c, 1) : null,
    })),
  )
    .filter((r) => r.leaderboard_rank != null)
    .map((r) => [r.player_id, `${r.leaderboard_tied ? 'T' : ''}${r.leaderboard_position}`]);
}

function fairway(cards: Card[]): Placed {
  return deriveStandings(
    cards.map((c) => ({
      player_id: c.id,
      player_name: c.id,
      rounds_completed: c.rounds.length,
      total_score: c.rounds.length ? sum(c, 0) : null,
      total_to_par: c.rounds.length ? sum(c, 1) : null,
    })),
  )
    .filter((s) => s.hasScore)
    .map((s) => [s.playerId, `${s.tied ? 'T' : ''}${s.position}`]);
}

/** A deterministic generator: short cards, ties inside and across the groups, in shuffled entry order. */
function* fields(): Generator<Card[]> {
  let seed = 11;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let k = 0; k < 300; k++) {
    const numRounds = 1 + next(3);
    const players = 2 + next(8);
    const cards: Card[] = [];
    for (let p = 0; p < players; p++) {
      const played = next(numRounds + 1);
      cards.push({ id: `p${next(1000)}-${p}`, rounds: Array.from({ length: played }, () => { const toPar = next(4) - 1; return [72 + toPar, toPar] as [number, number]; }) });
    }
    yield cards;
  }
}

describe('one qualifier order: Clubhouse and Fairway place with the same function', () => {
  it('the Clubhouse board, the selection workspace and Fairway’s leaderboard each call rankStandings', () => {
    const cards: Card[] = [{ id: 'a', rounds: [[72, 0]] }, { id: 'b', rounds: [[70, -2]] }];
    for (const surface of [clubhouse, workspace, fairway]) {
      vi.mocked(rankStandings).mockClear();
      surface(cards);
      expect(vi.mocked(rankStandings)).toHaveBeenCalled();
    }
  });

  it('a short card with the best to par ranks last on all three, below the full cards', () => {
    const cards: Card[] = [
      { id: 'short', rounds: [[70, -2]] },
      { id: 'b', rounds: [[73, 1], [73, 1]] },
      { id: 'a', rounds: [[72, 0], [72, 0]] },
    ];
    const expected: Placed = [['a', '1'], ['b', '2'], ['short', '3']];
    expect(clubhouse(cards)).toEqual(expected);
    expect(workspace(cards)).toEqual(expected);
    expect(fairway(cards)).toEqual(expected);
  });

  it('level full cards share a position on all three, in the same row order', () => {
    const cards: Card[] = [
      { id: 'zed', rounds: [[73, 1], [73, 1]] },
      { id: 'amy', rounds: [[73, 1], [73, 1]] },
      { id: 'lead', rounds: [[70, -2], [70, -2]] },
    ];
    const expected: Placed = [['lead', '1'], ['amy', 'T2'], ['zed', 'T2']];
    expect(clubhouse(cards)).toEqual(expected);
    expect(workspace(cards)).toEqual(expected);
    expect(fairway(cards)).toEqual(expected);
  });

  it('agree on order, positions and ties over 300 generated fields', () => {
    let shortSeen = 0;
    let tiesSeen = 0;
    for (const cards of fields()) {
      const c = clubhouse(cards);
      expect(workspace(cards)).toEqual(c);
      expect(fairway(cards)).toEqual(c);
      const most = Math.max(...cards.map((x) => x.rounds.length));
      shortSeen += cards.filter((x) => x.rounds.length > 0 && x.rounds.length < most).length;
      tiesSeen += c.filter(([, label]) => label.startsWith('T')).length;
    }
    // The generator exercises both rules.
    expect(shortSeen).toBeGreaterThan(10);
    expect(tiesSeen).toBeGreaterThan(10);
  });
});
