/**
 * Qualifier standings: production against Clubhouse, over identical rows (P009 parity, 2026-10-17).
 *
 * Three real pipelines read the same fake database (standings-parity-harness.tsx):
 *   F  Fairway's live leaderboard (FairwayQualifierLeaderboard + useQualifierRealtime), what production shows;
 *   W  the selection workspace (loadQualifyingWorkspace), what production's confirm commits;
 *   C  Clubhouse's board (loadQualifierDetail).
 *
 * C must equal W on which rounds count, totals, to par, order and cut membership. Where C keeps a rule F breaks, the
 * divergence is asserted outright, so a change to either side shows up here. The decisions are in
 * docs/clubhouse/pages/P009-qualifiers/WIRING.md, "Standings parity".
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('./standings-parity-db');
  return { createClient: async () => h.parityClient() };
});
vi.mock('@/lib/supabase/client', async () => {
  const h = await import('./standings-parity-db');
  return { createClient: () => h.parityClient() };
});
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: <C,>(c: C) => c }));
vi.mock('@/clubhouse/lib/track-server', () => ({ chLogServer: vi.fn() }));

import { formatToPar as clubhouseToPar } from '@/clubhouse/lib/format';
import { formatToPar } from '@/lib/golf/format-to-par';
import { getQualifierAutomaticTransition } from '@/lib/golf/qualifier-lifecycle';
import { parseStatus } from '@/clubhouse/screens/qualifiers/model';
import {
  byId,
  rankedOrder,
  runClubhouse,
  runFairway,
  runWorkspace,
  tieGroups,
  type ParityEntry,
  type ParityFixture,
  type ParityQualifier,
  type ParityRound,
  type Standing,
} from './standings-parity-harness';

const Q = 'a0000000-0000-4000-8000-000000000001';

const qualifier = (o: Partial<ParityQualifier> = {}): ParityQualifier => ({
  id: Q,
  team_id: 't1',
  status: 'in_progress',
  is_test: false,
  num_rounds: 2,
  start_date: '2026-10-01',
  end_date: '2026-10-03',
  selection_state: 'open',
  selection_slots_total: 3,
  selection_slots_coach_pick: 0,
  ...o,
});

let seq = 0;
/** A completed, non-test, 18-hole round linked to the qualifier, dated inside its window. */
const rd = (player_id: string, n: number | null, total: number | null, toPar: number | null, o: Partial<ParityRound> = {}): ParityRound => ({
  id: `r${(seq++).toString().padStart(4, '0')}`,
  player_id,
  qualifier_id: Q,
  status: 'completed',
  is_test: false,
  round_type: 'qualifier',
  qualifier_round_number: n,
  total_score: total,
  score_to_par: toPar,
  holes_played: 18,
  round_date: '2026-10-02',
  ...o,
});
const entrants = (...ids: string[]): ParityEntry[] => ids.map((player_id) => ({ player_id }));

const all = async (fx: ParityFixture) => {
  const [F, W, C] = [await runFairway(fx), await runWorkspace(fx), await runClubhouse(fx)];
  if (!W || !C) throw new Error('a pipeline did not load');
  return { F, W, C };
};

/** The fields two pipelines must agree on, per player. */
const pick = (rows: Standing[], fields: Array<keyof Standing>) =>
  Object.fromEntries([...rows].sort((a, b) => a.playerId.localeCompare(b.playerId)).map((r) => [r.playerId, Object.fromEntries(fields.map((f) => [f, r[f]]))]));
const SCORE: Array<keyof Standing> = ['scored', 'played', 'total', 'toPar'];

