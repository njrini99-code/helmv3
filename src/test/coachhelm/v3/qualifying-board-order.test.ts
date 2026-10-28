/**
 * Confirm squad follows the board (owner decision A: "Match the board"; wiring review 2026-10-27, item 2).
 *
 * The Clubhouse qualifier board and "You vs the line" rank a card a round short below every full card (owner decision
 * 10, src/clubhouse/screens/qualifiers/model.ts). Manage selections and Confirm squad ranked by score alone
 * (loader.ts rankCandidates), so Confirm could hand a place to a player the board showed outside the line. Clubhouse now
 * reads the workspace in the board's order (`order: 'board'`), ranked by the same function the board sorts with
 * (ranking.ts boardOrder). Fairway's workspace keeps the plain order (no `order`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { buildBoard, type ChQRound } from '@/clubhouse/screens/qualifiers/model';

vi.mock('@/lib/golf/qualifier-selection-reasons', () => ({
  readQualifierSelectionReasons: async () => ({ reasons: new Map(), error: null }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerException: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/qualifying/player-notify', () => ({ notifyPlayersOfSelectionOutcome: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/qualifying/chat-push', () => ({ pushTravelBriefToChat: vi.fn(async () => {}) }));
vi.mock('server-only', () => ({}));
vi.mock('@/clubhouse/lib/track-server', () => ({ chLogServer: vi.fn() }));
// Manage selections' own read (the qualifier's team) goes through the same fixture client.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => readClient() }));

/** The rounds and entrants the loader reads, set per test; the loader is the real one, reading through `readClient`. */
const reads = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>>, rounds: [] as Array<Record<string, unknown>>, slotsTotal: 2 }));

function readClient() {
  const qualifier = () => ({
    id: 'q1',
    team_id: 't1',
    name: 'Fall Qualifier',
    start_date: '2026-10-01',
    end_date: null,
    status: 'completed',
    selection_state: 'closed',
    selection_slots_total: reads.slotsTotal,
    selection_slots_coach_pick: 0,
    target_tournament_id: null,
    entries: reads.entries,
  });
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: table === 'golf_qualifiers' ? qualifier() : null, error: null });
    q.range = async () => ({ data: reads.rounds, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return q;
  };
  return { from } as never;
}

vi.mock('@/lib/coachhelm/v3/qualifying/loader', async (orig) => {
  const real = await orig<typeof import('@/lib/coachhelm/v3/qualifying/loader')>();
  return {
    ...real,
    // The real loader, reading the fixture; confirm's writes go to the client the test passes.
    loadQualifyingWorkspace: vi.fn((_sb: unknown, id: string, opts?: Parameters<typeof real.loadQualifyingWorkspace>[2]) =>
      real.loadQualifyingWorkspace(readClient(), id, opts),
    ),
  };
});

import { assignScoreSlots, loadQualifyingWorkspace, rankCandidates } from '@/lib/coachhelm/v3/qualifying/loader';
import { confirmSelection } from '@/lib/coachhelm/v3/qualifying/service';
import { loadQualifierSelection } from '@/clubhouse/data/qualifiers';

/** One player's rounds: a total and a to-par per slot, 18 holes each. */
type Card = { id: string; rounds: Array<[total: number, toPar: number]> };

const rankInput = (cards: Card[]) =>
  cards.map((c) => ({
    player_id: c.id,
    player_first_name: c.id,
    player_last_name: '',
    rounds_completed: c.rounds.length,
    total_score: c.rounds.length ? c.rounds.reduce((s, r) => s + r[0], 0) : null,
    total_to_par: c.rounds.length ? c.rounds.reduce((s, r) => s + r[1], 0) : null,
  }));

const boardOf = (cards: Card[], squad: number, numRounds: number) =>
  buildBoard({
    entrants: cards.map((c) => ({ playerId: c.id, name: c.id, classYear: null })),
    rounds: cards.flatMap((c) =>
      c.rounds.map(([total, toPar], i): ChQRound => ({ id: `${c.id}-${i}`, playerId: c.id, number: i + 1, total, toPar, date: '2026-10-02', course: null, holesPlayed: 18 })),
    ),
    squad,
    picks: 0,
    status: 'completed',
    selectionState: 'closed',
    selections: null,
    numRounds,
  });

