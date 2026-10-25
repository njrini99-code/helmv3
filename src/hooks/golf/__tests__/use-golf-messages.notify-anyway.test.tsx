import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-10 Notify anyway in the messages hook: the optional caption columns on load (and the fallback when they are not there yet), the flag
 * travelling with a send and a retry as a fifth argument, ordinary sends keeping their exact call shape, and the realtime stamp that makes the
 * "Notified anyway" caption appear.
 */

const CONVERSATION = 'na-conversation';
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  getUser: vi.fn(),
  rows: [] as Record<string, unknown>[],
  projections: [] as string[],
  missingColumn: false,
  inserted: null as null | ((payload: { new: Record<string, unknown> }) => void),
  updated: null as null | ((payload: { new: Record<string, unknown> }) => void),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mock.getUser },
  storage: { from: () => ({ remove: vi.fn() }) },
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    let fields = '';
    for (const method of ['eq', 'in', 'neq', 'not', 'gt', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.select = (f: string) => { fields = f; if (table === 'golf_messages') mock.projections.push(f); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => {
      if (table === 'golf_messages' && mock.missingColumn && fields.includes('notify_anyway')) return Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }).then(resolve);
      return Promise.resolve({ data: table === 'golf_messages' ? [...mock.rows] : [], error: null }).then(resolve);
    };
    return chain;
  },
  channel: () => {
    const channel = {
      on: (_kind: string, filter: { table?: string; event?: string }, callback: typeof mock.inserted) => {
        if (filter.table === 'golf_messages' && filter.event === 'INSERT') mock.inserted = callback;
        if (filter.table === 'golf_messages' && filter.event === 'UPDATE') mock.updated = callback;
        return channel;
      },
      subscribe: () => channel,
      send: vi.fn(),
    };
    return channel;
  },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
  markGolfMessagesAsRead: async () => ({ success: true }),
  sendGolfMessage: mock.send,
  sendGolfMessageWithAttachments: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { applyRealtimeMessageUpdate, useGolfMessages } from '../use-golf-messages';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

beforeEach(() => {
  __resetCachedResourcesForTests();
  window.sessionStorage.clear();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null });
  mock.rows = [];
  mock.projections = [];
  mock.missingColumn = false;
  mock.inserted = null;
  mock.updated = null;
  mock.send.mockReset().mockResolvedValue({ success: true });
});

