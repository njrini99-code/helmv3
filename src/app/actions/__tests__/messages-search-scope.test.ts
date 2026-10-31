import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Message search scope and naming (audit Messages L2, L3):
 *  - a conversation the viewer deleted (participant hidden_at) is not searched, unless a message arrived after the
 *    hide (the inbox's own rule);
 *  - a DM hit is named after the OTHER person even when only the viewer's own messages matched.
 */
const VIEWER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications/golf-message-fanout', () => ({ notifyGolfMessageRecipients: vi.fn() }));
vi.mock('@/lib/golf/player-profiles', () => ({
  readGolfPlayerProfiles: vi.fn(async (_sb: unknown, q: { userIds?: string[] }) => ({
    data: (q.userIds ?? []).includes(OTHER) ? [{ user_id: OTHER, first_name: 'Pat', last_name: 'Player', avatar_url: null }] : [],
    error: null,
  })),
}));

const state = vi.hoisted(() => ({
  participants: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  newer: [] as Array<Record<string, unknown>>,
  searchedIn: [] as string[][],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) },
    from(table: string) {
      const f: { in?: string[]; gt?: boolean; eqUser?: boolean } = {};
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'ilike', 'neq', 'is']) chain[m] = () => chain;
      chain.eq = (col: string) => { if (col === 'user_id') f.eqUser = true; return chain; };
      chain.in = (_c: string, v: string[]) => { f.in = v; return chain; };
      chain.gt = () => { f.gt = true; return chain; };
      chain.then = (resolve: (v: unknown) => unknown) => {
        let data: unknown[] = [];
        if (table === 'golf_conversation_participants') {
          data = f.eqUser ? state.participants.filter((p) => p.user_id === VIEWER) : state.participants.filter((p) => f.in?.includes(p.conversation_id as string));
        } else if (table === 'golf_messages') {
          if (f.gt) data = state.newer;
          else { state.searchedIn.push(f.in ?? []); data = state.messages.filter((m) => f.in?.includes(m.conversation_id as string)); }
        } else if (table === 'golf_conversations') {
          data = (f.in ?? []).map((id) => ({ id, title: null, is_team_chat: false }));
        } else if (table === 'golf_coaches') data = [];
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return chain;
    },
  }),
}));

import { searchGolfMessages } from '../messages';

beforeEach(() => {
  state.searchedIn = [];
  state.newer = [];
  state.participants = [
    { conversation_id: 'c-live', user_id: VIEWER, hidden_at: null },
    { conversation_id: 'c-live', user_id: OTHER, hidden_at: null },
    { conversation_id: 'c-hidden', user_id: VIEWER, hidden_at: '2026-10-20T00:00:00Z' },
    { conversation_id: 'c-hidden', user_id: OTHER, hidden_at: null },
  ];
  state.messages = [
    { id: 'm1', conversation_id: 'c-live', sender_id: VIEWER, content: 'range at 4', created_at: '2026-10-21T00:00:00Z' },
    { id: 'm2', conversation_id: 'c-hidden', sender_id: OTHER, content: 'range later', created_at: '2026-10-19T00:00:00Z' },
  ];
});

describe('searchGolfMessages', () => {
  it('names a DM after the other person when only the viewer\'s own message matched', async () => {
    const res = await searchGolfMessages('range');
    expect('results' in res && res.results.find((r) => r.messageId === 'm1')?.conversationName).toBe('Pat Player');
  });

  it('leaves a deleted conversation out of the search', async () => {
    const res = await searchGolfMessages('range');
    expect(state.searchedIn.flat()).not.toContain('c-hidden');
    expect('results' in res && res.results.map((r) => r.messageId)).toEqual(['m1']);
  });

  it('searches a deleted conversation again once a message arrived after the hide', async () => {
    state.newer = [{ conversation_id: 'c-hidden', created_at: '2026-10-25T00:00:00Z' }];
    await searchGolfMessages('range');
    expect(state.searchedIn.flat()).toContain('c-hidden');
  });

  it('ignores a message older than that conversation\'s own hide', async () => {
    state.newer = [{ conversation_id: 'c-hidden', created_at: '2026-10-10T00:00:00Z' }];
    await searchGolfMessages('range');
    expect(state.searchedIn.flat()).not.toContain('c-hidden');
  });
});
