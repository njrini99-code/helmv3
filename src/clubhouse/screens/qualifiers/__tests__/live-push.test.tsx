// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const publicChannel = vi.hoisted(() => ({ change: (_p: unknown) => {}, status: (_s: string) => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chan = {
      on: (_k: string, _f: unknown, cb: (p: unknown) => void) => {
        publicChannel.change = cb;
        return chan;
      },
      subscribe: (cb: (s: string) => void) => {
        publicChannel.status = cb;
        return chan;
      },
    };
    return { channel: () => chan, removeChannel: vi.fn() };
  },
}));

import type { LiveChannel, LiveRealtime } from '../../../live/channel';
import { useLiveStandings } from '../live';

function fakeRealtime() {
  const rec = { topic: '', private: false, handlers: {} as Record<string, (m: { payload?: unknown }) => void>, status: (_s: string) => {} };
  const rt: LiveRealtime = {
    setAuth: vi.fn(),
    channel: (topic, options) => {
      rec.topic = topic;
      rec.private = options.config.private;
      const ch: LiveChannel = {
        on: (_t, f, cb) => {
          rec.handlers[f.event] = cb;
          return ch;
        },
        subscribe: (cb) => {
          rec.status = cb;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: vi.fn(),
  };
  return { rt, rec };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
  router.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const flush = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const row = (updated_at: string) => ({ new: { id: 'r1', updated_at, status: 'in_progress' } });

describe('the qualifier page’s push path (held migration 20261025050100)', () => {
  it('joins the team’s coach topic privately', async () => {
    const { rt, rec } = fakeRealtime();
    renderHook(() => useLiveStandings('q1', true, undefined, { teamId: 't1', realtime: () => rt }));
    await flush(10);
    expect(rec).toMatchObject({ topic: 'golf-live:coach:t1', private: true });
  });

  it('a lane message about this qualifier re-reads the page once, after the debounce; one about another does not', async () => {
    const { rt, rec } = fakeRealtime();
    renderHook(() => useLiveStandings('q1', true, undefined, { teamId: 't1', realtime: () => rt }));
    await flush(10);
    await act(async () => rec.status('SUBSCRIBED'));
    rec.handlers.lane!({ payload: { v: 1, k: 'lane', r: 'r1', q: 'q2', seq: 1 } });
    await flush(1000);
    expect(router.refresh).not.toHaveBeenCalled();
    rec.handlers.lane!({ payload: { v: 1, k: 'lane', r: 'r1', q: 'q1', seq: 2 } });
    rec.handlers.lane!({ payload: { v: 1, k: 'lane', r: 'r2', q: 'q1', seq: 3 } });
    await flush(799);
    expect(router.refresh).not.toHaveBeenCalled();
    await flush(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('with the push channel up the autosave storm on golf_rounds no longer re-reads the page; before it is up (or after it drops) it still does', async () => {
    const { rt, rec } = fakeRealtime();
    renderHook(() => useLiveStandings('q1', true, undefined, { teamId: 't1', realtime: () => rt }));
    await flush(10);
    // Not up yet: the postgres_changes feed refreshes, as before.
    publicChannel.change(row('2026-10-14T18:40:01Z'));
    await flush(801);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    await act(async () => rec.status('SUBSCRIBED'));
    publicChannel.change(row('2026-10-14T18:40:07Z'));
    publicChannel.change(row('2026-10-14T18:40:08Z'));
    await flush(10_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    await act(async () => rec.status('CHANNEL_ERROR'));
    publicChannel.change(row('2026-10-14T18:40:20Z'));
    await flush(5_001);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it('hide and gone re-read too, and nothing joins without a team or when the page is not live', async () => {
    const { rt, rec } = fakeRealtime();
    renderHook(() => useLiveStandings('q1', true, undefined, { teamId: 't1', realtime: () => rt }));
    await flush(10);
    rec.handlers.gone!({ payload: { v: 1, k: 'gone', r: 'r1', seq: 4 } });
    await flush(900);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    const none = fakeRealtime();
    renderHook(() => useLiveStandings('q1', true, undefined, { teamId: null, realtime: () => none.rt }));
    renderHook(() => useLiveStandings('q1', false, undefined, { teamId: 't1', realtime: () => none.rt }));
    await flush(10);
    expect(none.rec.topic).toBe('');
  });
});
