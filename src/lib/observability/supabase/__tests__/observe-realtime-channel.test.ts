import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordDbFailure: vi.fn(),
  helmLogWarn: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordDbFailure: mocks.recordDbFailure }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createRealtimeStatusObserver } from '../observe-realtime-channel';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseCtx = { channelName: 'qualifier_leaderboard', feature: 'qualifier_leaderboard', subscriptionType: 'postgres_changes' };

describe('createRealtimeStatusObserver', () => {
  it('SUBSCRIBED with no prior failure: no metric, no log, state updates', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    observer.onStatus('SUBSCRIBED');
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(observer.getState().lastStatus).toBe('SUBSCRIBED');
    expect(observer.getState().reconnectCount).toBe(0);
  });

  it('CHANNEL_ERROR records the DB-failure metric and logs a warning', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    observer.onStatus('CHANNEL_ERROR');
    expect(mocks.recordDbFailure).toHaveBeenCalledTimes(1);
    expect(mocks.recordDbFailure).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'qualifier_leaderboard', errorCode: 'CHANNEL_ERROR', runtime: 'browser' }),
    );
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
  });

  it('TIMED_OUT records the DB-failure metric', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    observer.onStatus('TIMED_OUT');
    expect(mocks.recordDbFailure).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'TIMED_OUT' }));
  });

  it('reconnect after a failure increments reconnectCount exactly once per recovery', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    observer.onStatus('SUBSCRIBED');
    observer.onStatus('CHANNEL_ERROR');
    observer.onStatus('SUBSCRIBED');
    expect(observer.getState().reconnectCount).toBe(1);
    observer.onStatus('CHANNEL_ERROR');
    observer.onStatus('SUBSCRIBED');
    expect(observer.getState().reconnectCount).toBe(2);
  });

  it('a first-ever CLOSED (never subscribed) logs a warning but does NOT record a failure metric', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    observer.onStatus('CLOSED');
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
  });

  it('onMessage updates lastSuccessfulMessageAt', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    expect(observer.getState().lastSuccessfulMessageAt).toBeNull();
    observer.onMessage();
    expect(observer.getState().lastSuccessfulMessageAt).not.toBeNull();
  });

  it('never throws even when called with an unexpected status value', () => {
    const observer = createRealtimeStatusObserver(baseCtx);
    expect(() => observer.onStatus('SOMETHING_NEW' as never)).not.toThrow();
  });
});
