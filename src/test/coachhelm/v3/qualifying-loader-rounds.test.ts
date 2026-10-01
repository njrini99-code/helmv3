/**
 * Swap audit §11 (2026-10-01): the selection workspace ranked from each entry's
 * stored aggregate, which was found stale on a live qualifier (3 rounds played,
 * 2 stored), while the leaderboard ranked from the rounds. The workspace, and the
 * confirm that reads it, now rank from the same rounds as the leaderboard.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/golf/qualifier-selection-reasons', () => ({
  readQualifierSelectionReasons: async () => ({ reasons: new Map() }),
}));

const { loadQualifyingWorkspace } = await import('@/lib/coachhelm/v3/qualifying/loader');

type Row = Record<string, unknown>;

/** A chainable stand-in for the three reads the loader makes; `rounds` may be an error. */
function fakeSupabase(opts: { entries: Row[]; rounds: Row[] | { error: string } }) {
  const qualifier = {
    id: 'q1',
    team_id: 't1',
    name: 'Fall',
    start_date: null,
    end_date: null,
    status: 'in_progress',
    selection_state: 'open',
    selection_slots_total: 2,
    selection_slots_coach_pick: 0,
    target_tournament_id: null,
    entries: opts.entries,
  };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'eq', 'order']) q[m] = chain;
    q.maybeSingle = async () => ({ data: table === 'golf_qualifiers' ? qualifier : null, error: null });
    q.range = async () =>
      'error' in (opts.rounds as object)
        ? { data: null, error: { message: (opts.rounds as { error: string }).error } }
        : { data: opts.rounds, error: null };
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return q;
  };
  return { from } as never;
}

const entry = (id: string, first: string, stale: { n: number; total: number; toPar: number }) => ({
  player_id: id,
  // The stored aggregate is what used to be ranked; it is no longer read.
  rounds_completed: stale.n,
  total_score: stale.total,
  total_to_par: stale.toPar,
  player: { id, first_name: first, last_name: 'X' },
});

describe('loadQualifyingWorkspace ranks from the rounds (swap audit §11)', () => {
  it('a third round the stored aggregate missed counts', async () => {
    const ws = await loadQualifyingWorkspace(
      fakeSupabase({
        entries: [entry('a', 'Ann', { n: 2, total: 154, toPar: 10 }), entry('b', 'Ben', { n: 3, total: 228, toPar: 12 })],
        rounds: [
          { player_id: 'a', total_score: 74, score_to_par: 2 },
          { player_id: 'a', total_score: 76, score_to_par: 4 },
          { player_id: 'a', total_score: 80, score_to_par: 8 },
          { player_id: 'b', total_score: 75, score_to_par: 3 },
          { player_id: 'b', total_score: 76, score_to_par: 4 },
          { player_id: 'b', total_score: 77, score_to_par: 5 },
        ],
      }),
      'q1',
    );
    const a = ws!.candidates.find((c) => c.player_id === 'a')!;
    expect(a).toMatchObject({ rounds_completed: 3, total_score: 230, total_to_par: 14 });
    // On the stale aggregate Ann (+10) led Ben (+12); on the rounds Ben (+12) leads Ann (+14).
    expect(ws!.candidates.filter((c) => c.leaderboard_rank != null).sort((x, y) => x.leaderboard_rank! - y.leaderboard_rank!).map((c) => c.player_id)).toEqual(['b', 'a']);
  });

  it('a player with no scored round is unranked, whatever the stored aggregate says; a round without a total does not count', async () => {
    const ws = await loadQualifyingWorkspace(
      fakeSupabase({
        entries: [entry('a', 'Ann', { n: 1, total: 70, toPar: -2 })],
        rounds: [{ player_id: 'a', total_score: null, score_to_par: null }],
      }),
      'q1',
    );
    expect(ws!.candidates[0]).toMatchObject({ rounds_completed: 0, total_score: null, total_to_par: null, leaderboard_rank: null });
  });

  it('the board rules: a round without a to-par is unknown, and a second round in one slot counts once', async () => {
    const ws = await loadQualifyingWorkspace(
      fakeSupabase({
        entries: [entry('a', 'Ann', { n: 0, total: 0, toPar: 0 })],
        rounds: [
          { player_id: 'a', qualifier_round_number: 1, total_score: 72, score_to_par: 0 },
          { player_id: 'a', qualifier_round_number: 1, total_score: 80, score_to_par: 8 },
          { player_id: 'a', qualifier_round_number: 2, total_score: 74, score_to_par: null },
        ],
      }),
      'q1',
    );
    expect(ws!.candidates[0]).toMatchObject({ rounds_completed: 1, total_score: 72, total_to_par: 0 });
  });

  it('a failed rounds read is a failed load, not a board of unscored players', async () => {
    const ws = await loadQualifyingWorkspace(fakeSupabase({ entries: [entry('a', 'Ann', { n: 1, total: 70, toPar: -2 })], rounds: { error: 'boom' } }), 'q1');
    expect(ws).toBeNull();
  });
});
