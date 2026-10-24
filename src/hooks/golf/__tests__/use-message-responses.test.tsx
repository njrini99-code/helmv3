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
  events: [] as (() => void)[],
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
    const channel = { on: (_: string, _filter: unknown, cb: () => void) => { state.events.push(cb); return channel; }, subscribe: () => channel };
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
    await act(async () => { state.events[0]!(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    state.rows.push({ message_id: 'poll-1', user_id: 'cal', choice: 'o1' });
    await act(async () => { state.authListeners[0]!('TOKEN_REFRESHED'); });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
  });

  it('a vote is an upsert on the voter’s own row; changing it replaces the row; null takes it back', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toBe(true); });
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
    await act(async () => { expect(await result.current.vote('poll-1', 'o2')).toBe(false); });
    expect(result.current.rows).toEqual([expect.objectContaining({ user_id: 'me', choice: 'o1' })]);
    expect(result.current.error).toBe('Your vote wasn’t saved. Try again.');
    expect(console.error).toHaveBeenCalledWith('Message poll vote failed to save:', expect.stringContaining('denied'));
  });

  it('no session: nothing is written and the vote is put back', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    state.session = null;
    await act(async () => { expect(await result.current.vote('poll-1', 'o1')).toBe(false); });
    expect(state.upserts).toEqual([]);
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBe('Sign in again to vote.');
  });

  it('ignores a vote on a message that isn’t one of this thread’s polls', async () => {
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { expect(await result.current.vote('elsewhere', 'o1')).toBe(false); });
    expect(state.upserts).toEqual([]);
  });

  it('a failed read keeps it not ready and says so', async () => {
    state.readError = { message: 'boom' };
    const { result } = renderHook(() => useMessageResponses('conv-1', IDS, 'me'));
    await waitFor(() => expect(result.current.error).toBe('Votes could not be loaded. Tap to retry.'));
    expect(result.current.ready).toBe(false);
  });
});
