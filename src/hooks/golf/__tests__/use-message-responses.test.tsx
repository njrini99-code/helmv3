// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollResponseRow } from '@/lib/golf/message-polls';
import { useMessageResponses } from '../use-message-responses';

/** Votes on a thread's polls (premium features P-2): read, realtime re-read, vote, change, take back, roll back. */

const state = vi.hoisted(() => ({
  rows: [] as PollResponseRow[],
  saveError: null as { message: string; code?: string } | null,
  readError: null as { message: string; code?: string } | null,
  events: [] as ((payload?: unknown) => void)[],
  upserts: [] as { value: Record<string, string>; options: unknown }[],
  deletes: [] as Record<string, string>[],
  reads: 0,
  session: { access_token: 'jwt', user: { id: 'me' } } as { access_token: string; user: { id: string } } | null,
  authListeners: [] as ((event: string) => void)[],
  channels: [] as string[],
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  from: () => {
    let mode = 'read';
    let ids: string[] = [];
    const filters: Record<string, string> = {};
    let upserted: Record<string, string> = {};
    const query = {
      select: () => query,
      in: (_: string, values: string[]) => { ids = values; return query; },
      order: () => query,
      range: () => query,
      upsert: (value: Record<string, string>, options: unknown) => { mode = 'upsert'; upserted = value; state.upserts.push({ value, options }); return query; },
      delete: () => { mode = 'delete'; return query; },
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      then: (resolve: (result: unknown) => void) => {
        if (mode === 'read') { state.reads += 1; return resolve({ data: state.rows.filter((r) => ids.includes(r.message_id)), error: state.readError }); }
        if (state.saveError) return resolve({ error: state.saveError });
        if (mode === 'upsert') {
          state.rows = state.rows.filter((r) => !(r.message_id === upserted.message_id && r.user_id === upserted.user_id));
          state.rows.push({ message_id: upserted.message_id!, user_id: upserted.user_id!, choice: upserted.choice! });
        }
        if (mode === 'delete') {
          state.deletes.push({ ...filters });
          state.rows = state.rows.filter((r) => !(r.message_id === filters.message_id && r.user_id === filters.user_id));
        }
        return resolve({ error: null });
      },
    };
    return query;
  },
  channel: (name: string) => {
    state.channels.push(name);
    const channel = { on: (_: string, _filter: unknown, cb: (payload?: unknown) => void) => { state.events.push(cb); return channel; }, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
  auth: {
    getSession: async () => ({ data: { session: state.session }, error: null }),
    onAuthStateChange: (cb: (event: string) => void) => {
      state.authListeners.push(cb);
      return { data: { subscription: { unsubscribe: () => { state.authListeners = state.authListeners.filter((l) => l !== cb); } } } };
    },
  },
}) }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRowsResult: (query: (from: number, to: number) => unknown) => query(0, 999) }));