const scoredIds = (ranked: ReturnType<typeof rankCandidates>) => ranked.filter((r) => r.leaderboard_rank != null).map((r) => r.player_id);

// a, c, d: both rounds in. b: one round of two, with the best total to par (−2) and the fewest strokes.
const SHORT_LEADS: Card[] = [
  { id: 'a', rounds: [[72, 0], [72, 0]] },
  { id: 'b', rounds: [[70, -2]] },
  { id: 'c', rounds: [[73, 1], [73, 1]] },
  { id: 'd', rounds: [[75, 3], [75, 3]] },
];

describe('rankCandidates / assignScoreSlots in the board’s order', () => {
  it('a short card with a lower total ranks below every full card, and is outside the places on score', () => {
    const ranked = rankCandidates(rankInput(SHORT_LEADS), 'board');
    expect(scoredIds(ranked)).toEqual(['a', 'c', 'd', 'b']);
    expect(ranked.find((r) => r.player_id === 'b')?.leaderboard_rank).toBe(4);
    const slots = assignScoreSlots(ranked, new Map(), 2, 'board');
    expect(slots.filter((c) => c.is_top_score_slot).map((c) => c.player_id)).toEqual(['a', 'c']);
  });

  it('without an order (Fairway) the plain order is unchanged: the short card leads on score', () => {
    const ranked = rankCandidates(rankInput(SHORT_LEADS));
    expect(scoredIds(ranked)).toEqual(['b', 'a', 'c', 'd']);
    expect(assignScoreSlots(ranked, new Map(), 2).filter((c) => c.is_top_score_slot).map((c) => c.player_id)).toEqual(['b', 'a']);
  });

  it('a full and a short card level on to par and strokes at the line are not a tie in the board’s order (they are in the plain one)', () => {
    const cards: Card[] = [
      { id: 'a', rounds: [[72, 0], [72, 0]] },
      { id: 'b', rounds: [[148, 4]] },
      { id: 'c', rounds: [[74, 2], [74, 2]] },
    ];
    const board = assignScoreSlots(rankCandidates(rankInput(cards), 'board'), new Map(), 2, 'board');
    expect(board.some((c) => c.tied_at_cut)).toBe(false);
    expect(board.filter((c) => c.is_top_score_slot).map((c) => c.player_id)).toEqual(['a', 'c']);
    const plain = assignScoreSlots(rankCandidates(rankInput(cards)), new Map(), 2);
    expect(plain.filter((c) => c.tied_at_cut).map((c) => c.player_id).sort()).toEqual(['b', 'c']);
  });

  /** A small deterministic generator: many boards with short cards, ties inside and across the groups, and the cut. */
  function* boards(): Generator<{ cards: Card[]; squad: number; numRounds: number }> {
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let k = 0; k < 300; k++) {
      const numRounds = 1 + next(3);
      const players = 2 + next(7);
      const cards: Card[] = [];
      for (let p = 0; p < players; p++) {
        const played = next(numRounds + 1);
        // Few distinct scores, so level cards (ties) are common.
        cards.push({ id: `p${p}`, rounds: Array.from({ length: played }, () => { const toPar = next(4) - 1; return [72 + toPar, toPar] as [number, number]; }) });
      }
      yield { cards, squad: 1 + next(players), numRounds };
    }
  }

  it('matches the board for the same entries: the order, the places on score and the tie at the cut (300 boards)', () => {
    let shortCardsSeen = 0;
    for (const { cards, squad, numRounds } of boards()) {
      const board = boardOf(cards, squad, numRounds);
      const ranked = rankCandidates(rankInput(cards), 'board');
      expect(scoredIds(ranked)).toEqual(board.rows.map((r) => r.playerId));
      const slots = assignScoreSlots(ranked, new Map(), board.topScore, 'board');
      const byId = new Map(slots.map((c) => [c.player_id, c]));
      for (const row of board.rows) {
        const c = byId.get(row.playerId)!;
        expect({ id: row.playerId, tie: !!c.tied_at_cut }).toEqual({ id: row.playerId, tie: row.state === 'tie' });
        if (row.state !== 'tie') expect({ id: row.playerId, in: c.is_top_score_slot }).toEqual({ id: row.playerId, in: row.state === 'qualified' });
      }
      shortCardsSeen += board.rows.filter((r) => r.missed).length;
    }
    // The generator does exercise the rule.
    expect(shortCardsSeen).toBeGreaterThan(50);
  });
});

