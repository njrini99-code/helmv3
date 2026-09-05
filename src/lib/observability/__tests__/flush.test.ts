import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(async () => true),
  waitUntil: vi.fn((_task: Promise<unknown>) => true),
}));
vi.mock('@sentry/nextjs', () => ({ flush: mocks.flush }));
vi.mock('@/lib/observability/vercel-wait-until', () => ({ vercelWaitUntil: mocks.waitUntil }));

import {
  scheduleTelemetryFlush,
  flushTelemetryNow,
  __resetTelemetryFlushForTests,
  TELEMETRY_FLUSH_TIMEOUT_MS,
} from '../flush';

describe('scheduleTelemetryFlush', () => {
  beforeEach(() => {
    mocks.flush.mockClear();
    mocks.waitUntil.mockClear();
    __resetTelemetryFlushForTests();
  });
  afterEach(() => __resetTelemetryFlushForTests());

  it('registers one bounded Sentry.flush with the Vercel request context', async () => {
    scheduleTelemetryFlush();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(mocks.flush).toHaveBeenCalledWith(TELEMETRY_FLUSH_TIMEOUT_MS);
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    expect(mocks.waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  it('debounces: a burst of emits shares a single in-flight flush', async () => {
    scheduleTelemetryFlush();
    scheduleTelemetryFlush();
    scheduleTelemetryFlush();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it('schedules again once the previous flush settled', async () => {
    scheduleTelemetryFlush();
    await new Promise((r) => setTimeout(r, 0));
    scheduleTelemetryFlush();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });

  it('never throws when flush rejects or waitUntil is unavailable', async () => {
    mocks.flush.mockRejectedValueOnce(new Error('transport down'));
    mocks.waitUntil.mockImplementationOnce(() => {
      throw new Error('no request context');
    });
    expect(() => scheduleTelemetryFlush()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(() => scheduleTelemetryFlush()).not.toThrow();
  });
});

describe('flushTelemetryNow — the terminal emit', () => {
  beforeEach(() => {
    mocks.flush.mockClear();
    mocks.waitUntil.mockClear();
    __resetTelemetryFlushForTests();
  });
  afterEach(() => __resetTelemetryFlushForTests());

  it('registers a bounded Sentry.flush with the Vercel request context', async () => {
    flushTelemetryNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.flush).toHaveBeenCalledWith(TELEMETRY_FLUSH_TIMEOUT_MS);
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    expect(mocks.waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  /**
   * THE INVARIANT THIS FILE EXISTS FOR.
   *
   * `scheduleTelemetryFlush` drops a request while one is in flight, on the
   * premise that the in-flight flush covers it. For the LAST envelope of an
   * invocation that premise is false — `Sentry.flush()` drains what is
   * buffered when it runs, and the terminal emit had not been buffered yet.
   * `finishCronCheckIn` hits this exactly: on the failure path `recordJobRun`
   * has just awaited a `logServerEvent` write, so a flush is in flight when
   * the terminal check-in is captured. If this ever regresses to dedupe, the
   * production symptom is ~95 false "Cron failure" outage events a day from a
   * job that never failed.
   */
  it('is NOT suppressed by an in-flight scheduleTelemetryFlush', async () => {
    scheduleTelemetryFlush(); // a metric/log emit earlier in the request
    flushTelemetryNow(); // the terminal check-in
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.flush).toHaveBeenCalledTimes(2);
    expect(mocks.waitUntil).toHaveBeenCalledTimes(2);
  });

  it('does not consume the debounce slot — a later burst still gets its own flush', async () => {
    flushTelemetryNow();
    scheduleTelemetryFlush();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });

  it('never throws when flush rejects or waitUntil is unavailable', async () => {
    mocks.flush.mockRejectedValueOnce(new Error('transport down'));
    mocks.waitUntil.mockImplementationOnce(() => {
      throw new Error('no request context');
    });
    expect(() => flushTelemetryNow()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(() => flushTelemetryNow()).not.toThrow();
  });
});
