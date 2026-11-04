import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }));
const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/client', () => ({ createClient }));

type Err = { code?: string; message?: string; details?: string | null };
type Rpc = { data: { pins?: string[] } | null; error: Err | null };

/** A client as the hook uses it: the read answers `reads` in order, `rpc` answers `rpc`, the channel keeps its handlers. */
function fakeDb(opts: { list?: string[]; readError?: Err; rpc?: (args: Record<string, unknown>) => Rpc } = {}) {
  const order: string[] = [];
  let handler: ((m: { payload?: { team_id?: string | null } }) => void) | null = null;
  let onStatus: ((s: string) => void) | null = null;
  const calls = { reads: 0, rpc: [] as Array<Record<string, unknown>>, eqs: [] as Array<[string, string]>, nulls: [] as string[] };
  const answer = async () => {
    calls.reads++;
    return opts.readError ? { data: null, error: opts.readError } : { data: (opts.list ?? []).map((conversation_id) => ({ conversation_id })), error: null };
  };
  const channel = {
    on: vi.fn((_k: string, _f: { event: string }, cb: typeof handler) => {
      handler = cb;
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      onStatus = cb;
      cb('SUBSCRIBED');
      return channel;
    }),
  };
  const db = {
    from: vi.fn(() => ({
      select: () => ({
        eq: (k: string, v: string) => {
          calls.eqs.push([k, v]);
          return { order: answer };
        },
        is: (k: string) => {
          calls.nulls.push(k);
          return { order: answer };
        },
      }),
    })),
    rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => {
      calls.rpc.push(args);
      return opts.rpc ? opts.rpc(args) : { data: { pins: [] }, error: null };
    }),
    realtime: {
      setAuth: vi.fn(async () => {
        order.push('setAuth');
      }),
    },
    channel: vi.fn((topic: string, cfg: { config: { private: boolean } }) => {
      order.push('channel');
      calls.eqs.push([topic, String(cfg.config.private)]);
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  return { db, calls, order, channel, broadcast: (team: string | null) => handler?.({ payload: { team_id: team } }), status: (s: string) => onStatus?.(s) };
}

// `unavailableUntil` is module state: each test gets its own copy of the hook.
async function load() {
  vi.resetModules();
  const pinned = await import('../pinned');
  const { useConversationPins } = await import('../use-conversation-pins');
  return { useConversationPins, pinned };
}
const IDS = ['a', 'b', 'c', 'd'];

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  toast.mockClear();
  createClient.mockReset();
  localStorage.clear();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Messages MSG-PIN-04 and MSG-PIN-09: with the table missing or rolled back, device pins with no error anywhere. */
describe('the table missing', () => {
  it.each(['42P01', 'PGRST205', 'PGRST202'])('%s: device pins, no toast, no console error, no channel', async (code) => {
    const { useConversationPins, pinned } = await load();
    pinned.writePinned('me', 't1', ['b']);
    const f = fakeDb({ readError: { code } });
    createClient.mockReturnValue(f.db);
    const { result } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(result.current.ids).toEqual(['b']));
    expect(toast).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(f.db.channel).not.toHaveBeenCalled();
  });

  it('a toggle stays on the device, with no request', async () => {
    const { useConversationPins, pinned } = await load();
    const f = fakeDb({ readError: { code: '42P01' } });
    createClient.mockReturnValue(f.db);
    const { result } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.reads).toBe(1));
    act(() => result.current.toggle('a'));
    await waitFor(() => expect(pinned.readPinned('me', 't1')).toEqual(['a']));
    expect(f.db.rpc).not.toHaveBeenCalled();
  });

  it('remembers for five minutes, then asks again', async () => {
    const { useConversationPins } = await load();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const f = fakeDb({ readError: { code: '42P01' } });
    createClient.mockReturnValue(f.db);
    const first = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.reads).toBe(1));
    first.unmount();
    // Inside the five minutes: no probe at all.
    now.mockReturnValue(1_000_000 + 5 * 60_000 - 1);
    const second = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(f.calls.reads).toBe(1);
    second.unmount();
    // Past them, the server is picked up by itself after the owner applies.
    now.mockReturnValue(1_000_000 + 5 * 60_000 + 1);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.reads).toBe(2));
  });

  it('a failure that is not "missing" is not remembered', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ readError: { code: '500' } });
    createClient.mockReturnValue(f.db);
    const one = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.reads).toBe(1));
    one.unmount();
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.reads).toBe(2));
  });

  it('flag off: no client and no request', async () => {
    const { useConversationPins } = await load();
    renderHook(() => useConversationPins('me', 't1', IDS, false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

/** MSG-PIN-05. */
describe('pin and unpin', () => {
  const ready = async (f: ReturnType<typeof fakeDb>) => {
    const { useConversationPins } = await load();
    createClient.mockReturnValue(f.db);
    const hook = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.channel).toHaveBeenCalled());
    return hook;
  };

  it('is optimistic, and the returned list replaces the local one', async () => {
    const f = fakeDb({ list: ['a'], rpc: () => ({ data: { pins: ['b', 'a'] }, error: null }) });
    const { result } = await ready(f);
    expect(result.current.ids).toEqual(['a']);
    act(() => result.current.toggle('b'));
    expect(result.current.ids).toEqual(['a', 'b']);
    await waitFor(() => expect(result.current.ids).toEqual(['b', 'a']));
    expect(f.calls.rpc.at(-1)).toEqual({ p_conversation_id: 'b', p_pinned: true });
    expect(toast).not.toHaveBeenCalled();
  });

  it('unpin sends false', async () => {
    const f = fakeDb({ list: ['a'], rpc: () => ({ data: { pins: [] }, error: null }) });
    const { result } = await ready(f);
    act(() => result.current.toggle('a'));
    await waitFor(() => expect(result.current.ids).toEqual([]));
    expect(f.calls.rpc.at(-1)).toEqual({ p_conversation_id: 'a', p_pinned: false });
  });

  it('pin_limit reverts and says the one line', async () => {
    const f = fakeDb({ list: ['a'], rpc: () => ({ data: null, error: { message: 'pin_limit' } }) });
    const { result } = await ready(f);
    act(() => result.current.toggle('b'));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith({ title: 'You already have 3 pinned.' });
    expect(result.current.ids).toEqual(['a']);
  });

  it('pin_limit takes the server’s list when the refusal carries one', async () => {
    const f = fakeDb({ list: ['a'], rpc: () => ({ data: null, error: { message: 'pin_limit', details: JSON.stringify(['a', 'c', 'd']) } }) });
    const { result } = await ready(f);
    act(() => result.current.toggle('b'));
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'c', 'd']));
    expect(result.current.atLimit).toBe(true);
  });

  it('not_a_member says its line and drops the row', async () => {
    const f = fakeDb({ list: ['a', 'b'], rpc: () => ({ data: null, error: { message: 'not_a_member' } }) });
    const { result } = await ready(f);
    act(() => result.current.toggle('a'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'You’re not in this conversation anymore.' }));
    expect(result.current.ids).toEqual(['b']);
  });

  it('any other failure reverts with no toast', async () => {
    const f = fakeDb({ list: ['a'], rpc: () => ({ data: null, error: { message: 'boom' } }) });
    const { result } = await ready(f);
    act(() => result.current.toggle('b'));
    expect(result.current.ids).toEqual(['a', 'b']);
    await waitFor(() => expect(result.current.ids).toEqual(['a']));
    expect(toast).not.toHaveBeenCalled();
  });

  it('offline: the last tap wins, sent once on reconnect', async () => {
    const f = fakeDb({ list: [], rpc: () => ({ data: { pins: [] }, error: null }) });
    const { result } = await ready(f);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => result.current.toggle('a'));
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(result.current.ids).toEqual(['a']);
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('a'));
    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(f.calls.rpc).toEqual([{ p_conversation_id: 'a', p_pinned: true }]);
  });
});

