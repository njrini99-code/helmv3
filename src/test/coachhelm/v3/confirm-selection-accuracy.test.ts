/**
 * Audit rows 54 + 55 — confirmSelection accuracy.
 *
 * 54: the travel brief was composed from the PRE-confirm workspace, so the
 *     top-score section was empty on every first confirmation (0 of 2 stored
 *     briefs listed a player), and a qualifier with zero eligible players
 *     could still flip to 'selected'.
 * 55: player notices were binary — an entrant who never posted a score was
 *     told 'not_selected', everyone was told 'not_selected' when nobody was
 *     selected, and no receipt row was written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type {
  QualifyingWorkspace,
  SelectionCandidate,
} from '@/lib/coachhelm/v3/qualifying/types';

type Sb = SupabaseClient<Database>;
type FakeSb = ReturnType<typeof createFakeSupabase>;

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

const emailCalls: Array<{ userId: string; data: Record<string, unknown> }> = [];
const pushCalls: Array<{ userId: string; data: Record<string, unknown> }> = [];
const inAppCalls: Array<{ userIds: readonly string[]; title: string; body: string; data?: Record<string, unknown> }> = [];

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async (_t: string, userId: string, _e: string, data: Record<string, unknown>) => {
    emailCalls.push({ userId, data });
    return { success: true };
  }),
}));
vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: vi.fn(async (_t: string, userId: string, data: Record<string, unknown>) => {
    pushCalls.push({ userId, data });
    return { success: true };
  }),
}));
vi.mock('@/lib/notifications/in-app', () => ({
  recordInAppNotification: vi.fn(async (input: (typeof inAppCalls)[number]) => {
    inAppCalls.push(input);
  }),
}));

vi.mock('@/lib/coachhelm/v3/qualifying/loader', () => ({
  loadQualifyingWorkspace: vi.fn(),
}));

import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import { confirmSelection } from '@/lib/coachhelm/v3/qualifying/service';
import { notifyPlayersOfSelectionOutcome } from '@/lib/coachhelm/v3/qualifying/player-notify';

const mockedLoader = vi.mocked(loadQualifyingWorkspace);

function cand(
  id: string,
  first: string,
  o: Partial<SelectionCandidate> = {},
): SelectionCandidate {
  return {
    player_id: id,
    player_first_name: first,
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
    selection_slots_total: 5,
    selection_slots_coach_pick: 0,
    target_tournament_id: null,
    coach_picks_complete: true,
    candidates,
    ...o,
  };
}

/** Loader double that reads committed selection rows from the fake DB, like
 *  the real loader does — so a post-upsert re-read sees the top_score rows. */
function loaderFromDb(sb: FakeSb, base: QualifyingWorkspace) {
  return async () => {
    const { data } = await sb.from('golf_qualifier_selections').select('*').eq('qualifier_id', 'q1');
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ...base,
      candidates: base.candidates.map((c) => {
        const r = rows.find((row) => row.player_id === c.player_id);
        return r
          ? {
              ...c,
              selection: {
                qualifier_id: 'q1',
                player_id: c.player_id,
                selection_type: r.selection_type as 'top_score' | 'coach_pick',
                coach_reasoning: (r.coach_reasoning as string | null) ?? null,
                selected_at: String(r.selected_at ?? ''),
                selected_by_user_id: String(r.selected_by_user_id ?? ''),
              },
            }
          : c;
      }),
    };
  };
}

function buildSb(): FakeSb {
  return createFakeSupabase({
    tables: {
      golf_qualifier_selections: [],
      golf_qualifiers: [{ id: 'q1', team_id: 't1', selection_state: 'closed' }],
      golf_team_coach_staff: [
        { id: 's1', team_id: 't1', coach_id: 'coach-1', is_primary: true, role: 'head_coach' },
      ],
      golf_coachhelm_chat_conversations: [],
      golf_coachhelm_chat_messages: [],
      golf_players: [
        { id: 'p1', user_id: 'u1' },
        { id: 'p2', user_id: 'u2' },
        { id: 'p3', user_id: 'u3' },
      ],
      users: [
        { id: 'u1', email: 'a@example.com' },
        { id: 'u2', email: 'b@example.com' },
        { id: 'u3', email: 'c@example.com' },
      ],
    },
  });
}

beforeEach(() => {
  emailCalls.length = 0;
  pushCalls.length = 0;
  inAppCalls.length = 0;
  mockedLoader.mockReset();
});

