// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeReactions, useMessageReactions, type MessageReaction } from '../use-message-reactions';

const state = vi.hoisted(() => ({
  rows: [] as MessageReaction[],
  saveError: null as { code: string; message: string } | null,
  readError: null as { message: string } | null,
  events: [] as (() => void)[],
  deletes: [] as Record<string, string>[],
  reads: 0,
  /** How many times `client.channel(...)` was called — i.e. how many times
   *  the realtime subscription was (re)created. Row 6 (perf audit): this must
   *  stay 1 for the life of a conversation even as the visible id set grows. */
  channelCreates: 0,
  removeChannelCalls: 0,
  /** null models the moment a call fires before the session is attached
   *  (or after it expired) — the 42501 case this hook now gates against. */
  session: { access_token: 'jwt', user: { id: 'me' } } as { access_token: string; user: { id: string } } | null,
  authListeners: [] as ((event: string) => void)[],
}));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  from: () => {
    let mode = 'read';
    let ids: string[] = [];
    const filters: Record<string, string> = {};
    let inserted: Record<string, string> = {};
    const query = {
      select: () => query,
      in: (_: string, values: string[]) => { ids = values; return query; },
      order: () => query,
      range: () => query,
      insert: (value: Record<string, string>) => { mode = 'insert'; inserted = value; return query; },
      delete: () => { mode = 'delete'; return query; },
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      then: (resolve: (result: unknown) => void) => {
        if (mode === 'read') { state.reads += 1; return resolve({ data: state.rows.filter((row) => ids.includes(row.message_id)), error: state.readError }); }
        if (state.saveError) return resolve({ error: state.saveError });
        if (mode === 'insert') state.rows.push({ id: `r${state.rows.length}`, ...inserted } as MessageReaction);
        if (mode === 'delete') {
          state.deletes.push(filters);
          state.rows = state.rows.filter((row) => !Object.entries(filters).every(([key, value]) => row[key as keyof MessageReaction] === value));
        }
        return resolve({ error: null });
      },
    };
    return query;
  },
  channel: () => {
    state.channelCreates += 1;
    const channel = { on: (_: string, _filter: unknown, cb: () => void) => { state.events.push(cb); return channel; }, subscribe: () => channel };
    return channel;
  },
  removeChannel: () => { state.removeChannelCalls += 1; },
  auth: {
    getSession: async () => ({ data: { session: state.session }, error: null }),
    onAuthStateChange: (cb: (event: string) => void) => {
      state.authListeners.push(cb);
      return { data: { subscription: { unsubscribe: () => { state.authListeners = state.authListeners.filter((l) => l !== cb); } } } };
    },
  },
}) }));
// Keep pagination in production; isolate this hook's state contract here.
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRowsResult: (query: (from: number, to: number) => unknown) => query(0, 999) }));

beforeEach(() => {
  state.rows = [];
  state.saveError = null;
  state.readError = null;
  state.events = [];
  state.deletes = [];
  state.reads = 0;
  state.channelCreates = 0;
  state.removeChannelCalls = 0;
  state.session = { access_token: 'jwt', user: { id: 'me' } };
  state.authListeners = [];
});
const row = (id: string, user: string, message = 'message-a'): MessageReaction => ({ id, user_id: user, message_id: message, emoji: '👍' });