/** MSG-PIN-06. */
describe('the private topic', () => {
  it('joins golf-pins:<uid> privately, after setAuth', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: [] });
    createClient.mockReturnValue(f.db);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.channel).toHaveBeenCalled());
    expect(f.db.channel).toHaveBeenCalledWith('golf-pins:me', { config: { private: true } });
    expect(f.order).toEqual(['setAuth', 'channel']);
    expect(f.channel.on).toHaveBeenCalledWith('broadcast', { event: 'pins' }, expect.any(Function));
  });

  it('refetches on its own team’s broadcast only', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: [] });
    createClient.mockReturnValue(f.db);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.channel).toHaveBeenCalled());
    const before = f.calls.reads;
    act(() => f.broadcast('t2'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(f.calls.reads).toBe(before);
    act(() => f.broadcast('t1'));
    await waitFor(() => expect(f.calls.reads).toBe(before + 1));
  });

  it('refetches on focus and on a rejoin, not on the first join', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: [] });
    createClient.mockReturnValue(f.db);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.channel).toHaveBeenCalled());
    const joined = f.calls.reads;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(f.calls.reads).toBe(joined + 1));
    act(() => f.status('SUBSCRIBED'));
    await waitFor(() => expect(f.calls.reads).toBe(joined + 2));
  });

  it('leaves on unmount', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: [] });
    createClient.mockReturnValue(f.db);
    const { unmount } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.channel).toHaveBeenCalled());
    unmount();
    expect(f.db.removeChannel).toHaveBeenCalledTimes(1);
    const after = f.calls.reads;
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 0));
    expect(f.calls.reads).toBe(after);
  });
});