describe('Standings parity: which rounds count', () => {
  it('a non-entrant, a removed entrant, an in-progress round and an unlinked qualifier-type round count nowhere; a linked round outside the dates counts everywhere', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier(),
      entries: entrants('a', 'b'),
      rounds: [
        rd('a', 1, 72, 0),
        // Linked by qualifier_id, played the week before the window: the link decides, never the date.
        rd('a', 2, 70, -2, { round_date: '2026-09-20' }),
        rd('b', 1, 75, 3),
        // In progress (no total yet, or a running one): not counted until it is signed.
        rd('b', 2, 40, 4, { status: 'in_progress', holes_played: 9 }),
        // Inside the window and tagged a qualifier round, but not linked to this qualifier.
        rd('b', null, 66, -6, { qualifier_id: null }),
        // A player who never entered, and one whose entry was removed after a round: neither is on the board.
        rd('x', 1, 64, -8),
        rd('removed', 1, 65, -7),
      ],
    };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual({
      a: { scored: true, played: 2, total: 142, toPar: -2 },
      b: { scored: true, played: 1, total: 75, toPar: 3 },
    });
    expect(pick(W, SCORE)).toEqual(pick(C, SCORE));
    expect(pick(F, SCORE)).toEqual(pick(C, SCORE));
    expect(C.map((r) => r.playerId)).toEqual(['a', 'b']);
  });

  it('a test round counts in neither Clubhouse nor the workspace; Fairway counts it (production is wrong, kept)', async () => {
    const fx: ParityFixture = { qualifier: qualifier(), entries: entrants('a', 'b'), rounds: [rd('a', 1, 74, 2), rd('a', 2, 66, -6, { is_test: true }), rd('b', 1, 72, 0)] };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(byId(C, 'a')).toMatchObject({ played: 1, total: 74, toPar: 2, order: 1 });
    // Fairway: the test round's 66 lifts "a" to the lead.
    expect(byId(F, 'a')).toMatchObject({ played: 2, total: 140, toPar: -4, order: 0 });
  });

  it('a completed round without a total is unknown: Clubhouse and the workspace leave it out; Fairway counts it as a played round of 0 strokes', async () => {
    const fx: ParityFixture = { qualifier: qualifier(), entries: entrants('a'), rounds: [rd('a', 1, 72, 0), rd('a', 2, null, null)] };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(byId(C, 'a')).toMatchObject({ played: 1, total: 72 });
    expect(byId(F, 'a')).toMatchObject({ played: 2, total: 72, avg: '36.0' });
  });

  it('a round with no stored round number counts beside a numbered round 1, as the workspace counts it (fixed 2026-10-17)', async () => {
    const fx: ParityFixture = { qualifier: qualifier(), entries: entrants('a'), rounds: [rd('a', 1, 72, 0), rd('a', null, 75, 3)] };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(byId(C, 'a')).toMatchObject({ played: 2, total: 147, toPar: 3 });
    expect(pick(F, SCORE)).toEqual(pick(C, SCORE));
  });

  it('a second completed round in one numbered slot counts once in Clubhouse and the workspace (the first by id); Fairway adds both', async () => {
    // The database refuses this (golf_rounds_qualifier_player_round_number_uq); it is held here so the rule cannot drift.
    const fx: ParityFixture = { qualifier: qualifier(), entries: entrants('a'), rounds: [rd('a', 1, 72, 0), rd('a', 1, 80, 8)] };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(byId(C, 'a')).toMatchObject({ played: 1, total: 72 });
    expect(byId(F, 'a')).toMatchObject({ played: 2, total: 152 });
  });

  it('a player with no completed round is unscored in Clubhouse and the workspace, whatever the stored aggregate says; Fairway falls back to it', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier(),
      entries: [{ player_id: 'a' }, { player_id: 'stale', rounds_completed: 2, total_score: 140, total_to_par: -4 }],
      rounds: [rd('a', 1, 72, 0)],
    };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(byId(C, 'stale').scored).toBe(false);
    expect(byId(F, 'stale')).toMatchObject({ scored: true, played: 2, total: 140, toPar: -4, order: 0 });
  });
});

