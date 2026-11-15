import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Res = { data: unknown; error: { code?: string; message: string } | null };
const state = vi.hoisted(() => ({
  requests: { data: [], error: null } as Res,
  players: { data: [], error: null } as Res,
  teams: { data: [], error: null } as Res,
}));

vi.mock('@/lib/coachhelm/v3/chat/ask-db', () => ({ askTables: (sb: unknown) => sb }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const res = t === 'ask_credit_requests' ? state.requests : t === 'golf_players' ? state.players : state.teams;
      const chain = { select: () => chain, order: () => chain, limit: async () => res, in: async () => res };
      return chain;
    },
  }),
}));

import { fetchAskCreditRequests } from '../ask-credit-requests';

beforeEach(() => {
  state.requests = { data: [], error: null };
  state.players = { data: [], error: null };
  state.teams = { data: [], error: null };
});

describe('fetchAskCreditRequests (the admin view the ops e-mail points to)', () => {
  it('shows who asked, their team and their note for each request', async () => {
    state.requests = {
      data: [{ id: 'req-1', created_at: '2026-11-11T20:00:00Z', week_start: '2026-11-09', player_id: 'p1', team_id: 't1', note: 'Qualifier Friday', released_at: '2026-11-11T20:00:08Z', sent_at: null }],
      error: null,
    };
    state.players = { data: [{ id: 'p1', first_name: 'Jamie', last_name: 'Minor' }], error: null };
    state.teams = { data: [{ id: 't1', name: 'Varsity' }], error: null };
    await expect(fetchAskCreditRequests()).resolves.toEqual({
      status: 'ok',
      rows: [{ id: 'req-1', createdAt: '2026-11-11T20:00:00Z', weekStart: '2026-11-09', playerName: 'Jamie Minor', teamName: 'Varsity', note: 'Qualifier Friday', releasedAt: '2026-11-11T20:00:08Z', sentAt: null }],
    });
  });

  it('a failed name read keeps the request and its note, with the name unknown', async () => {
    state.requests = { data: [{ id: 'req-1', created_at: 'x', week_start: 'y', player_id: 'p1', team_id: 't1', note: 'n', released_at: null, sent_at: null }], error: null };
    state.players = { data: null, error: { message: 'boom' } };
    const res = await fetchAskCreditRequests();
    expect(res).toMatchObject({ status: 'ok', rows: [{ playerName: null, note: 'n' }] });
  });

  it('the held table missing is "unavailable"; any other failure is an error', async () => {
    state.requests = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    await expect(fetchAskCreditRequests()).resolves.toEqual({ status: 'unavailable' });
    state.requests = { data: null, error: { code: 'XX000', message: 'boom' } };
    await expect(fetchAskCreditRequests()).resolves.toEqual({ status: 'error', message: 'boom' });
  });
});
