import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-10: the shared class-day cache. One fetch per team however many readers; nothing at all when disabled; an
 * unavailable RPC reads as "no status"; a failed refresh keeps the last good payload until it is 15 minutes old; the
 * five minute refresh; the realtime channel only while someone reads.
 */

const rpc = vi.hoisted(() => vi.fn());
const channels = vi.hoisted(() => ({ made: [] as string[], removed: 0, handlers: [] as Array<{ filter: { event: string; filter?: string }; cb: () => void }> }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    channel: (name: string) => {
      channels.made.push(name);
      const ch = {
        on: (_t: string, filter: { event: string; filter?: string }, cb: () => void) => {
          channels.handlers.push({ filter, cb });
          return ch;
        },
      };
      return ch;
    },
    removeChannel: () => {
      channels.removed += 1;
    },
  }),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (c: unknown) => c }));

import { __resetClassDayStoresForTests, CLASS_DAY_DELETE_DEBOUNCE_MS, CLASS_DAY_REFRESH_MS, CLASS_DAY_STALE_MS, refetchTeamClassDay, useMyClassDay, useTeamClassDay } from '../use-class-day';

const payload = (on = '2026-10-26') => ({ on, team_time_zone: 'America/New_York', class_time_zone: 'America/New_York', term: null, next_term: null, players: [] });
const NOW = Date.parse('2026-10-26T14:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
  rpc.mockReset();
  channels.made.length = 0;
  channels.removed = 0;
  channels.handlers.length = 0;
});
afterEach(() => {
  cleanup();
  __resetClassDayStoresForTests();
  vi.useRealTimers();
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useTeamClassDay', () => {
  it('fetches nothing and subscribes to nothing while disabled (the flag is off)', async () => {
    const { result } = renderHook(() => useTeamClassDay('team-1', { enabled: false }));
    await flush(10 * 60_000);
    expect(rpc).not.toHaveBeenCalled();
    expect(channels.made).toEqual([]);
    expect(result.current.day).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('fetches nothing without a team', async () => {
    renderHook(() => useTeamClassDay(null));
    await flush(1000);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('two readers of one team share one fetch and one channel', async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    const a = renderHook(() => useTeamClassDay('team-1'));
    const b = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('golf_team_class_day', { p_team_id: 'team-1', p_on: null });
    expect(a.result.current.day?.on).toBe('2026-10-26');
    expect(b.result.current.day?.on).toBe('2026-10-26');
    expect(channels.made).toEqual(['class-exceptions:team-1']);
    a.unmount();
    expect(channels.removed).toBe(0);
    b.unmount();
    expect(channels.removed).toBe(1);
  });

  it('an RPC that is not there (the migrations are held) reads as no status, not an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no function' } });
    const { result } = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(result.current.day).toBeNull();
    expect(result.current.status).toBe('ready');
  });

  it('a refused call and a payload that does not parse also read as no status', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
    const { result, unmount } = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(result.current.status).toBe('ready');
    expect(result.current.day).toBeNull();
    unmount();
    __resetClassDayStoresForTests();
    rpc.mockResolvedValueOnce({ data: { nonsense: true }, error: null });
    const again = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(again.result.current.day).toBeNull();
  });

  it('refreshes every five minutes while visible', async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(rpc).toHaveBeenCalledTimes(1);
    await flush(CLASS_DAY_REFRESH_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh keeps the last good payload until it is 15 minutes old, then claims nothing', async () => {
    rpc.mockResolvedValueOnce({ data: payload(), error: null });
    rpc.mockResolvedValue({ data: null, error: { code: '500', message: 'down' } });
    const { result } = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(result.current.day).not.toBeNull();
    await flush(CLASS_DAY_REFRESH_MS);
    expect(result.current.status).toBe('error');
    expect(result.current.day).not.toBeNull();
    await flush(CLASS_DAY_STALE_MS);
    expect(result.current.day).toBeNull();
  });

  it('a new reader after the first gets the cached payload without another fetch', async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    const first = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    const second = renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    expect(second.result.current.day?.on).toBe('2026-10-26');
    expect(rpc).toHaveBeenCalledTimes(1);
    first.unmount();
  });

  it('refetchTeamClassDay refreshes what readers hold, and does nothing when nobody reads', async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    await act(async () => void (await refetchTeamClassDay('team-9')));
    expect(rpc).not.toHaveBeenCalled();
    renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    await act(async () => void (await refetchTeamClassDay('team-1')));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('listens for a new exception row of its team and for any delete, which it refetches once after a pause', async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    renderHook(() => useTeamClassDay('team-1'));
    await flush(10);
    const insert = channels.handlers.find((h) => h.filter.event === 'INSERT')!;
    const del = channels.handlers.find((h) => h.filter.event === 'DELETE')!;
    expect(insert.filter.filter).toBe('team_id=eq.team-1');
    expect(del.filter.filter).toBeUndefined();
    await act(async () => insert.cb());
    await flush(10);
    expect(rpc).toHaveBeenCalledTimes(2);
    await act(async () => {
      del.cb();
      del.cb();
    });
    await flush(CLASS_DAY_DELETE_DEBOUNCE_MS - 10);
    expect(rpc).toHaveBeenCalledTimes(2);
    await flush(20);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('useMyClassDay', () => {
  it('reads the player’s own day, with no channel', async () => {
    rpc.mockResolvedValue({ data: { ...payload(), team_id: 'team-1', settings: { share_status: true, hold_pushes: true }, player: null, blocks: [], untagged_classes: 0, unusable_classes: [], held: null }, error: null });
    const { result } = renderHook(() => useMyClassDay());
    await flush(10);
    expect(rpc).toHaveBeenCalledWith('golf_my_class_day', { p_on: null });
    expect(result.current.day?.teamId).toBe('team-1');
    expect(channels.made).toEqual([]);
  });

  it('is off when disabled', async () => {
    render(<span />);
    renderHook(() => useMyClassDay({ enabled: false }));
    await flush(10);
    expect(rpc).not.toHaveBeenCalled();
  });
});
