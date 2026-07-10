/**
 * W32 — confirmSelection integration test (travel-brief → chat push).
 *
 * Mocks the workspace loader (it uses relational selects unsupported by
 * fake-supabase) and verifies the downstream chat push via fake tables.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type {
  QualifyingWorkspace,
  QualifierSelection,
} from '@/lib/coachhelm/v3/qualifying/types';

type Sb = SupabaseClient<Database>;

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

function sel(
  overrides: Partial<QualifierSelection> & { qualifier_id: string; player_id: string },
): QualifierSelection {
  return {
    selection_type: 'top_score',
    coach_reasoning: null,
    selected_at: '2026-05-28T00:00:00Z',
    selected_by_user_id: 'u1',
    ...overrides,
  };
}

const MOCK_WORKSPACE: QualifyingWorkspace = {
  qualifier_id: 'q1',
  team_id: 't1',
  name: 'Spring Qualifier',
  start_date: '2026-05-20',
  end_date: '2026-05-22',
  status: 'in_progress',
  selection_state: 'closed',
  selection_slots_total: 3,
  selection_slots_coach_pick: 1,
  target_tournament_id: null,
  coach_picks_complete: true,
  candidates: [
    {
      player_id: 'p1',
      player_first_name: 'Alice',
      player_last_name: 'Smith',
      rounds_completed: 4,
      total_score: 275,
      total_to_par: -5,
      leaderboard_rank: 1,
      selection: null,
      is_top_score_slot: true,
    },
    {
      player_id: 'p2',
      player_first_name: 'Bob',
      player_last_name: 'Jones',
      rounds_completed: 4,
      total_score: 280,
      total_to_par: -2,
      leaderboard_rank: 2,
      selection: null,
      is_top_score_slot: true,
    },
    {
      player_id: 'p3',
      player_first_name: 'Carol',
      player_last_name: 'Day',
      rounds_completed: 4,
      total_score: 290,
      total_to_par: 2,
      leaderboard_rank: 3,
      selection: sel({
        qualifier_id: 'q1',
        player_id: 'p3',
        selection_type: 'coach_pick',
        coach_reasoning: 'Great leader on the course',
      }),
      is_top_score_slot: false,
    },
  ],
};

vi.mock('@/lib/coachhelm/v3/qualifying/loader', () => ({
  loadQualifyingWorkspace: vi.fn(),
}));

import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import { confirmSelection } from '@/lib/coachhelm/v3/qualifying/service';

const mockedLoader = vi.mocked(loadQualifyingWorkspace);

function buildFakeSb() {
  return createFakeSupabase({
    tables: {
      golf_qualifier_selections: [],
      golf_qualifiers: [
        {
          id: 'q1',
          team_id: 't1',
          selection_state: 'closed',
        },
      ],
      golf_team_coach_staff: [
        { id: 'staff-1', team_id: 't1', coach_id: 'coach-1', is_primary: true, role: 'head_coach' },
      ],
      golf_coachhelm_chat_conversations: [],
      golf_coachhelm_chat_messages: [],
    },
  }) as unknown as Sb;
}

describe('confirmSelection → chat push integration', () => {
  beforeEach(() => {
    mockedLoader.mockResolvedValue(MOCK_WORKSPACE);
  });

  it('creates a chat message after selection is confirmed', async () => {
    const sb = buildFakeSb();
    const result = await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' });

    expect(result.ok).toBe(true);

    const { data: msgs } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_messages')
      .select('*');
    expect(msgs!.length).toBeGreaterThanOrEqual(1);

    const msg = msgs![0] as Record<string, unknown>;
    expect(msg.role).toBe('assistant');
    expect(typeof msg.content).toBe('string');
    expect((msg.content as string)).toContain('Spring Qualifier');
  });

  it('creates a Qualifying Updates conversation', async () => {
    const sb = buildFakeSb();
    await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' });

    const { data: convos } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_conversations')
      .select('*');
    expect(convos).toHaveLength(1);
    expect((convos![0] as Record<string, unknown>).title).toBe('Qualifying Updates');
    expect((convos![0] as Record<string, unknown>).coach_id).toBe('coach-1');
  });

  it('still succeeds even if no primary coach is found', async () => {
    const sb = createFakeSupabase({
      tables: {
        golf_qualifier_selections: [],
        golf_qualifiers: [
          { id: 'q1', team_id: 't1', selection_state: 'closed' },
        ],
        golf_team_coach_staff: [],
        golf_coachhelm_chat_conversations: [],
        golf_coachhelm_chat_messages: [],
      },
    }) as unknown as Sb;

    const result = await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' });
    expect(result.ok).toBe(true);

    const { data: msgs } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_messages')
      .select('*');
    expect(msgs).toHaveLength(0);
  });

  it('updates qualifier state to selected', async () => {
    const sb = buildFakeSb();
    await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' });

    const { data: q } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_qualifiers')
      .select('selection_state')
      .eq('id', 'q1')
      .maybeSingle();
    expect((q as Record<string, unknown>).selection_state).toBe('selected');
  });

  it('brief includes coach pick reasoning', async () => {
    const sb = buildFakeSb();
    await confirmSelection(sb, { qualifier_id: 'q1', user_id: 'u1' });

    const { data: msgs } = await (sb as unknown as ReturnType<typeof createFakeSupabase>)
      .from('golf_coachhelm_chat_messages')
      .select('*');
    const content = (msgs![0] as Record<string, unknown>).content as string;
    expect(content).toContain('Great leader on the course');
    expect(content).toContain('Carol Day');
  });
});
