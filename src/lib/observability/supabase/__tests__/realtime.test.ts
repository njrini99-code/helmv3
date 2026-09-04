import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordHelmBreadcrumb: vi.fn(),
  helmLogWarn: vi.fn(),
  recordRealtimeChannelFailure: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../../client-breadcrumbs', () => ({ recordHelmBreadcrumb: mocks.recordHelmBreadcrumb }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../metrics', () => ({ recordRealtimeChannelFailure: mocks.recordRealtimeChannelFailure }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import {
  observeRealtimeChannel,
  createRealtimeActivityMonitor,
  __resetRealtimeCaptureDedupeForTests,
  type RealtimeChannelLike,
} from '../realtime';

class FakeChannel implements RealtimeChannelLike {
  private cb: ((status: string, err?: Error) => void) | undefined;
  subscribe(callback?: (status: string, err?: Error) => void): unknown {
    this.cb = callback;
    return this;
  }
  emit(status: string, err?: Error): void {
    this.cb?.(status, err);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeCaptureDedupeForTests();
});

const baseOptions = { feature: 'golf.tasks', channelClass: 'golf_task_assignments', subscriptionType: 'postgres_changes' as const };

describe('observeRealtimeChannel', () => {
  // The Sentry capture is deferred by TRANSPORT_FAILURE_GRACE_MS so a blip
  // that self-heals never opens an issue — every assertion about a capture
  // therefore has to say explicitly whether the window elapsed. Fake timers
  // are scoped to THIS describe: createRealtimeActivityMonitor's tests below
  // measure real elapsed time.
  const GRACE_MS = 30_000;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the SAME channel .subscribe() would have — cleanup via removeChannel(channel) keeps working', () => {
    const fake = new FakeChannel();
    const returned = observeRealtimeChannel(fake, baseOptions);
    expect(returned).toBe(fake);
  });

  it('preserves the caller\'s own onStatus callback, called with the same (status, err)', () => {
    const fake = new FakeChannel();
    const onStatus = vi.fn();
    const channel = observeRealtimeChannel(fake, { ...baseOptions, onStatus }) as FakeChannel;
    channel.emit('SUBSCRIBED');
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED', undefined);
  });

  it('SUBSCRIBED: breadcrumb only, no metric, no Sentry capture', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('SUBSCRIBED');
    expect(mocks.recordHelmBreadcrumb).toHaveBeenCalledWith('realtime', 'realtime.subscribed', expect.objectContaining({ feature: 'golf.tasks' }));
    expect(mocks.recordRealtimeChannelFailure).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('a second SUBSCRIBED counts as a reconnect, not a fresh connect', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('SUBSCRIBED');
    channel.emit('CHANNEL_ERROR');
    channel.emit('SUBSCRIBED');
    expect(mocks.recordHelmBreadcrumb).toHaveBeenCalledWith(
      'realtime',
      'realtime.reconnected',
      expect.objectContaining({ count: 1 }),
    );
  });

  it('CHANNEL_ERROR: metric + warn log immediately, Sentry captureMessage only once the grace window elapses', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('CHANNEL_ERROR', new Error('boom'));

    // The RATE signal is never deferred — Bridge still counts every
    // occurrence, including the ones that go on to self-heal.
    expect(mocks.recordRealtimeChannelFailure).toHaveBeenCalledWith({ feature: 'golf.tasks', result: 'CHANNEL_ERROR' });
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
    expect(mocks.captureMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('CHANNEL_ERROR'),
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({
          'helm.feature': 'golf.tasks',
          'supabase.service': 'realtime',
          'supabase.operation': 'subscribe',
          'realtime.state': 'CHANNEL_ERROR',
        }),
      }),
    );
  });

  it('TIMED_OUT: warning level, still captured once the window elapses', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('TIMED_OUT');
    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ level: 'warning' }));
  });

  it('a transport failure that RECOVERS inside the window opens no issue at all', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('SUBSCRIBED');
    channel.emit('CHANNEL_ERROR');
    vi.advanceTimersByTime(GRACE_MS - 1);
    channel.emit('SUBSCRIBED'); // realtime-js reconnected on its own
    vi.advanceTimersByTime(GRACE_MS * 2);

    // This is the /golf/dashboard/calendar case: the hook refetches on
    // re-SUBSCRIBED, so the user lost nothing and there is no incident.
    expect(mocks.captureMessage).not.toHaveBeenCalled();
    // ...but the occurrence is still counted.
    expect(mocks.recordRealtimeChannelFailure).toHaveBeenCalledTimes(1);
  });

  it('a transport failure that NEVER recovers still opens an issue — the honest signal survives', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('CHANNEL_ERROR');
    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a reconnect LOOP queues one deferred capture, not one per failed attempt', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    for (let i = 0; i < 5; i += 1) channel.emit('CHANNEL_ERROR');
    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocks.recordRealtimeChannelFailure).toHaveBeenCalledTimes(5);
  });

  it('CLOSED cancels a pending capture — an unmount mid-blip is not an outage', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('CHANNEL_ERROR');
    channel.emit('CLOSED'); // supabase.removeChannel() during cleanup
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('CLOSED: breadcrumb only — no metric, no capture (ambiguous: unmount vs forced close)', () => {
    const fake = new FakeChannel();
    const channel = observeRealtimeChannel(fake, baseOptions) as FakeChannel;
    channel.emit('CLOSED');
    expect(mocks.recordHelmBreadcrumb).toHaveBeenCalledWith('realtime', 'realtime.closed', expect.objectContaining({ feature: 'golf.tasks' }));
    expect(mocks.recordRealtimeChannelFailure).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('dedupes Sentry captureMessage to ONCE per channelClass per session', () => {
    const fake1 = new FakeChannel();
    const channel1 = observeRealtimeChannel(fake1, baseOptions) as FakeChannel;
    channel1.emit('CHANNEL_ERROR');
    channel1.emit('CHANNEL_ERROR');

    const fake2 = new FakeChannel();
    const channel2 = observeRealtimeChannel(fake2, baseOptions) as FakeChannel; // same channelClass, different channel instance
    channel2.emit('TIMED_OUT');

    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a different channelClass gets its own captureMessage budget', () => {
    const fakeA = new FakeChannel();
    observeRealtimeChannel(fakeA, baseOptions);
    (fakeA as unknown as FakeChannel).emit('CHANNEL_ERROR');

    const fakeB = new FakeChannel();
    const channelB = observeRealtimeChannel(fakeB, { ...baseOptions, channelClass: 'golf_qualifiers' }) as FakeChannel;
    channelB.emit('CHANNEL_ERROR');

    vi.advanceTimersByTime(GRACE_MS);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('never throws even when subscribe itself throws synchronously', () => {
    const throwingChannel: RealtimeChannelLike = {
      subscribe: () => {
        throw new Error('sync failure');
      },
    };
    expect(() => observeRealtimeChannel(throwingChannel, baseOptions)).not.toThrow();
  });

  it("a throwing caller onStatus callback does not prevent this file's own observation", () => {
    const fake = new FakeChannel();
    const onStatus = () => {
      throw new Error('caller bug');
    };
    const channel = observeRealtimeChannel(fake, { ...baseOptions, onStatus }) as FakeChannel;
    expect(() => channel.emit('CHANNEL_ERROR')).not.toThrow();
    expect(mocks.recordRealtimeChannelFailure).toHaveBeenCalledTimes(1);
  });
});

describe('createRealtimeActivityMonitor', () => {
  it('lastMessageAt is null before any recordMessage() call', () => {
    const monitor = createRealtimeActivityMonitor({});
    expect(monitor.lastMessageAt()).toBeNull();
  });

  it('lastMessageAt reflects the most recent recordMessage() call', () => {
    const monitor = createRealtimeActivityMonitor({});
    monitor.recordMessage();
    expect(monitor.lastMessageAt()).not.toBeNull();
  });

  it('isSilentlyStalled is false when no expectedSignalWithinMs was given', () => {
    const monitor = createRealtimeActivityMonitor({});
    expect(monitor.isSilentlyStalled()).toBe(false);
  });

  it('isSilentlyStalled is false once a message has arrived, even past the window', async () => {
    vi.useFakeTimers();
    try {
      const monitor = createRealtimeActivityMonitor({ expectedSignalWithinMs: 10 });
      monitor.recordMessage();
      vi.advanceTimersByTime(50);
      expect(monitor.isSilentlyStalled()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isSilentlyStalled is true once the window elapses with no message', () => {
    vi.useFakeTimers();
    try {
      const monitor = createRealtimeActivityMonitor({ expectedSignalWithinMs: 10 });
      vi.advanceTimersByTime(50);
      expect(monitor.isSilentlyStalled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isSilentlyStalled is false before the window elapses', () => {
    vi.useFakeTimers();
    try {
      const monitor = createRealtimeActivityMonitor({ expectedSignalWithinMs: 1000 });
      vi.advanceTimersByTime(10);
      expect(monitor.isSilentlyStalled()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws even under adversarial options', () => {
    const monitor = createRealtimeActivityMonitor({ expectedSignalWithinMs: NaN });
    expect(() => monitor.isSilentlyStalled()).not.toThrow();
    expect(() => monitor.recordMessage()).not.toThrow();
  });
});
