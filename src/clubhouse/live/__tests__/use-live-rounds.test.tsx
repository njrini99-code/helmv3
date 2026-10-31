// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { fakeServer, type ChFakeTables } from '../../__tests__/supabase-fake';
import type { LiveClient } from '../live-queries';
import { laneFromPollRow, type PollRoundRow } from '../live-rounds-adapter';
import { EMPTY_SNAPSHOT, type LiveSnapshot } from '../model';
import { BACKOFF_MS, HIDDEN_LEAVE_MS, POLL_MS, QUEUE_MS, SNAPSHOT_MS, useLiveRounds, type LiveChannel, type LiveRealtime } from '../use-live-rounds';

const absent = { error: { code: '42P01', message: 'relation does not exist' } };
const NOW = new Date('2026-10-14T18:40:00Z');
const names = { 'rpc:golf_player_profiles': { data: [{ id: 'p1', first_name: 'Sofia', last_name: 'Reyes' }] } };

const round = (scores: Array<number | null>, over: Partial<PollRoundRow> = {}): PollRoundRow => ({
  id: 'r1', player_id: 'p1', team_id: 't1', round_type: 'qualifier', qualifier_id: 'q1', qualifier_round_number: 1, round_date: '2026-10-14', course_id: null, course_name: 'Pine', holes_played: 18, current_hole: 1,
  status: 'in_progress', created_at: '2026-10-14T17:00:00Z', updated_at: '2026-10-14T18:38:00Z', plan: null, start_hole: null,
  golf_holes: scores.map((s, i) => ({ hole_number: i + 1, par: 4, score: s, yardage: 380 })), ...over,
});

const tables: { current: ChFakeTables } = { current: {} };
const set = (rows: PollRoundRow[], extra: ChFakeTables = names) => {
  tables.current = { golf_round_live: absent, golf_rounds: { data: rows }, golf_tournament_player_rounds: absent, golf_tournament_rounds: absent, ...extra };
};

function snapshot(rows: PollRoundRow[]): LiveSnapshot {
  const roster = { p1: 'Sofia Reyes' };
  return { ...EMPTY_SNAPSHOT('t1'), lanes: rows.map((r) => laneFromPollRow(r, roster)!), roster, source: 'poll', fetchedAt: NOW.toISOString() };
}