describe('Manage selections and Confirm squad in the board’s order', () => {
  beforeEach(() => {
    vi.mocked(loadQualifyingWorkspace).mockClear();
    reads.slotsTotal = 2;
    reads.entries = SHORT_LEADS.map((c) => ({ player_id: c.id, player: { id: c.id, first_name: c.id, last_name: '' } }));
    reads.rounds = SHORT_LEADS.flatMap((c) =>
      c.rounds.map(([total, toPar], i) => ({ player_id: c.id, qualifier_round_number: i + 1, total_score: total, score_to_par: toPar })),
    );
  });

  const writeClient = () =>
    createFakeSupabase({
      tables: {
        golf_qualifier_selections: [],
        golf_qualifiers: [{ id: 'q1', team_id: 't1', selection_state: 'closed' }],
        golf_team_coach_staff: [],
      },
    });

  it('writes the squad the board showed above the line: the short card with the lower total is left out', async () => {
    const sb = writeClient();
    const r = await confirmSelection(sb as never, { qualifier_id: 'q1', user_id: 'coach-user', order: 'board' });
    expect(r.ok).toBe(true);
    const written = await sb.from('golf_qualifier_selections').select('player_id, selection_type');
    expect((written.data as Array<{ player_id: string }>).map((s) => s.player_id).sort()).toEqual(['a', 'c']);
    // The board, from the same rounds, puts the same two above the line.
    expect(boardOf(SHORT_LEADS, 2, 2).rows.filter((x) => x.state === 'qualified').map((x) => x.playerId)).toEqual(['a', 'c']);
    // Every read in the confirm (the squad and the re-read for the brief) used the board's order.
    expect(vi.mocked(loadQualifyingWorkspace).mock.calls.map((c) => c[2])).toEqual([{ order: 'board' }, { order: 'board' }]);
  });

  it('Manage selections ranks as the board does: the short card last, and outside the places on score', async () => {
    const load = await loadQualifierSelection({ teamId: 't1', qualifierId: 'q1' });
    if (load.kind !== 'ok') throw new Error(`Manage selections did not load: ${load.kind}`);
    const ranked = load.data.candidates.filter((c) => c.rank != null).sort((x, y) => x.rank! - y.rank!);
    const board = boardOf(SHORT_LEADS, 2, 2);
    expect(ranked.map((c) => c.playerId)).toEqual(board.rows.map((r) => r.playerId));
    expect(ranked.map((c) => c.playerId)).toEqual(['a', 'c', 'd', 'b']);
    expect(load.data.candidates.filter((c) => c.onScore).map((c) => c.playerId)).toEqual(['a', 'c']);
    expect(vi.mocked(loadQualifyingWorkspace).mock.calls.map((c) => c[2])).toEqual([{ order: 'board' }]);
  });

  it('without an order (Fairway’s workspace) confirm still writes score order, as before', async () => {
    const sb = writeClient();
    const r = await confirmSelection(sb as never, { qualifier_id: 'q1', user_id: 'coach-user' });
    expect(r.ok).toBe(true);
    const written = await sb.from('golf_qualifier_selections').select('player_id, selection_type');
    expect((written.data as Array<{ player_id: string }>).map((s) => s.player_id).sort()).toEqual(['a', 'b']);
  });
});