describe('message reactions', () => {
  it('counts distinct members in the selected message and marks only the viewer active', () => {
    expect(summarizeReactions([row('1', 'me'), row('2', 'peer'), row('3', 'peer'), row('4', 'elsewhere', 'message-b')], 'message-a', 'me'))
      .toEqual([{ emoji: '👍', count: 2, active: true }]);
  });

  it('saves, reloads, and removes only the current member reaction in a group', async () => {
    state.rows = [row('peer', 'peer')];
    const { result, unmount } = renderHook(() => useMessageReactions('group', ['message-a'], 'me'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => { expect(await result.current.setReaction('message-a', '👍', true)).toBe(true); });
    expect(summarizeReactions(result.current.rows, 'message-a', 'me')[0]?.count).toBe(2);
    unmount();
    const reopened = renderHook(() => useMessageReactions('group', ['message-a'], 'me'));
    await waitFor(() => expect(reopened.result.current.rows).toHaveLength(2));
    await act(async () => { await reopened.result.current.setReaction('message-a', '👍', false); });
    expect(reopened.result.current.rows).toEqual([row('peer', 'peer')]);
    expect(state.deletes[0]).toEqual({ message_id: 'message-a', user_id: 'me', emoji: '👍' });
  });

  it('updates another participant reaction when realtime arrives', async () => {
    const { result } = renderHook(() => useMessageReactions('group', ['message-a'], 'me'));
    await act(async () => {});
    state.rows.push(row('peer', 'peer'));
    await act(async () => { state.events.at(-1)?.(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it('keeps failed writes visible without inventing a reaction', async () => {
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await act(async () => {});
    state.saveError = { code: '42501', message: 'permission denied' };
    await act(async () => { expect(await result.current.setReaction('message-a', '👍', true)).toBe(false); });
    expect(result.current.error).toContain('not saved');
    expect(result.current.rows).toEqual([]);
    expect(result.current.pending).toBeNull();
  });

  it('does not allow a stale thread control to write to another message', async () => {
    const { result, rerender } = renderHook(({ id }) => useMessageReactions(id, [id], 'me'), { initialProps: { id: 'message-a' } });
    await act(async () => {});
    const staleControl = result.current.setReaction;
    rerender({ id: 'message-b' });
    await act(async () => { expect(await result.current.setReaction('message-a', '👍', true)).toBe(false); });
    await act(async () => { expect(await staleControl('message-a', '👍', true)).toBe(false); });
    expect(state.rows).toEqual([]);
  });

  it('distinguishes an unreadable reaction list from an empty list', async () => {
    state.readError = { message: 'offline' };
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
    state.readError = null;
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
  });

  it('never queries without a live session, and self-heals once one appears', async () => {
    // Measured 2026-09-09T18:31:49Z: this hook's GET went out with no JWT and
    // golf_message_reactions (anon revoked by design) answered 42501. The
    // request must not be made at all — not retried, not surfaced as an error.
    state.rows = [row('peer', 'peer')];
    state.session = null;
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await act(async () => { await Promise.resolve(); });
    expect(state.reads).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual([]);

    state.session = { access_token: 'jwt', user: { id: 'me' } };
    await act(async () => { state.authListeners.forEach((l) => l('SIGNED_IN')); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(state.reads).toBeGreaterThan(0);
  });

  it('does not tear down the realtime channel when a new message id appears, but does refetch', async () => {
    // Row 6 (perf audit): the whole finding was that EVERY incoming message
    // tore down and rebuilt the reactions channel, because the subscribe
    // effect used to depend on `refresh`, and `refresh` changes identity
    // whenever the visible id set grows. The channel must now depend only on
    // the conversation.
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useMessageReactions('group', ids, 'me'),
      { initialProps: { ids: ['message-a'] } },
    );
    await waitFor(() => expect(state.reads).toBeGreaterThan(0));
    expect(state.channelCreates).toBe(1);
    const readsBeforeArrival = state.reads;

    // A new message arrives — the id set grows, which is exactly what used to
    // tear the channel down.
    await act(async () => { rerender({ ids: ['message-a', 'message-b'] }); });
    await waitFor(() => expect(state.reads).toBeGreaterThan(readsBeforeArrival));
    expect(state.channelCreates).toBe(1);
    expect(state.removeChannelCalls).toBe(0);
  });

  it('refuses to write a reaction without a live session', async () => {
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(state.reads).toBeGreaterThan(0));
    state.session = null;
    let saved = true;
    await act(async () => { saved = await result.current.setReaction('message-a', '👍', true); });
    expect(saved).toBe(false);
    expect(state.rows).toEqual([]);
    expect(result.current.error).toBe('Sign in again to react.');
  });
});