async function loadedHook(classAwareness?: boolean) {
  const hook = renderHook(() => useGolfMessages(CONVERSATION, 'viewer', { deferMarkRead: true, ...(classAwareness === undefined ? {} : { classAwareness }) }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}
const fields = (i = 0) => mock.projections[i]!.split(',').map((f) => f.trim());

describe('loading the caption columns', () => {
  it('with class awareness off no read names them', async () => {
    await loadedHook();
    expect(fields()).not.toContain('notify_anyway');
    expect(fields()).not.toContain('notify_anyway_pushed_at');
    expect(fields()).toContain('reply_to_id');
  });

  it('with class awareness on the read carries them, and a stamped message arrives stamped', async () => {
    mock.rows = [{ id: 'm1', conversation_id: CONVERSATION, sender_id: 'coach', content: 'Now please', created_at: '2026-10-26T14:00:00Z', notify_anyway: true, notify_anyway_pushed_at: '2026-10-26T14:00:02Z' }];
    const { result } = await loadedHook(true);
    expect(fields()).toEqual(expect.arrayContaining(['notify_anyway', 'notify_anyway_pushed_at']));
    expect(result.current.messages[0]).toMatchObject({ notify_anyway: true, notify_anyway_pushed_at: '2026-10-26T14:00:02Z' });
  });

  it('with the columns missing the load repeats without them and loses no message', async () => {
    mock.missingColumn = true;
    mock.rows = [{ id: 'm1', conversation_id: CONVERSATION, sender_id: 'coach', content: 'Hello', created_at: '2026-10-26T14:00:00Z' }];
    const { result } = await loadedHook(true);
    expect(mock.projections).toHaveLength(2);
    expect(fields(1)).not.toContain('notify_anyway');
    expect(result.current.error).toBe(false);
    expect(result.current.messages).toHaveLength(1);
  });
});

describe('sending with Notify anyway', () => {
  it('passes the flag as a fifth argument, marks the optimistic row, and keeps it through a refusal and Retry', async () => {
    let resolveSend!: (value: { success: boolean; error: string }) => void;
    mock.send.mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; }));
    const { result } = await loadedHook(true);
    let sending!: Promise<unknown>;
    act(() => { sending = result.current.sendMessage('Step out for two minutes', undefined, { notifyAnyway: true }).catch((e) => e); });
    const optimistic = result.current.messages[0]!;
    expect(optimistic.notify_anyway).toBe(true);
    expect(mock.send).toHaveBeenLastCalledWith(CONVERSATION, 'Step out for two minutes', optimistic.id, null, { notifyAnyway: true });
    await act(async () => { resolveSend({ success: false, error: 'Denied' }); await sending; });
    expect(result.current.messages[0]).toMatchObject({ id: optimistic.id, sendFailed: true, notify_anyway: true });
    await act(async () => { expect(await result.current.retryMessage(optimistic.id)).toBe(true); });
    expect(mock.send).toHaveBeenLastCalledWith(CONVERSATION, 'Step out for two minutes', optimistic.id, null, { notifyAnyway: true });
  });

  it('a reply sent with the flag keeps its reply target', async () => {
    const { result } = await loadedHook(true);
    await act(async () => { await result.current.sendMessage('Now', 'parent-1', { notifyAnyway: true }); });
    expect(mock.send.mock.calls[0]!.slice(3)).toEqual(['parent-1', { notifyAnyway: true }]);
  });

  it('an ordinary send keeps its exact three-argument shape, with no flag on the row', async () => {
    const { result } = await loadedHook(true);
    await act(async () => { await result.current.sendMessage('Plain'); });
    expect(mock.send.mock.calls[0]).toHaveLength(3);
    expect(result.current.messages[0]).not.toHaveProperty('notify_anyway');
    await act(async () => { await result.current.sendMessage('Plain', undefined, { notifyAnyway: false }); });
    expect(mock.send.mock.calls[1]).toHaveLength(3);
  });
});

type Row = { id: string; content: string; edited_at: string | null; is_deleted: boolean; notify_anyway?: boolean; notify_anyway_pushed_at?: string | null };

describe('the stamp arriving after the send', () => {
  it('a realtime update that only stamps notify_anyway_pushed_at re-renders the message', () => {
    const prev: Row[] = [{ id: 'm1', content: 'Now', edited_at: null, is_deleted: false, notify_anyway: true, notify_anyway_pushed_at: null }];
    const next = applyRealtimeMessageUpdate(prev, { ...prev[0]!, notify_anyway_pushed_at: '2026-10-26T14:00:02Z' });
    expect(next).not.toBe(prev);
    expect(next[0]!.notify_anyway_pushed_at).toBe('2026-10-26T14:00:02Z');
    // Nothing else changed: content stays.
    expect(next[0]!.content).toBe('Now');
  });

  it('an update that changes nothing rendered still returns the same list (the load-bearing bail-out)', () => {
    const prev: Row[] = [{ id: 'm1', content: 'Now', edited_at: null, is_deleted: false, notify_anyway_pushed_at: '2026-10-26T14:00:02Z' }];
    expect(applyRealtimeMessageUpdate(prev, { ...prev[0]! })).toBe(prev);
    // A payload from a database without the column carries none: it must not clear a stamp.
    const { notify_anyway_pushed_at: _drop, ...bare } = prev[0]!;
    void _drop;
    expect(applyRealtimeMessageUpdate(prev, bare)).toBe(prev);
  });
});
