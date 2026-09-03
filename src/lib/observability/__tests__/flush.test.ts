import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(async () => true),
  waitUntil: vi.fn((_task: Promise<unknown>) => true),
}));
vi.mock('@sentry/nextjs', () => ({ flush: mocks.flush }));
vi.mock('@/lib/observability/vercel-wait-until', () => ({ vercelWaitUntil: mocks.waitUntil }));

import { scheduleTelemetryFlush, __resetTelemetryFlushForTests, TELEMETRY_FLUSH_TIMEOUT_MS } from '../flush';

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