describe('Standings parity: the score', () => {
  it('ranks on cumulative to par, not strokes, across courses of different par; totals are summed strokes', async () => {
    // a: 74 on a par 72 (+2). b: 73 on a par 70 (+3). Fewer strokes, worse to par: b is second everywhere.
    const fx: ParityFixture = { qualifier: qualifier({ num_rounds: 1 }), entries: entrants('a', 'b'), rounds: [rd('a', 1, 74, 2), rd('b', 1, 73, 3)] };
    const { F, W, C } = await all(fx);
    expect(rankedOrder(C)).toEqual([['a'], ['b']]);
    expect(rankedOrder(W)).toEqual(rankedOrder(C));
    expect(rankedOrder(F)).toEqual(rankedOrder(C));
    expect(pick(F, SCORE)).toEqual(pick(C, SCORE));
  });

  it('a player with fewer rounds is ranked on what is in, not excluded or averaged; level players order by more rounds in Clubhouse and the workspace', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 3 }),
      entries: entrants('a', 'b', 'c'),
      rounds: [rd('a', 1, 72, 0), rd('a', 2, 72, 0), rd('b', 1, 70, -2), rd('c', 1, 71, -1), rd('c', 2, 73, 1)],
    };
    const { F, W, C } = await all(fx);
    // b (one round, −2) leads a and c (two rounds, E). a and c are level on to par and strokes: a tie.
    expect(rankedOrder(C)).toEqual([['b'], ['a', 'c']]);
    expect(rankedOrder(W)).toEqual(rankedOrder(C));
    expect(rankedOrder(F)).toEqual(rankedOrder(C));
    expect(pick(F, SCORE)).toEqual(pick(C, SCORE));
  });

  it('a 9-hole round adds its strokes and to par everywhere; Clubhouse averages 18-hole rounds only, Fairway averages every round (Clubhouse kept)', async () => {
    const fx: ParityFixture = { qualifier: qualifier(), entries: entrants('a'), rounds: [rd('a', 1, 72, 0), rd('a', 2, 37, 1, { holes_played: 9 })] };
    const { F, W, C } = await all(fx);
    expect(pick(C, SCORE)).toEqual(pick(W, SCORE));
    expect(pick(F, SCORE)).toEqual(pick(C, SCORE));
    expect(byId(C, 'a')).toMatchObject({ total: 109, toPar: 1, avg: '72.0' });
    expect(byId(F, 'a').avg).toBe('54.5');
  });

  it('draws to par alike: Clubhouse uses production’s formatter (E, a true minus, a plus)', () => {
    expect(clubhouseToPar).toBe(formatToPar);
    expect([formatToPar(0), formatToPar(-3), formatToPar(4), formatToPar(null)]).toEqual(['E', '−3', '+4', '—']);
  });
});