beforeEach(() => {
  state.rows = [];
  state.saveError = null;
  state.readError = null;
  state.events = [];
  state.upserts = [];
  state.deletes = [];
  state.reads = 0;
  state.session = { access_token: 'jwt', user: { id: 'me' } };
  state.authListeners = [];
  state.channels = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const IDS = ['poll-1'];

describe('useMessageResponses', () => {
  it('reads the thread’s votes and listens on one channel for the conversation', async () => {
    state.rows = [{ message_id: 'poll-1', user_id: 'ana', choice: 'o1' }, { message_id: 'other', user_id: 'ana', choice: 'o2' }];
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rows).toEqual([{ message_id: 'poll-1', user_id: 'ana', choice: 'o1' }]);
    expect(state.channels).toEqual(['golf-responses:conv-1']);
  });

  it('is ready at once with no polls and opens no channel', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', [], 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(state.channels).toEqual([]);
    expect(state.reads).toBe(0);
  });

  it('re-reads on a realtime change and on a refreshed session', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.rows.push({ message_id: 'poll-1', user_id: 'ben', choice: 'o2' });
    await act(async () => { state.events[0]!({ eventType: 'INSERT', new: { message_id: 'poll-1' } }); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    state.rows.push({ message_id: 'poll-1', user_id: 'cal', choice: 'o1' });
    await act(async () => { state.authListeners[0]!('TOKEN_REFRESHED'); });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
  });

  it('ignores a vote on a poll outside this thread, but re-reads on any delete', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const before = state.reads;
    await act(async () => { state.events[0]!({ eventType: 'UPDATE', new: { message_id: 'elsewhere' } }); });
    expect(state.reads).toBe(before);
    await act(async () => { state.events[0]!({ eventType: 'DELETE', new: {}, old: { id: 7 } }); });
    await waitFor(() => expect(state.reads).toBeGreaterThan(before));
  });

  it('a vote is an upsert on the voter’s own row; changing it replaces the row; null takes it back', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toEqual({ ok: true }); });
    expect(state.upserts[0]).toEqual({ value: expect.objectContaining({ message_id: 'poll-1', user_id: 'me', choice: 'o1' }), options: { onConflict: 'message_id,user_id' } });
    expect(result.current.rows).toEqual([expect.objectContaining({ user_id: 'me', choice: 'o1' })]);
    await act(async () => { await result.current.vote('poll-1', 'o2'); });
    expect(result.current.rows).toEqual([expect.objectContaining({ user_id: 'me', choice: 'o2' })]);
    await act(async () => { await result.current.vote('poll-1', null); });
    expect(state.deletes).toEqual([{ message_id: 'poll-1', user_id: 'me' }]);
    expect(result.current.rows).toEqual([]);
  });

  it('a refused vote goes back to what the server holds and says so', async () => {
    state.rows = [{ message_id: 'poll-1', user_id: 'me', choice: 'o1' }];
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    state.saveError = { message: 'denied', code: '42501' };
    await act(async () => { expect(await result.current.vote('poll-1', 'o2')).toEqual({ ok: false, reason: 'member' }); });
    expect(result.current.rows).toEqual([expect.objectContaining({ user_id: 'me', choice: 'o1' })]);
    expect(result.current.error).toBe('Your vote wasn’t saved. Try again.');
    expect(console.error).toHaveBeenCalledWith('Message poll vote failed to save:', expect.stringContaining('denied'));
  });

  it('no session: nothing is written and the vote is put back', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.session = null;
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toEqual({ ok: false, reason: 'session' }); });
    expect(state.upserts).toEqual([]);
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBe('Sign in again to vote.');
  });

  it('ignores a vote on a message that isn’t one of this thread’s polls', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { expect(await result.current.vote('elsewhere', 'o1')).toEqual({ ok: false, reason: 'failed' }); });
    expect(state.upserts).toEqual([]);
  });

  it('a failed read keeps it not ready and says so', async () => {
    state.readError = { message: 'boom' };
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.error).toBe('Votes could not be loaded. Tap to retry.'));
    expect(result.current.ready).toBe(false);
  });

  it('a refused vote puts back only the viewer’s own row, keeping a vote that landed meanwhile (D16)', async () => {
    state.rows = [{ message_id: 'poll-1', user_id: 'me', choice: 'o1' }];
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    // Ana's vote arrives on screen while ours is out; the server then refuses ours.
    state.rows.push({ message_id: 'poll-1', user_id: 'ana', choice: 'o2' });
    await act(async () => { await result.current.refresh(); });
    state.saveError = { message: 'denied' };
    await act(async () => { await result.current.vote('poll-1', 'o2'); });
    expect(result.current.rows).toEqual(expect.arrayContaining([expect.objectContaining({ user_id: 'me', choice: 'o1' }), expect.objectContaining({ user_id: 'ana', choice: 'o2' })]));
  });

  it('the closed-poll guard reads as closed (OQ-68)', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.saveError = { message: 'new row violates check', code: 'P0001', hint: 'golf_poll_closed' } as { message: string; code: string };
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toEqual({ ok: false, reason: 'closed' }); });
    expect(result.current.error).toBe('Voting has ended.');
  });

  it('the guard on a deleted poll reads as deleted, and its 42501 for a former member as member (held 020100)', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.saveError = { message: 'This poll was deleted', code: 'P0001', hint: 'golf_poll_deleted' } as { message: string; code: string };
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toEqual({ ok: false, reason: 'deleted' }); });
    expect(result.current.error).toBe('This poll was deleted.');
    state.saveError = { message: 'You are not in this conversation', code: '42501' };
    await act(async () => { expect(await result.current.vote('poll-1', null)).toEqual({ ok: false, reason: 'member' }); });
  });

  it('a second tap while the first is saving is not dropped: the latest one is written (D15)', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', ['poll-1', 'poll-2'], 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      const first = result.current.vote('poll-1', 'o1');
      const second = result.current.vote('poll-1', 'o2');
      const other = result.current.vote('poll-2', 'o1');
      await Promise.all([first, second, other]);
    });
    // The tap on poll 2 is written beside poll 1's; poll 1's last write is the latest tap.
    const written = state.upserts.map((u) => [u.value.message_id, u.value.choice]);
    expect(written.filter(([m]) => m === 'poll-1').at(-1)).toEqual(['poll-1', 'o2']);
    expect(written).toContainEqual(['poll-2', 'o1']);
    expect(result.current.rows.filter((r) => r.user_id === 'me').map((r) => [r.message_id, r.choice]).sort()).toEqual([['poll-1', 'o2'], ['poll-2', 'o1']]);
    expect(result.current.pending.size).toBe(0);
  });

  it('a burst of realtime changes reads once (D17)', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const before = state.reads;
    act(() => { for (let i = 0; i < 12; i++) state.events[0]!({ eventType: 'INSERT', new: { message_id: 'poll-1' } }); });
    await waitFor(() => expect(state.reads).toBe(before + 1));
    await new Promise((r) => setTimeout(r, 400));
    expect(state.reads).toBe(before + 1);
  });
});
