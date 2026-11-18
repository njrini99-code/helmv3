// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { chReport } from '../../lib/track';
import { BACKOFF_MS, joinLiveTopic, REPORT_AFTER_FAILURES, type LiveChannel, type LiveRealtime } from '../channel';

/** A Realtime client whose channels the test drives: `status` is what the server tells the subscribe callback. */
function fakeRealtime() {
  type Rec = { status: (s: string) => void; removed: boolean };
  const channels: Rec[] = [];
  const rt: LiveRealtime = {
    setAuth: vi.fn(),
    channel: () => {
      const rec: Rec = { status: () => {}, removed: false };
      channels.push(rec);
      const ch: LiveChannel & { rec: Rec } = {
        rec,
        on: () => ch,
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
  const live = () => channels.filter((c) => !c.removed)[0]!;
  return { rt, channels, live };
}

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('joinLiveTopic: what reaches the Bridge (noise fix for c1ecfd3a, 06e78d3c, 96fc4eb8, 2ab92bbf)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(chReport).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not report a drop that rejoins', async () => {
    const { rt, channels, live } = fakeRealtime();
    const stop = joinLiveTopic({ topic: 't', realtime: () => rt, onMessage: () => {}, onUp: () => {} });
    await flush();
    live().status('SUBSCRIBED');
    live().status('CLOSED');
    await flush(BACKOFF_MS[0] + 10);
    expect(channels).toHaveLength(2);
    live().status('SUBSCRIBED');
    live().status('CHANNEL_ERROR');
    await flush(BACKOFF_MS[0] + 10);
    live().status('SUBSCRIBED');
    expect(chReport).not.toHaveBeenCalled();
    stop();
  });

  it('reports once when the channel cannot come back, and again only after it has recovered', async () => {
    const { rt, live } = fakeRealtime();
    const stop = joinLiveTopic({ topic: 't', realtime: () => rt, onMessage: () => {}, onUp: () => {}, surface: 'qualifiers.push' });
    await flush();
    for (let i = 0; i < REPORT_AFTER_FAILURES + 3; i += 1) {
      live().status('CHANNEL_ERROR');
      await flush(BACKOFF_MS[BACKOFF_MS.length - 1] + 10);
    }
    expect(chReport).toHaveBeenCalledTimes(1);
    expect(vi.mocked(chReport).mock.calls[0]![1]).toMatchObject({ surface: 'qualifiers.push', severity: 'low', extra: { status: 'CHANNEL_ERROR', failures: REPORT_AFTER_FAILURES } });
    live().status('SUBSCRIBED');
    for (let i = 0; i < REPORT_AFTER_FAILURES; i += 1) {
      live().status('TIMED_OUT');
      await flush(BACKOFF_MS[BACKOFF_MS.length - 1] + 10);
    }
    expect(chReport).toHaveBeenCalledTimes(2);
    stop();
  });
});