describe('Standings parity: ties and the cut', () => {
  it('a tie across the last place on score: Clubhouse and the workspace both say "tie" for the level players; Fairway numbers them 3, T4 and puts one in', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 1, selection_slots_total: 3, selection_slots_coach_pick: 0 }),
      entries: entrants('a', 'b', 'c', 'd', 'e'),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 72, 0), rd('c', 1, 73, 1), rd('d', 1, 73, 1), rd('e', 1, 76, 4)],
    };
    const { F, W, C } = await all(fx);
    expect(rankedOrder(C)).toEqual([['a'], ['b'], ['c', 'd'], ['e']]);
    expect(rankedOrder(W)).toEqual(rankedOrder(C));
    expect(rankedOrder(F)).toEqual(rankedOrder(C));
    expect(pick(C, ['cut'])).toEqual(pick(W, ['cut']));
    expect(pick(C, ['label', 'cut'])).toEqual({
      a: { label: '1', cut: 'in' },
      b: { label: '2', cut: 'in' },
      c: { label: 'T3', cut: 'tie' },
      d: { label: 'T3', cut: 'tie' },
      e: { label: '5', cut: 'out' },
    });
    expect(tieGroups(C)).toEqual([['a'], ['b'], ['c', 'd'], ['e']]);
    // Fairway (production): positions count up through a tie and only the second row carries the T; the cut puts the
    // first of the level pair in by stored order.
    expect(F.filter((r) => r.scored).map((r) => r.label)).toEqual(['1', '2', '3', 'T4', '5']);
    expect(F.filter((r) => r.scored).map((r) => r.cut)).toEqual(['in', 'in', 'in', 'out', 'out']);
  });

  it('a tie away from the cut shares a position in Clubhouse (T2, T2, 4); Fairway draws 2, T3, 4', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 1, selection_slots_total: 4 }),
      entries: entrants('a', 'b', 'c', 'd'),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 72, 0), rd('c', 1, 72, 0), rd('d', 1, 74, 2)],
    };
    const { F, W, C } = await all(fx);
    expect(C.filter((r) => r.scored).map((r) => r.label)).toEqual(['1', 'T2', 'T2', '4']);
    expect(pick(C, ['cut'])).toEqual(pick(W, ['cut']));
    expect(rankedOrder(F)).toEqual(rankedOrder(C));
    expect(F.filter((r) => r.scored).map((r) => r.label)).toEqual(['1', '2', 'T3', '4']);
  });

  it('level on to par but not strokes is not a tie in Clubhouse or the workspace; Fairway marks it T', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 2, selection_slots_total: 4 }),
      entries: entrants('a', 'b'),
      // Both E; a in 142 strokes (two par-71s), b in 144 (two par-72s).
      rounds: [rd('a', 1, 71, 0), rd('a', 2, 71, 0), rd('b', 1, 72, 0), rd('b', 2, 72, 0)],
    };
    const { F, W, C } = await all(fx);
    expect(rankedOrder(C)).toEqual([['a'], ['b']]);
    expect(rankedOrder(W)).toEqual(rankedOrder(C));
    expect(C.map((r) => r.label)).toEqual(['1', '2']);
    expect(F.map((r) => r.label)).toEqual(['1', 'T2']);
  });

  it('the Bubble is inside the squad, below the places on score, in Clubhouse and Fairway; the player after the travel cut is out', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 1, selection_slots_total: 5, selection_slots_coach_pick: 2 }),
      entries: entrants('a', 'b', 'c', 'd', 'e', 'f'),
      rounds: ['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => rd(p, 1, 70 + i, -2 + i)),
    };
    const { F, W, C } = await all(fx);
    expect(C.map((r) => r.cut)).toEqual(['in', 'in', 'in', 'bubble', 'bubble', 'out']);
    expect(pick(F, ['label', 'cut'])).toEqual(pick(C, ['label', 'cut']));
    // The workspace has no Bubble: below the places on score is "not on score".
    expect(pick(W, ['cut'])).toEqual(pick(C.map((r) => ({ ...r, cut: r.cut === 'bubble' ? 'out' : r.cut })), ['cut']));
  });

  it('a coach’s pick saved before confirm: the workspace moves the next player onto score; the boards (Clubhouse and Fairway) stay the standings until confirm', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 1, selection_state: 'scoring', selection_slots_total: 3, selection_slots_coach_pick: 1 }),
      entries: entrants('a', 'b', 'c', 'd'),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 72, 0), rd('c', 1, 73, 1), rd('d', 1, 75, 3)],
      selections: [{ player_id: 'a', selection_type: 'coach_pick' }],
    };
    const { F, W, C } = await all(fx);
    expect(pick(C, ['cut'])).toEqual({ a: { cut: 'in' }, b: { cut: 'in' }, c: { cut: 'bubble' }, d: { cut: 'out' } });
    expect(pick(F, ['cut'])).toEqual(pick(C, ['cut']));
    // The workspace (Manage selections, and what confirm will write): "a" keeps the pick, so "c" takes the second place on score.
    expect(pick(W, ['cut'])).toEqual({ a: { cut: 'out' }, b: { cut: 'in' }, c: { cut: 'in' }, d: { cut: 'out' } });
    expect(rankedOrder(W)).toEqual(rankedOrder(C));
  });

  it('a confirmed squad is the selections in all three, whatever the standings say', async () => {
    const fx: ParityFixture = {
      qualifier: qualifier({ num_rounds: 1, status: 'completed', selection_state: 'selected', selection_slots_total: 2, selection_slots_coach_pick: 1 }),
      entries: entrants('a', 'b', 'c'),
      rounds: [rd('a', 1, 70, -2), rd('b', 1, 72, 0), rd('c', 1, 74, 2)],
      selections: [
        { player_id: 'a', selection_type: 'top_score' },
        { player_id: 'c', selection_type: 'coach_pick' },
      ],
    };
    const { F, W, C } = await all(fx);
    expect(pick(C, ['cut'])).toEqual({ a: { cut: 'in' }, b: { cut: 'out' }, c: { cut: 'in' } });
    expect(pick(W, ['cut'])).toEqual(pick(C, ['cut']));
    expect(pick(F, ['cut'])).toEqual(pick(C, ['cut']));
  });

  it('a test qualifier: Clubhouse does not show it; the workspace and Fairway’s board still read it', async () => {
    const fx: ParityFixture = { qualifier: qualifier({ is_test: true }), entries: entrants('a'), rounds: [rd('a', 1, 72, 0, { is_test: true })] };
    expect(await runClubhouse(fx)).toBeNull();
    expect(byId((await runWorkspace(fx))!, 'a').scored).toBe(false);
    expect(byId(await runFairway(fx), 'a').scored).toBe(true);
  });
});

describe('Standings parity: lifecycle', () => {
  it('the stored status is the lifecycle in both: only the first round moves upcoming to live, nothing closes a qualifier but the coach', () => {
    expect(['upcoming', 'in_progress', 'completed'].map(parseStatus)).toEqual(['upcoming', 'in_progress', 'completed']);
    expect([getQualifierAutomaticTransition('upcoming'), getQualifierAutomaticTransition('in_progress'), getQualifierAutomaticTransition('completed')]).toEqual([
      'in_progress',
      null,
      null,
    ]);
  });
});
