/**
 * P-1 Seen by: the hook keeps every member's last_read_at (not one "other"), moves each forward only, keeps the map
 * on a failed refetch (no false zero), and reads it again after a reconnect or a return from the background.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { user_id: string; last_read_at: string | null };
const mock = vi.hoisted(() => ({
  participants: [] as Row[],
  participantsError: null as unknown,
  participantReads: 0,
  getUser: vi.fn(),
  handlers: [] as Array<{ table?: string; event?: string; fn: (p: { new: unknown }) => void }>,
  onStatus: null as null | ((s: string) => void),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mock.getUser },
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => void) => {
        if (table === 'golf_conversation_participants') {
          mock.participantReads++;
          return Promise.resolve(mock.participantsError ? { data: null, error: mock.participantsError } : { data: mock.participants, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
      };
      return chain;
    },
    channel: () => {
      const channel = {
        on: (_kind: string, filter: { table?: string; event?: string }, fn: (p: { new: unknown }) => void) => {
          mock.handlers.push({ table: filter?.table, event: filter?.event, fn });
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
  markGolfMessagesAsRead: vi.fn(async () => ({ success: true })),
  sendGolfMessage: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({
  observeRealtimeChannel: (channel: unknown, opts: { onStatus?: (s: string) => void }) => {
    mock.onStatus = opts.onStatus ?? null;
    return channel;
  },
}));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { monotonicReadMark, useGolfMessages } from '../use-golf-messages';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

const T1 = '2026-10-24T18:00:00.000Z';
const T2 = '2026-10-24T19:00:00.000Z';

beforeEach(() => {
  __resetCachedResourcesForTests();
  mock.participants = [
    { user_id: 'viewer', last_read_at: T2 },
    { user_id: 'ava', last_read_at: T1 },
    { user_id: 'eli', last_read_at: null },
  ];
  mock.participantsError = null;
  mock.participantReads = 0;
  mock.handlers = [];
  mock.onStatus = null;
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } } });
});

const participantUpdate = (row: Row) =>
  act(() => {
    for (const h of mock.handlers) if (h.table === 'golf_conversation_participants') h.fn({ new: row });
  });

describe('useGolfMessages read marks (P-1 slice 2)', () => {
  it('keeps every member’s last_read_at, not one "other"', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.readMarks.status).toBe('ready'));
    expect([...result.current.readMarks.byUser]).toEqual([['viewer', T2], ['ava', T1], ['eli', null]]);
  });

  it('a realtime update moves one member forward; an older time is ignored', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.readMarks.status).toBe('ready'));
    await participantUpdate({ user_id: 'eli', last_read_at: T2 });
    expect(result.current.readMarks.byUser.get('eli')).toBe(T2);
    await participantUpdate({ user_id: 'eli', last_read_at: T1 });
    expect(result.current.readMarks.byUser.get('eli')).toBe(T2);
  });

  it('a failed refetch keeps the map it held; a viewer no longer a member gets none', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.readMarks.status).toBe('ready'));
    mock.participantsError = { message: 'boom', code: '500' };
    await act(async () => {
      await result.current.refetchReadMarks();
    });
    expect(result.current.readMarks.status).toBe('error');
    expect(result.current.readMarks.byUser.get('ava')).toBe(T1);
    mock.participantsError = null;
    mock.participants = [{ user_id: 'ava', last_read_at: T1 }];
    await act(async () => {
      await result.current.refetchReadMarks();
    });
    expect(result.current.readMarks).toEqual({ status: 'error', byUser: new Map() });
  });

  it('refetches after a reconnect, not on the first SUBSCRIBED, and when the page is shown again', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.readMarks.status).toBe('ready'));
    const before = mock.participantReads;
    act(() => mock.onStatus?.('SUBSCRIBED'));
    expect(mock.participantReads).toBe(before);
    act(() => mock.onStatus?.('CHANNEL_ERROR'));
    act(() => mock.onStatus?.('SUBSCRIBED'));
    await waitFor(() => expect(mock.participantReads).toBe(before + 1));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(mock.participantReads).toBe(before + 2));
  });

  it('a group never sets isRead on a message (the "other" member is only for a direct thread)', async () => {
    const { result } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(result.current.readMarks.status).toBe('ready'));
    expect(result.current.messages.every((m) => m.isRead === undefined)).toBe(true);
  });
});

describe('monotonicReadMark', () => {
  it('only moves forward', () => {
    const m = new Map<string, string | null>([['a', T1]]);
    expect(monotonicReadMark(m, 'a', T2).get('a')).toBe(T2);
    expect(monotonicReadMark(m, 'a', T1)).toBe(m);
    expect(monotonicReadMark(m, 'a', null)).toBe(m);
    expect(monotonicReadMark(m, 'b', T1).get('b')).toBe(T1);
  });
});
