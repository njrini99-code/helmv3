// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeReactions, useMessageReactions, type MessageReaction } from '../use-message-reactions';

const state = vi.hoisted(() => ({
  rows: [] as MessageReaction[],
  saveError: null as { message: string; code?: string; details?: string; hint?: string } | null,
  readError: null as { message: string; code?: string; details?: string; hint?: string } | null,
  /** Runs as a read resolves: models the session vanishing mid-request. */
  onRead: null as (() => void) | null,
  events: [] as (() => void)[],
  deletes: [] as Record<string, string>[],
  reads: 0,
  /** null models the moment a call fires before the session is attached
   *  (or after it expired) — the 42501 case this hook now gates against. */
  session: { access_token: 'jwt', user: { id: 'me' } } as { access_token: string; user: { id: string } } | null,
  authListeners: [] as ((event: string) => void)[],
}));
const logErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/error-logging', () => ({ logError: logErrorMock }));
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
        if (mode === 'read') { state.reads += 1; state.onRead?.(); return resolve({ data: state.rows.filter((row) => ids.includes(row.message_id)), error: state.readError }); }
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
// Keep pagination in production; isolate this hook's state contract here.
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRowsResult: (query: (from: number, to: number) => unknown) => query(0, 999) }));

beforeEach(() => {
  state.rows = [];
  state.saveError = null;
  state.readError = null;
  state.onRead = null;
  state.events = [];
  state.deletes = [];
  state.reads = 0;
  state.session = { access_token: 'jwt', user: { id: 'me' } };
  state.authListeners = [];
  logErrorMock.mockClear();
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

  it('does not report a 42501 read when the session was gone by the time it answered (8011d1b9)', async () => {
    // Production 2026-09-27T16:18Z (deploy dpl_HD8BRLq11yFKjcqTLfQSXZoXYi4C,
    // which already carries the getSession() gate): a hidden tab restored from
    // back_forward cache passed the gate, the session was dropped before
    // PostgREST answered, the read ran as anon and golf_message_reactions
    // (anon revoked by design) raised 42501. The logger itself saw an
    // anonymous user. Expected control flow, not a grant to widen: keep what
    // is on screen and let onAuthStateChange re-run the load.
    state.readError = { code: '42501', message: 'permission denied for table golf_message_reactions' };
    state.onRead = () => { state.session = null; };
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(state.reads).toBeGreaterThan(0));
    await act(async () => { await Promise.resolve(); });
    expect(logErrorMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('still reports a 42501 read while the session is live (a real access defect)', async () => {
    state.readError = { code: '42501', message: 'permission denied for table golf_message_reactions' };
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });

  it('does not report the browser client aborting a slow read (9b8ad988), but still offers retry', async () => {
    // Production 2026-09-21..28 on /golf/dashboard/messages: WebKit rejects the
    // browser client's request deadline as `AbortError: Fetch is aborted` and
    // supabase-js RESOLVES it as a plain error object with this hint. That is
    // the connection, not the reactions table; it opened (and re-opened as
    // REGRESSED) a Bridge incident on every slow load. Keep the retry copy on
    // screen; focus/realtime/retry re-run the load.
    state.readError = {
      message: 'AbortError: Fetch is aborted',
      details: '',
      hint: 'Request was aborted (timeout or manual cancellation)',
      code: '',
    };
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(result.current.error).toContain('could not be loaded'));
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('does not report the browser client aborting a reaction save (9b8ad988), but says it was not saved', async () => {
    // Production 2026-10-04 22:16Z: the same WebKit deadline abort, on
    // `action: save`. The load path already ignored it; the save path still
    // reported it and reopened the Bridge incident.
    const { result } = renderHook(() => useMessageReactions('dm', ['message-a'], 'me'));
    await waitFor(() => expect(state.reads).toBeGreaterThan(0));
    state.saveError = {
      message: 'AbortError: Fetch is aborted',
      details: '',
      hint: 'Request was aborted (timeout or manual cancellation)',
      code: '',
    };
    let saved = true;
    await act(async () => { saved = await result.current.setReaction('message-a', '👍', true); });
    expect(saved).toBe(false);
    expect(result.current.error).toContain('not saved');
    expect(logErrorMock).not.toHaveBeenCalled();
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
