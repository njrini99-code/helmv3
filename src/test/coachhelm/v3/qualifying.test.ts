/**
 * W29-pt2 — qualifying state-machine + loader-rank pure logic tests.
 *
 * Service + actions hit Supabase, so they get exercised at the
 * integration layer (W29-pt3 prod verify). The pure helpers below are
 * the parts most worth unit-covering: they encode the lifecycle and
 * the rank-then-classify ordering decisions.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  nextState,
  classifySlots,
  canConfirmSelection,
  requiredCoachPicks,
  pickableCount,
} from '@/lib/coachhelm/v3/qualifying/state-machine';
import { assignScoreSlots, rankCandidates } from '@/lib/coachhelm/v3/qualifying/loader';
import type { SelectionCandidate } from '@/lib/coachhelm/v3/qualifying/types';

function cand(
  player_id: string,
  rank: number | null,
  is_top_score_slot = false,
): SelectionCandidate {
  return {
    player_id,
    player_first_name: 'F',
    player_last_name: player_id,
    rounds_completed: rank === null ? 0 : 4,
    total_score: rank === null ? null : 280,
    total_to_par: rank === null ? null : rank, // higher rank = worse score for tests
    leaderboard_rank: rank,
    selection: null,
    is_top_score_slot,
  };
}

// ---------------------------------------------------------------------------
// canTransition / nextState
// ---------------------------------------------------------------------------

describe('canTransition', () => {
  it('allows each consecutive forward step', () => {
    expect(canTransition('open', 'scoring')).toBe(true);
    expect(canTransition('scoring', 'closed')).toBe(true);
    expect(canTransition('closed', 'selected')).toBe(true);
  });
  it('rejects skipping ahead', () => {
    expect(canTransition('open', 'closed')).toBe(false);
    expect(canTransition('open', 'selected')).toBe(false);
    expect(canTransition('scoring', 'selected')).toBe(false);
  });
  it('rejects reverse and same-state', () => {
    expect(canTransition('closed', 'scoring')).toBe(false);
    expect(canTransition('selected', 'closed')).toBe(false);
    expect(canTransition('open', 'open')).toBe(false);
  });
});

describe('nextState', () => {
  it('walks the chain in order', () => {
    expect(nextState('open')).toBe('scoring');
    expect(nextState('scoring')).toBe('closed');
    expect(nextState('closed')).toBe('selected');
  });
  it('returns null at the terminal state', () => {
    expect(nextState('selected')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifySlots
// ---------------------------------------------------------------------------

describe('classifySlots', () => {
  it('top_n = total - coach_pick; ranked candidates split accordingly', () => {
    const cands = [
      cand('p1', 1),
      cand('p2', 2),
      cand('p3', 3),
      cand('p4', 4),
      cand('p5', 5),
    ];
    const r = classifySlots(cands, 5, 1);
    expect(r.top_score_locked.map((c) => c.player_id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(r.coach_pick_eligible.map((c) => c.player_id)).toEqual(['p5']);
    expect(r.unranked).toHaveLength(0);
  });

  it('unranked candidates go to unranked bucket', () => {
    const cands = [cand('p1', 1), cand('p2', null), cand('p3', 2)];
    const r = classifySlots(cands, 3, 1);
    expect(r.top_score_locked.map((c) => c.player_id)).toEqual(['p1', 'p3']);
    expect(r.unranked.map((c) => c.player_id)).toEqual(['p2']);
  });

  it('zero coach picks = everyone ranked is auto-locked', () => {
    const cands = [cand('p1', 1), cand('p2', 2), cand('p3', 3)];
    const r = classifySlots(cands, 3, 0);
    expect(r.top_score_locked).toHaveLength(3);
    expect(r.coach_pick_eligible).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// canConfirmSelection
// ---------------------------------------------------------------------------

describe('canConfirmSelection', () => {
  it('refuses when not in closed state', () => {
    expect(
      canConfirmSelection({
        state: 'scoring',
        slots_coach_pick: 1,
        coach_pick_selections: [{ reasoning: 'good vibes' }],
      }),
    ).toBe(false);
  });
  it('refuses when picks count != slots', () => {
    expect(
      canConfirmSelection({
        state: 'closed',
        slots_coach_pick: 2,
        coach_pick_selections: [{ reasoning: 'one only' }],
      }),
    ).toBe(false);
  });
  it('refuses when any pick has empty reasoning', () => {
    expect(
      canConfirmSelection({
        state: 'closed',
        slots_coach_pick: 2,
        coach_pick_selections: [{ reasoning: 'good' }, { reasoning: '   ' }],
      }),
    ).toBe(false);
  });
  it('confirms when all conditions met', () => {
    expect(
      canConfirmSelection({
        state: 'closed',
        slots_coach_pick: 1,
        coach_pick_selections: [{ reasoning: 'leadership' }],
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rankCandidates (loader)
// ---------------------------------------------------------------------------

describe('rankCandidates', () => {
  it('orders by to_par asc, then total_score asc as tiebreak', () => {
    const r = rankCandidates([
      { player_id: 'a', player_first_name: 'A', player_last_name: 'a', rounds_completed: 4, total_score: 290, total_to_par: 2 },
      { player_id: 'b', player_first_name: 'B', player_last_name: 'b', rounds_completed: 4, total_score: 285, total_to_par: 2 },
      { player_id: 'c', player_first_name: 'C', player_last_name: 'c', rounds_completed: 4, total_score: 280, total_to_par: -3 },
    ]);
    expect(r.map((x) => x.player_id)).toEqual(['c', 'b', 'a']);
    expect(r.map((x) => x.leaderboard_rank)).toEqual([1, 2, 3]);
  });

  it('puts unscored players at the end with rank null', () => {
    const r = rankCandidates([
      { player_id: 'a', player_first_name: 'A', player_last_name: 'a', rounds_completed: 0, total_score: null, total_to_par: null },
      { player_id: 'b', player_first_name: 'B', player_last_name: 'b', rounds_completed: 4, total_score: 280, total_to_par: -2 },
    ]);
    expect(r.map((x) => x.player_id)).toEqual(['b', 'a']);
    expect(r.map((x) => x.leaderboard_rank)).toEqual([1, null]);
  });

  it('handles empty input', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Swap audit §11.3: one standings order across the board, workspace and confirm
// ---------------------------------------------------------------------------

describe('one standings order (§11.3)', () => {
  const row = (id: string, first: string, rounds: number, total: number | null, toPar: number | null) => ({
    player_id: id,
    player_first_name: first,
    player_last_name: 'X',
    rounds_completed: rounds,
    total_score: total,
    total_to_par: toPar,
  });

  it('a stored 0/0/0 aggregate (no scored round) is unranked, never even par', () => {
    const r = rankCandidates([row('a', 'Ann', 1, 75, 3), row('z', 'Zed', 0, 0, 0)]);
    expect(r.map((x) => [x.player_id, x.leaderboard_rank])).toEqual([
      ['a', 1],
      ['z', null],
    ]);
  });

  it('level on to par and strokes: more rounds first, then name, whatever the input order', () => {
    const input = [row('c', 'Cal', 2, 150, 6), row('b', 'Ben', 2, 150, 6), row('a', 'Ann', 3, 150, 6)];
    for (const order of [input, [...input].reverse()]) {
      expect(rankCandidates(order).map((x) => x.player_id)).toEqual(['a', 'b', 'c']);
    }
  });

  it('the workspace ranks a tie at the cut exactly as the Clubhouse leaderboard does', async () => {
    const { buildBoard } = await import('@/clubhouse/screens/qualifiers/model');
    // Squad 2, no picks: Ben and Cal are level at the cut, entered in reverse name order.
    const entrants = [row('c', 'Cal', 2, 150, 6), row('b', 'Ben', 2, 150, 6), row('a', 'Ann', 2, 145, 1)];
    const half = (n: number | null) => (n as number) / 2;
    const board = buildBoard({
      entrants: entrants.map((e) => ({ playerId: e.player_id, name: `${e.player_first_name} X`, classYear: null })),
      rounds: entrants.flatMap((e) =>
        [1, 2].map((n) => ({
          id: `${e.player_id}${n}`,
          playerId: e.player_id,
          number: n,
          total: half(e.total_score),
          toPar: half(e.total_to_par),
          date: '2026-09-01',
          course: null,
          holesPlayed: 18,
        })),
      ),
      squad: 2,
      picks: 0,
      status: 'completed',
      selectionState: 'closed',
      selections: null,
    });
    const ws = assignScoreSlots(rankCandidates(entrants), new Map(), 2);
    expect(ws.map((c) => c.player_id)).toEqual(board.rows.map((r) => r.playerId));
    expect(ws.filter((c) => c.is_top_score_slot).map((c) => c.player_id)).toEqual(
      board.rows.filter((r) => r.state === 'qualified').map((r) => r.playerId),
    );
  });

  it('a coach’s pick who climbs into the top places keeps the pick; the next player takes the place on score', () => {
    const ranked = rankCandidates([row('a', 'Ann', 2, 140, -4), row('b', 'Ben', 2, 145, 1), row('c', 'Cal', 2, 150, 6)]);
    const pick = { qualifier_id: 'q', player_id: 'a', selection_type: 'coach_pick' as const, coach_reasoning: 'x', selected_at: '', selected_by_user_id: '' };
    const ws = assignScoreSlots(ranked, new Map([['a', pick]]), 2);
    expect(ws.filter((c) => c.is_top_score_slot).map((c) => c.player_id)).toEqual(['b', 'c']);
    expect(pickableCount(ws)).toBe(1);
  });

  it('a field smaller than the squad confirms with the picks it can make', () => {
    // Squad 4 with 2 picks, 3 ranked entrants: 2 on score, 1 left to pick.
    const ws = assignScoreSlots(rankCandidates([row('a', 'Ann', 1, 70, -2), row('b', 'Ben', 1, 72, 0), row('c', 'Cal', 1, 75, 3)]), new Map(), 2);
    expect(pickableCount(ws)).toBe(1);
    expect(requiredCoachPicks(2, 1)).toBe(1);
    expect(canConfirmSelection({ state: 'closed', slots_coach_pick: 2, coach_pick_selections: [{ reasoning: 'grit' }], available_for_pick: 1 })).toBe(true);
    expect(canConfirmSelection({ state: 'closed', slots_coach_pick: 2, coach_pick_selections: [], available_for_pick: 1 })).toBe(false);
  });
});
