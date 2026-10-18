/**
 * @vitest-environment node
 *
 * P007. createGolfTeamBroadcast reused ANY team chat with the same title and
 * reconciled missing members into it. golf_participants_insert_v2 lets a user
 * add other people only to a conversation they created
 * (golf_conversation_created_by_me), so when another coach had created the
 * same-titled chat every participant insert was refused and the broadcast
 * failed. Only the caller's own same-titled chat (one they are still in) may
 * be reused; otherwise a new conversation is created.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

type Row = Record<string, unknown>;

const COACH = 'coach-user';
const OTHER_COACH = 'other-coach-user';
const TEAM = 'team-1';

let fake: unknown;
let participantInserts: Row[][] = [];

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/validation/server-action-validator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/validation/server-action-validator')>()),
  logSecurityEvent: vi.fn(async () => {}),
}));

import { createGolfTeamBroadcast } from '../messages';

function world(conversations: Row[], participants: Row[]) {
  participantInserts = [];
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: COACH, organization_id: 'org-1' }],
    golf_teams: [{ id: TEAM, organization_id: 'org-1' }],
    golf_team_members: [
      { team_id: TEAM, player_id: 'p1', player: { user_id: 'player-user-1' } },
      { team_id: TEAM, player_id: 'p2', player: { user_id: 'player-user-2' } },
    ],
    golf_conversations: conversations,
    golf_conversation_participants: participants,
  };
  const real = createFakeSupabase({ user: { id: COACH }, tables, idFactory: () => 'new-conv' });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_conversation_participants') return b;
      return {
        ...b,
        // golf_participants_insert_v2: a row for someone else is admitted only
        // when the caller created the conversation.
        insert: (payload: Row | Row[]) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          participantInserts.push(rows);
          const refused = rows.some((r) => {
            if (r.user_id === COACH) return false;
            const conv = tables.golf_conversations!.find((c) => c.id === r.conversation_id);
            return conv?.created_by !== COACH;
          });
          if (refused) {
            return Promise.resolve({
              data: null,
              error: { code: '42501', message: 'new row violates row-level security policy' },
            });
          }
          return b.insert(payload);
        },
      };
    },
  };
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGolfTeamBroadcast reuses only the caller’s own same-titled chat (P007)', () => {
  it('creates a new chat instead of adding members to another coach’s same-titled chat', async () => {
    const tables = world(
      [{ id: 'theirs', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: OTHER_COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'theirs', user_id: OTHER_COACH },
        { conversation_id: 'theirs', user_id: COACH },
        { conversation_id: 'theirs', user_id: 'player-user-1' },
      ],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice' });

    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    // Nothing was written into the other coach's conversation.
    expect(participantInserts.flat().some((r) => r.conversation_id === 'theirs')).toBe(false);
    expect(tables.golf_conversations).toHaveLength(2);
    expect(tables.golf_conversations![1]).toMatchObject({ created_by: COACH, title: 'Practice' });
  });

  it('does not reuse another coach’s chat even when the audience already matches', async () => {
    world(
      [{ id: 'theirs', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: OTHER_COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'theirs', user_id: COACH },
        { conversation_id: 'theirs', user_id: 'player-user-1' },
        { conversation_id: 'theirs', user_id: 'player-user-2' },
      ],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice' });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
  });

  it('still reuses the caller’s own same-titled chat and adds the missing members', async () => {
    const tables = world(
      [{ id: 'mine', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'mine', user_id: COACH },
        { conversation_id: 'mine', user_id: 'player-user-1' },
      ],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice' });

    expect(result).toEqual({ conversationId: 'mine', reused: true });
    expect(tables.golf_conversations).toHaveLength(1);
    expect(participantInserts).toEqual([
      [expect.objectContaining({ conversation_id: 'mine', user_id: 'player-user-2' })],
    ]);
  });

  it('reuses the caller’s own chat in place when the audience already matches', async () => {
    world(
      [{ id: 'mine', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'mine', user_id: COACH },
        { conversation_id: 'mine', user_id: 'player-user-1' },
        { conversation_id: 'mine', user_id: 'player-user-2' },
      ],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice' });
    expect(result).toEqual({ conversationId: 'mine', reused: true });
    expect(participantInserts).toEqual([]);
  });

  it('starts a new chat when the caller created the same-titled chat but is no longer in it', async () => {
    world(
      [{ id: 'mine-left', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [{ conversation_id: 'mine-left', user_id: 'player-user-1' }],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice' });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    expect(participantInserts.flat().some((r) => r.conversation_id === 'mine-left')).toBe(false);
  });
});
