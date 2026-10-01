/**
 * Swap audit §11.4 — the selection service's own guards, so a direct call
 * (not just the Clubhouse screen) can't corrupt a squad:
 *   - confirm never rewrites a coach's pick as top_score;
 *   - the closed → selected flip is compare-and-set, so a repeated or
 *     concurrent confirm tells the players once;
 *   - a bare state step can't reach 'selected' (only confirm writes a squad);
 *   - a pick goes to an entrant of this qualifier, not any team player.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { QualifyingWorkspace, SelectionCandidate } from '@/lib/coachhelm/v3/qualifying/types';

type Sb = SupabaseClient<Database>;
type FakeSb = ReturnType<typeof createFakeSupabase>;

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/coachhelm/v3/qualifying/player-notify', () => ({ notifyPlayersOfSelectionOutcome: notify }));
vi.mock('@/lib/coachhelm/v3/qualifying/chat-push', () => ({ pushTravelBriefToChat: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/qualifying/loader', async (orig) => ({
  ...(await orig<typeof import('@/lib/coachhelm/v3/qualifying/loader')>()),
  loadQualifyingWorkspace: vi.fn(),
}));

import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import { confirmSelection, setCoachPick, transitionSelectionState } from '@/lib/coachhelm/v3/qualifying/service';

const mockedLoader = vi.mocked(loadQualifyingWorkspace);

function cand(id: string, o: Partial<SelectionCandidate> = {}): SelectionCandidate {
  return {
    player_id: id,
    player_first_name: id.toUpperCase(),
    player_last_name: 'X',
    rounds_completed: 2,
    total_score: 150,
    total_to_par: 6,
    leaderboard_rank: 1,
    selection: null,
    is_top_score_slot: true,
    ...o,
  };
}

function ws(candidates: SelectionCandidate[], o: Partial<QualifyingWorkspace> = {}): QualifyingWorkspace {
  return {
    qualifier_id: 'q1',
    team_id: 't1',
    name: 'Fall Qualifier',
    start_date: '2026-09-01',
    end_date: null,
    status: 'completed',
    selection_state: 'closed',
    selection_slots_total: 2,
    selection_slots_coach_pick: 1,
    target_tournament_id: null,
    coach_picks_complete: true,
    candidates,
    ...o,
  };
}

function buildSb(selections: Array<Record<string, unknown>> = []): FakeSb {
  return createFakeSupabase({
    tables: {
      golf_qualifier_selections: selections,
      golf_qualifiers: [{ id: 'q1', team_id: 't1', selection_state: 'closed', selection_slots_coach_pick: 1 }],
      golf_qualifier_entries: [
        { id: 'e1', qualifier_id: 'q1', player_id: 'p1' },
        { id: 'e2', qualifier_id: 'q1', player_id: 'p2' },
      ],
      golf_team_coach_staff: [],
    },
  });
}

const pickRow = { qualifier_id: 'q1', player_id: 'p1', selection_type: 'coach_pick', coach_reasoning: 'Course history', selected_at: '', selected_by_user_id: 'u9' };
const pickSel = { ...pickRow, selection_type: 'coach_pick' as const };

beforeEach(() => {
  notify.mockClear();
  mockedLoader.mockReset();
});

describe('confirmSelection guards', () => {
  it('never rewrites a coach’s pick as top_score', async () => {
    const sb = buildSb([{ ...pickRow }]);
    // A stale workspace that still marks the pick as a place on score.
    mockedLoader.mockResolvedValue(ws([cand('p1', { selection: pickSel, is_top_score_slot: true }), cand('p2', { leaderboard_rank: 2 })]));

    const r = await confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' });
    expect(r.ok).toBe(true);
    const { data } = await sb.from('golf_qualifier_selections').select('*').eq('qualifier_id', 'q1');
    const byPlayer = new Map((data as Array<Record<string, unknown>>).map((row) => [row.player_id, row]));
    expect(byPlayer.get('p1')).toMatchObject({ selection_type: 'coach_pick', coach_reasoning: 'Course history' });
    expect(byPlayer.get('p2')).toMatchObject({ selection_type: 'top_score' });
  });

  it('a second confirm (repeat or concurrent) is refused and tells nobody again', async () => {
    const sb = buildSb([{ ...pickRow }]);
    // Both calls read 'closed' before either flips it.
    mockedLoader.mockResolvedValue(ws([cand('p1', { selection: pickSel, is_top_score_slot: false, leaderboard_rank: 2 }), cand('p2')]));

    const [a, b] = await Promise.all([
      confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' }),
      confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(notify).toHaveBeenCalledTimes(1);
    const { data } = await sb.from('golf_qualifier_selections').select('*').eq('qualifier_id', 'q1');
    expect(data).toHaveLength(2);
  });

  it('a field smaller than the squad confirms with the picks there are players for', async () => {
    const sb = buildSb();
    // Squad 3 with 2 picks: one on score, one ranked player left, already picked.
    const p2Pick = { ...pickSel, player_id: 'p2' };
    await sb.from('golf_qualifier_selections').insert({ ...pickRow, player_id: 'p2' });
    mockedLoader.mockResolvedValue(
      ws([cand('p1'), cand('p2', { selection: p2Pick, is_top_score_slot: false, leaderboard_rank: 2 })], { selection_slots_total: 3, selection_slots_coach_pick: 2 }),
    );
    const r = await confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' });
    expect(r.ok).toBe(true);
  });
});

describe('transitionSelectionState guards', () => {
  it('a bare step cannot reach selected', async () => {
    const sb = buildSb();
    const r = await transitionSelectionState(sb as unknown as Sb, 'q1', 'selected');
    expect(r.ok).toBe(false);
    const { data } = await sb.from('golf_qualifiers').select('selection_state').eq('id', 'q1').maybeSingle();
    expect((data as Record<string, unknown>).selection_state).toBe('closed');
  });
});

describe('setCoachPick guards', () => {
  it('refuses a player who is not entered in the qualifier', async () => {
    const sb = buildSb();
    const r = await setCoachPick(sb as unknown as Sb, { qualifier_id: 'q1', player_id: 'p9', reasoning: 'Senior', user_id: 'u9' });
    expect(r).toEqual({ ok: false, error: 'player is not entered in this qualifier' });
    const { data } = await sb.from('golf_qualifier_selections').select('*');
    expect(data).toHaveLength(0);
  });

  it('still picks an entrant', async () => {
    const sb = buildSb();
    const r = await setCoachPick(sb as unknown as Sb, { qualifier_id: 'q1', player_id: 'p2', reasoning: 'Senior', user_id: 'u9' });
    expect(r.ok).toBe(true);
  });
});
