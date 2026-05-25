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
} from '@/lib/coachhelm/v3/qualifying/state-machine';
import { rankCandidates } from '@/lib/coachhelm/v3/qualifying/loader';
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
