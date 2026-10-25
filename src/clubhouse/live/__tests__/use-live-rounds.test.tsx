// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { fakeServer, type ChFakeTables } from '../../__tests__/supabase-fake';
import type { LiveClient } from '../live-queries';
import { laneFromPollRow, type PollRoundRow } from '../live-rounds-adapter';
import { EMPTY_SNAPSHOT, type LiveSnapshot } from '../model';
import { POLL_MS, QUEUE_MS, useLiveRounds } from '../use-live-rounds';

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

async function rig(rows: PollRoundRow[], opts: { hold?: boolean; frozen?: boolean } = {}) {
  set(rows);
  const sb = (await fakeServer(tables).createClient()) as unknown as LiveClient;
  const seen: string[] = [];
  const spy = { ...sb, from: (t: string) => (seen.push(t), (sb as never as { from: (t: string) => unknown }).from(t)) } as unknown as LiveClient;
  // The initial snapshot is one object for the life of the screen, as the server hands it to the page.
  const initial = snapshot(rows);
  const view = renderHook((props: { hold: boolean }) => useLiveRounds({ initial, role: 'coach', hold: props.hold, frozen: opts.frozen, client: () => spy }), { initialProps: { hold: opts.hold ?? false } });
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