/** MSG-PIN-10, D1 to D9 that a hook can hold. */
describe('the defaults', () => {
  it('reads per team, and a team-less inbox reads the null team', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: [] });
    createClient.mockReturnValue(f.db);
    const a = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.calls.eqs).toContainEqual(['team_id', 't1']));
    a.unmount();
    renderHook(() => useConversationPins('me', '', IDS, true));
    await waitFor(() => expect(f.calls.nulls).toContain('team_id'));
  });

  it('a pin no longer in the inbox does not show, but still counts toward the limit', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: ['a', 'gone', 'b'] });
    createClient.mockReturnValue(f.db);
    const { result } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'b']));
    expect(result.current.atLimit).toBe(true);
    expect(result.current.has('gone')).toBe(false);
  });

  it('the fourth pin changes nothing locally and sends nothing', async () => {
    const { useConversationPins } = await load();
    const f = fakeDb({ list: ['a', 'b', 'c'] });
    createClient.mockReturnValue(f.db);
    const { result } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'b', 'c']));
    act(() => result.current.toggle('d'));
    expect(result.current.ids).toEqual(['a', 'b', 'c']);
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('imports this device’s pins once, in order, then clears them and sets the key', async () => {
    const { useConversationPins, pinned } = await load();
    pinned.writePinned('me', 't1', ['b', 'c']);
    let server: string[] = [];
    const f = fakeDb({
      list: [],
      rpc: (a) => {
        server = [...server, a.p_conversation_id as string];
        return { data: { pins: server }, error: null };
      },
    });
    createClient.mockReturnValue(f.db);
    const { result, unmount } = renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(localStorage.getItem('ch:msg:pins-imported:me:t1')).toBe('1'));
    expect(f.calls.rpc.map((a) => a.p_conversation_id)).toEqual(['b', 'c']);
    expect(pinned.readPinned('me', 't1')).toEqual([]);
    expect(result.current.ids).toEqual(['b', 'c']);
    unmount();
    // Already imported: a later device pin is not sent again.
    pinned.writePinned('me', 't1', ['d']);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(f.calls.rpc).toHaveLength(2);
  });

  it('the import skips a pin not in this inbox, and stops at the cap', async () => {
    const { useConversationPins, pinned } = await load();
    pinned.writePinned('me', 't1', ['gone', 'd']);
    const f = fakeDb({ list: ['a', 'b', 'c'] });
    createClient.mockReturnValue(f.db);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(localStorage.getItem('ch:msg:pins-imported:me:t1')).toBe('1'));
    expect(f.db.rpc).not.toHaveBeenCalled();
  });

  it('the import stops on an unknown failure and leaves the key unset, so it runs again', async () => {
    const { useConversationPins, pinned } = await load();
    pinned.writePinned('me', 't1', ['b']);
    const f = fakeDb({ list: [], rpc: () => ({ data: null, error: { message: 'boom' } }) });
    createClient.mockReturnValue(f.db);
    renderHook(() => useConversationPins('me', 't1', IDS, true));
    await waitFor(() => expect(f.db.rpc).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(localStorage.getItem('ch:msg:pins-imported:me:t1')).toBeNull();
    expect(pinned.readPinned('me', 't1')).toEqual(['b']);
  });
});
