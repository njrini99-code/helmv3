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
      { team_id: TEAM, player_id: 'p1', status: 'active', player: { user_id: 'player-user-1' } },
      { team_id: TEAM, player_id: 'p2', status: 'active', player: { user_id: 'player-user-2' } },
      // No longer on the team: never added to a broadcast.
      { team_id: TEAM, player_id: 'p3', status: 'removed', player: { user_id: 'player-user-3' } },
      { team_id: TEAM, player_id: 'p4', status: 'inactive', player: { user_id: 'player-user-4' } },
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

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });

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

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
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

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });

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

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
    expect(result).toEqual({ conversationId: 'mine', reused: true });
    expect(participantInserts).toEqual([]);
  });

  it('starts a new chat when the caller’s same-titled chat holds someone outside the chosen audience', async () => {
    world(
      [{ id: 'varsity', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'varsity', user_id: COACH },
        { conversation_id: 'varsity', user_id: 'player-user-1' },
      ],
    );

    // "Practice" for player 2 alone must not land in the chat player 1 is in.
    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', selectedPlayerIds: ['p2'] });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    expect(participantInserts.flat().some((r) => r.conversation_id === 'varsity')).toBe(false);
  });

  it('starts a new chat rather than reuse one the caller deleted', async () => {
    world(
      [{ id: 'hidden', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [
        { conversation_id: 'hidden', user_id: COACH, hidden_at: '2026-10-01T00:00:00Z' },
        { conversation_id: 'hidden', user_id: 'player-user-1' },
        { conversation_id: 'hidden', user_id: 'player-user-2' },
      ],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
  });

  it('starts a new chat when the caller created the same-titled chat but is no longer in it', async () => {
    world(
      [{ id: 'mine-left', team_id: TEAM, title: 'Practice', is_team_chat: true, created_by: COACH, created_at: '2026-01-01' }],
      [{ conversation_id: 'mine-left', user_id: 'player-user-1' }],
    );

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    expect(participantInserts.flat().some((r) => r.conversation_id === 'mine-left')).toBe(false);
  });
});

describe('createGolfTeamBroadcast reaches the whole team only when asked', () => {
  // An empty or missing player list used to mean "the whole team", so a group
  // whose player lookups all missed went to everyone.
  it.each([
    ['an empty list', { selectedPlayerIds: [] as string[] }],
    ['no list', {}],
  ])('refuses %s and sends nothing', async (_label, audience) => {
    const tables = world([], []);

    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', ...audience } as Parameters<typeof createGolfTeamBroadcast>[0]);

    expect(result).toEqual({ error: 'Choose at least one player.' });
    expect(tables.golf_conversations).toHaveLength(0);
    expect(participantInserts).toEqual([]);
  });

  it('refuses a list together with allPlayers', async () => {
    const tables = world([], []);
    const result = await createGolfTeamBroadcast({
      teamId: TEAM,
      title: 'Practice',
      allPlayers: true,
      selectedPlayerIds: ['p1'],
    } as unknown as Parameters<typeof createGolfTeamBroadcast>[0]);
    expect(result).toHaveProperty('error');
    expect(tables.golf_conversations).toHaveLength(0);
  });

  it('adds every player when allPlayers is set', async () => {
    world([], []);
    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    const added = participantInserts.flat().map((r) => r.user_id);
    expect(added).toEqual(expect.arrayContaining(['player-user-1', 'player-user-2']));
  });

  it('leaves out removed and inactive members, even when chosen', async () => {
    world([], []);
    await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', allPlayers: true });
    const all = participantInserts.flat().map((r) => r.user_id);
    expect(all).not.toContain('player-user-3');
    expect(all).not.toContain('player-user-4');

    world([], []);
    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', selectedPlayerIds: ['p3', 'p4'] });
    expect(result).toHaveProperty('error');
    expect(participantInserts).toEqual([]);
  });

  it('adds only the chosen players otherwise', async () => {
    world([], []);
    const result = await createGolfTeamBroadcast({ teamId: TEAM, title: 'Practice', selectedPlayerIds: ['p1'] });
    expect(result).toEqual({ conversationId: 'new-conv', reused: false });
    const added = participantInserts.flat().map((r) => r.user_id);
    expect(added).toContain('player-user-1');
    expect(added).not.toContain('player-user-2');
  });
});
