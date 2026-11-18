/**
 * F-06 exemptions in the selection service (owner, 16 Nov 2026: "Exempt before, from coach picks"): closing selection
 * turns each exempt entrant into a coach's pick with the reason, never past the picks there are, and a pick for an exempt
 * player needs no scored round (Q-115 waived for them only).
 */

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Sb = SupabaseClient<Database>;

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerException: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/qualifying/player-notify', () => ({ notifyPlayersOfSelectionOutcome: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/qualifying/chat-push', () => ({ pushTravelBriefToChat: vi.fn(async () => {}) }));

import { setCoachPick, transitionSelectionState } from '../service';

function buildSb(o: { state?: string; picks?: number; exempt?: Array<{ player_id: string; reason: string }>; selections?: Array<Record<string, unknown>> } = {}) {
  return createFakeSupabase({
    tables: {
      golf_qualifier_selections: o.selections ?? [],
      golf_qualifiers: [{ id: 'q1', team_id: 't1', selection_state: o.state ?? 'scoring', selection_slots_coach_pick: o.picks ?? 1 }],
      golf_qualifier_entries: [
        { id: 'e1', qualifier_id: 'q1', player_id: 'p1' },
        { id: 'e2', qualifier_id: 'q1', player_id: 'p2' },
        { id: 'e3', qualifier_id: 'q1', player_id: 'p3' },
      ],
      golf_qualifier_exemptions: (o.exempt ?? []).map((e, i) => ({ qualifier_id: 'q1', team_id: 't1', created_at: `2026-11-16T00:0${i}:00Z`, ...e })),
      golf_rounds: [{ id: 'r1', qualifier_id: 'q1', player_id: 'p2', status: 'completed', is_test: false, total_score: 72 }],
    },
  });
}
const selections = async (sb: ReturnType<typeof createFakeSupabase>) => (await sb.from('golf_qualifier_selections').select('*').eq('qualifier_id', 'q1')).data as Array<Record<string, unknown>>;

describe('exempt players at close (F-06)', () => {
  it('90983 closing places each exempt entrant as a coach’s pick with the reason, in the closer’s name', async () => {
    const sb = buildSb({ exempt: [{ player_id: 'p1', reason: 'Conference champion' }] });
    expect((await transitionSelectionState(sb as unknown as Sb, 'q1', 'closed', 'u9')).ok).toBe(true);
    expect(await selections(sb)).toEqual([
      expect.objectContaining({ player_id: 'p1', selection_type: 'coach_pick', coach_reasoning: 'Exempt: Conference champion', selected_by_user_id: 'u9' }),
    ]);
  });

  it('never past the picks there are, and a pick already made stands', async () => {
    const sb = buildSb({
      picks: 1,
      exempt: [
        { player_id: 'p1', reason: 'a' },
        { player_id: 'p3', reason: 'b' },
      ],
    });
    await transitionSelectionState(sb as unknown as Sb, 'q1', 'closed', 'u9');
    expect((await selections(sb)).map((s) => s.player_id)).toEqual(['p1']);
  });

  it('nobody exempt, or another step: no pick is written', async () => {
    const sb = buildSb({ state: 'open' });
    await transitionSelectionState(sb as unknown as Sb, 'q1', 'scoring', 'u9');
    expect(await selections(sb)).toEqual([]);
  });
});

describe('a coach’s pick for an exempt player (F-06)', () => {
  it('90183 needs no scored round when the player is exempt; Q-115 still holds for everyone else', async () => {
    const sb = buildSb({ state: 'closed', picks: 2, exempt: [{ player_id: 'p1', reason: 'Medical redshirt return' }] });
    expect((await setCoachPick(sb as unknown as Sb, { qualifier_id: 'q1', player_id: 'p1', reasoning: 'Exempt', user_id: 'u9' })).ok).toBe(true);
    expect(await setCoachPick(sb as unknown as Sb, { qualifier_id: 'q1', player_id: 'p3', reasoning: 'Senior', user_id: 'u9' })).toEqual({
      ok: false,
      error: 'player has no scored round in this qualifier',
    });
  });
});