describe('confirmSelection travel brief (row 54)', () => {
  it('lists the top-score players written by this confirmation', async () => {
    const sb = buildSb();
    const base = ws([
      cand('p1', 'Ann', { leaderboard_rank: 1 }),
      cand('p2', 'Ben', { leaderboard_rank: 2, total_to_par: 9 }),
      cand('p3', 'Cal', {
        rounds_completed: 0,
        total_score: null,
        total_to_par: null,
        leaderboard_rank: null,
        is_top_score_slot: false,
      }),
    ]);
    mockedLoader.mockImplementation(loaderFromDb(sb, base));

    const result = await confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' });
    expect(result.ok).toBe(true);

    const { data: msgs } = await sb.from('golf_coachhelm_chat_messages').select('*');
    const content = String((msgs![0] as Record<string, unknown>).content);
    expect(content).toContain('Auto-Qualified (Top Score)');
    expect(content).toContain('Ann X');
    expect(content).toContain('Ben X');
    // Unfilled slots and unscored entrants are stated, not silently dropped.
    expect(content).toContain('2 of 5');
    expect(content).toMatch(/1 of 3 entrants.*no score/);
  });

  it('refuses to confirm when no player is eligible', async () => {
    const sb = buildSb();
    const base = ws([
      cand('p1', 'Ann', { rounds_completed: 0, total_score: null, total_to_par: null, leaderboard_rank: null }),
    ]);
    mockedLoader.mockImplementation(loaderFromDb(sb, base));

    const result = await confirmSelection(sb as unknown as Sb, { qualifier_id: 'q1', user_id: 'u9' });
    expect(result.ok).toBe(false);

    const { data: q } = await sb.from('golf_qualifiers').select('selection_state').eq('id', 'q1').maybeSingle();
    expect((q as Record<string, unknown>).selection_state).toBe('closed');
    expect(pushCalls).toHaveLength(0);
  });
});

describe('notifyPlayersOfSelectionOutcome (row 55)', () => {
  it('sends a distinct pending notice to entrants without a score', async () => {
    const sb = buildSb();
    await sb.from('golf_qualifier_selections').insert({ qualifier_id: 'q1', player_id: 'p1', selection_type: 'top_score' });
    await notifyPlayersOfSelectionOutcome(
      sb as unknown as Sb,
      ws([
        cand('p1', 'Ann'),
        cand('p2', 'Ben', { leaderboard_rank: 2 }),
        cand('p3', 'Cal', { rounds_completed: 0, total_score: null, total_to_par: null, leaderboard_rank: null }),
      ]),
    );

    const outcome = (u: string) => pushCalls.find((c) => c.userId === u)?.data.outcome;
    expect(outcome('u1')).toBe('selected');
    expect(outcome('u2')).toBe('not_selected');
    expect(outcome('u3')).toBe('not_scored');
    expect(emailCalls.find((c) => c.userId === 'u3')?.data.outcome).toBe('not_scored');
  });

  it('notifies nobody when nobody was selected', async () => {
    const sb = buildSb();
    await notifyPlayersOfSelectionOutcome(sb as unknown as Sb, ws([cand('p1', 'Ann'), cand('p2', 'Ben')]));
    expect(pushCalls).toHaveLength(0);
    expect(emailCalls).toHaveLength(0);
    expect(inAppCalls).toHaveLength(0);
  });

  it('writes one in-app receipt per outcome with the outcome in data', async () => {
    const sb = buildSb();
    await sb.from('golf_qualifier_selections').insert({ qualifier_id: 'q1', player_id: 'p1', selection_type: 'top_score' });
    await notifyPlayersOfSelectionOutcome(
      sb as unknown as Sb,
      ws([
        cand('p1', 'Ann'),
        cand('p3', 'Cal', { rounds_completed: 0, total_score: null, total_to_par: null, leaderboard_rank: null }),
      ]),
    );

    const receipts = inAppCalls.flatMap((c) => c.userIds.map((u) => ({ u, data: c.data, title: c.title })));
    expect(receipts).toHaveLength(2);
    const byUser = new Map(receipts.map((r) => [r.u, r]));
    expect(byUser.get('u1')?.data).toMatchObject({ qualifier_id: 'q1', qualifier_outcome: 'selected' });
    expect(byUser.get('u3')?.data).toMatchObject({ qualifier_id: 'q1', qualifier_outcome: 'not_scored' });
    expect(byUser.get('u1')?.title).not.toBe(byUser.get('u3')?.title);
  });
});