let visible = true;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  visible = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The hook reads through an async client; let what it awaits settle under fake timers. */
const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** A Realtime client whose channels the test drives: `status` is what the server tells the subscribe callback, `send` a broadcast. */
function fakeRealtime() {
  type Rec = { topic: string; private: boolean; handlers: Record<string, (m: { payload?: unknown }) => void>; status: (s: string) => void; removed: boolean };
  const channels: Rec[] = [];
  const rt: LiveRealtime = {
    setAuth: vi.fn(),
    channel: (topic, options) => {
      const rec: Rec = { topic, private: options.config.private, handlers: {}, status: () => {}, removed: false };
      channels.push(rec);
      const ch: LiveChannel & { rec: Rec } = {
        rec,
        on: (_type, filter, cb) => {
          rec.handlers[filter.event] = cb;
          return ch;
        },
        subscribe: (cb) => {
          rec.status = cb;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: vi.fn((ch) => {
      (ch as unknown as { rec: Rec }).rec.removed = true;
    }),
  };
  const live = () => channels.filter((c) => !c.removed);
  return { rt, channels, live };
}

async function rig(rows: PollRoundRow[], opts: { hold?: boolean; frozen?: boolean; role?: 'coach' | 'player'; listen?: boolean; realtime?: LiveRealtime; viewerOnCourse?: boolean } = {}) {
  set(rows);
  const sb = (await fakeServer(tables).createClient()) as unknown as LiveClient;
  const seen: string[] = [];
  const spy = { ...sb, from: (t: string) => (seen.push(t), (sb as never as { from: (t: string) => unknown }).from(t)) } as unknown as LiveClient;
  // The initial snapshot is one object for the life of the screen, as the server hands it to the page.
  const initial = { ...snapshot(rows), viewerOnCourse: opts.viewerOnCourse ?? false };
  // Without a channel of the test's own, the hook gets one that never connects: the poll alone keeps the screen current.
  const realtime = opts.realtime ?? fakeRealtime().rt;
  const view = renderHook((props: { hold: boolean }) => useLiveRounds({ initial, role: opts.role ?? 'coach', listen: opts.listen, hold: props.hold, frozen: opts.frozen, client: () => spy, realtime: () => realtime }), { initialProps: { hold: opts.hold ?? false } });
  return { ...view, seen };
}

describe('useLiveRounds', () => {
  it('shows the server snapshot and moves nothing on first paint', async () => {
    const { result } = await rig([round([4, 4])]);
    expect(result.current.lanes).toHaveLength(1);
    expect(result.current.changes.size).toBe(0);
    expect(result.current.moments).toEqual([]);
    expect(result.current.feed).toBe('connecting');
  });

  it('reads every 20 seconds, lets a new score in after the one-second queue, and writes the news', async () => {
    const { result } = await rig([round([4, 4])]);
    set([round([4, 4, 3], { updated_at: '2026-10-14T18:40:10Z' })]);
    await flush(POLL_MS + 10);
    expect(result.current.feed).toBe('live');
    // Queued for a second: not on screen yet.
    expect(result.current.lanes[0]!.thru).toBe(2);
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes[0]!.thru).toBe(3);
    expect(result.current.changes.get('r1')).toMatchObject({ holes: [3], wash: 'under', late: false });
    expect(result.current.moments.map((m) => m.text)).toEqual(['Birdie on 3']);
  });

  it('holds an update while the pointer is on the list, counts it, and lands it on applyPending', async () => {
    const { result } = await rig([round([4, 4])], { hold: true });
    set([round([4, 4, 5], { updated_at: '2026-10-14T18:40:10Z' })]);
    await flush(POLL_MS + 10);
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes[0]!.thru).toBe(2);
    expect(result.current.pending).toBe(1);
    act(() => result.current.applyPending());
    expect(result.current.lanes[0]!.thru).toBe(3);
    expect(result.current.pending).toBe(0);
  });

  it('two holes in one read is a late batch: one Caught up line and no wash', async () => {
    const { result } = await rig([round([4, 4])]);
    set([round([4, 4, 3, 5], { updated_at: '2026-10-14T18:40:10Z' })]);
    await flush(POLL_MS + 10);
    await flush(QUEUE_MS + 10);
    expect(result.current.changes.get('r1')).toMatchObject({ holes: [3, 4], wash: null, late: true });
    expect(result.current.moments.map((m) => m.text)).toContain('Caught up · thru 4');
  });

  it('keeps the lanes and goes to paused when a read fails; the next good read brings it back', async () => {
    const { result } = await rig([round([4, 4])]);
    tables.current = { golf_round_live: { error: { code: 'XX', message: 'boom' } } };
    await flush(POLL_MS + 10);
    expect(result.current.feed).toBe('paused');
    expect(result.current.lanes).toHaveLength(1);
    set([round([4, 4])]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.feed).toBe('live');
  });

  it('does not poll while the page is hidden, and reads at once when it returns', async () => {
    const { seen } = await rig([round([4, 4])]);
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush(POLL_MS * 3);
    expect(seen).toEqual([]);
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush(10);
    expect(seen).toContain('golf_round_live');
  });

  it('a frozen hook (the preview, a test) never polls', async () => {
    const { result, seen } = await rig([round([4, 4])], { frozen: true });
    await flush(POLL_MS * 2);
    expect(seen).toEqual([]);
    expect(result.current.feed).toBe('live');
  });
});

/** A lane message as the database sends it (8.10). */
const lane = (over: Record<string, unknown>) => ({ v: 1, k: 'lane', r: 'r1', p: 'p1', seq: 5, rt: 'qualifier', d: '2026-10-14', hp: 18, sp: 1, cur: 4, ph: 'on_course', t: 3, tp: -1, st: 11, la: '2026-10-14T18:40:00Z', hd: '2026-10-14T18:40:00Z', sh: 'coaches', late: false, full: false, ...over });
const hole = (n: number, s: number | null) => ({ n, p: 4, y: 380, s, at: s == null ? null : '2026-10-14T18:40:00Z' });

describe('useLiveRounds: the broadcast channel', () => {
  it('joins the coach topic privately, authorises it, and catches up with one snapshot when it connects', async () => {
    const { rt, live } = fakeRealtime();
    const { seen } = await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ topic: 'golf-live:coach:t1', private: true });
    expect(rt.setAuth).toHaveBeenCalled();
    expect(Object.keys(live()[0]!.handlers).sort()).toEqual(['gone', 'hide', 'lane']);
    expect(seen).toEqual([]);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    await flush(10);
    expect(seen).toContain('golf_round_live');
  });

  it('slows the poll to a 60 second snapshot while the channel is up, and back to 20 seconds when it drops', async () => {
    const { rt, live } = fakeRealtime();
    const { seen } = await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    await flush(10);
    seen.length = 0;
    await flush(POLL_MS + 10);
    expect(seen).toEqual([]);
    await flush(SNAPSHOT_MS - POLL_MS);
    expect(seen).toContain('golf_round_live');
    seen.length = 0;
    await act(async () => live()[0]!.status('CHANNEL_ERROR'));
    await flush(POLL_MS + 10);
    expect(seen).toContain('golf_round_live');
  });

  it('applies a lane message through the one-second queue, newest seq only', async () => {
    const { rt, live } = fakeRealtime();
    const { result } = await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    await flush(10);
    const send = (payload: unknown) => act(async () => live()[0]!.handlers.lane!({ payload }));
    await send(lane({ seq: 7, t: 3, tp: -1, h: [hole(3, 3)] }));
    expect(result.current.lanes[0]!.thru).toBe(2);
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes[0]!.thru).toBe(3);
    expect(result.current.lanes[0]!.seq).toBe(7);
    expect(result.current.changes.get('r1')).toMatchObject({ holes: [3], wash: 'under' });
    await send(lane({ seq: 6, t: 2, tp: 0, h: [hole(3, null)] }));
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes[0]!.thru).toBe(3);
  });

  it('a burst of messages composes: two holes in the queue window land together as a late batch', async () => {
    const { rt, live } = fakeRealtime();
    const { result } = await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    const send = (payload: unknown) => act(async () => live()[0]!.handlers.lane!({ payload }));
    await send(lane({ seq: 7, t: 3, tp: -1, h: [hole(3, 3)] }));
    await send(lane({ seq: 8, t: 4, tp: 0, h: [hole(4, 5)] }));
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes[0]!.thru).toBe(4);
    expect(result.current.changes.get('r1')).toMatchObject({ holes: [3, 4], late: true });
  });

  it('hide and gone remove the lane; a partial message for a round it does not know asks for a snapshot', async () => {
    const { rt, live } = fakeRealtime();
    const { result, seen } = await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    await flush(10);
    seen.length = 0;
    await act(async () => live()[0]!.handlers.lane!({ payload: lane({ r: 'r9', p: 'p9', seq: 3, h: [hole(1, 4)] }) }));
    await flush(10);
    expect(seen).toContain('golf_round_live');
    expect(result.current.lanes).toHaveLength(1);
    await act(async () => live()[0]!.handlers.hide!({ payload: { v: 1, k: 'hide', r: 'r1', seq: 50 } }));
    await flush(QUEUE_MS + 10);
    expect(result.current.lanes).toHaveLength(0);
  });

  it('rejoins a dropped channel with a growing backoff, and reports it', async () => {
    const { rt, channels, live } = fakeRealtime();
    await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    expect(channels).toHaveLength(1);
    await act(async () => live()[0]!.status('CHANNEL_ERROR'));
    expect(channels[0]!.removed).toBe(true);
    await flush(BACKOFF_MS[0]! + 10);
    expect(channels).toHaveLength(2);
    await act(async () => live()[0]!.status('TIMED_OUT'));
    await flush(BACKOFF_MS[1]! - 100);
    expect(channels).toHaveLength(2);
    await flush(200);
    expect(channels).toHaveLength(3);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    await act(async () => live()[0]!.status('CLOSED'));
    // A good connection resets the backoff to the first delay.
    await flush(BACKOFF_MS[0]! + 10);
    expect(channels).toHaveLength(4);
  });

  it('leaves the channel after five hidden minutes and rejoins on return', async () => {
    const { rt, channels, live } = fakeRealtime();
    await rig([round([4, 4])], { realtime: rt });
    await flush(10);
    await act(async () => live()[0]!.status('SUBSCRIBED'));
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush(HIDDEN_LEAVE_MS - 1000);
    expect(live()).toHaveLength(1);
    await flush(2000);
    expect(live()).toHaveLength(0);
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush(10);
    expect(channels).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it('a player does not listen by default; one who does leaves the team topic while on the course', async () => {
    const own = fakeRealtime();
    await rig([round([4, 4])], { role: 'player', realtime: own.rt });
    await flush(10);
    expect(own.channels).toHaveLength(0);

    const teammates = fakeRealtime();
    await rig([round([4, 4])], { role: 'player', listen: true, realtime: teammates.rt });
    await flush(10);
    expect(teammates.live()[0]).toMatchObject({ topic: 'golf-live:team:t1', private: true });

    const onCourse = fakeRealtime();
    await rig([round([4, 4])], { role: 'player', listen: true, viewerOnCourse: true, realtime: onCourse.rt });
    await flush(10);
    expect(onCourse.channels).toHaveLength(0);
  });

  it('a frozen hook joins nothing', async () => {
    const { rt, channels } = fakeRealtime();
    await rig([round([4, 4])], { frozen: true, realtime: rt });
    await flush(10);
    expect(channels).toHaveLength(0);
  });
});
