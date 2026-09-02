import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Process-level rejections reached Sentry (6 on 2026-09-01) and never the
 * Bridge (0 `process.*` rows in 60 days). The handler `void`ed a dynamic
 * import chained to a write. These pin the replacement: the write is awaited
 * under a bound, handed to the platform's waitUntil when one exists, and
 * still rate-limited.
 */
const mocks = vi.hoisted(() => ({
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
  captureException: vi.fn(),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerException: mocks.logServerException }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import {
  handleUnhandledRejection,
  handleUncaughtException,
  registerProcessErrorHandlers,
  BRIDGE_PROCESS_WRITE_TIMEOUT_MS,
  __resetProcessErrorHandlersForTests,
} from '@/lib/observability/register-process-error-handlers';
import { __setVercelRequestContextForTests } from '@/lib/observability/vercel-wait-until';

describe('process-level error handlers', () => {
  beforeEach(() => {
    mocks.logServerException.mockClear();
    mocks.logServerException.mockImplementation(async () => {});
    mocks.captureException.mockClear();
    __resetProcessErrorHandlersForTests();
  });
  afterEach(() => {
    __setVercelRequestContextForTests(null);
    vi.useRealTimers();
  });

  it('AWAITS the Bridge write for an unhandled rejection — it resolves only after logServerException did', async () => {
    let settled = false;
    mocks.logServerException.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      settled = true;
    });
    const boom = new Error('other side closed');

    const outcome = await handleUnhandledRejection(boom);

    expect(outcome).toBe('written');
    expect(settled).toBe(true);
    expect(mocks.captureException).toHaveBeenCalledWith(boom);
    const [err, ctx, severity] = mocks.logServerException.mock.calls[0] as [Error, Record<string, unknown>, string];
    expect(err).toBe(boom);
    expect(ctx).toMatchObject({ action: 'process.unhandledRejection', source: 'background_job', handled: false });
    expect(severity).toBe('error');
  });

  it('wraps a non-Error rejection reason and keeps it in metadata', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleUnhandledRejection('a string reason');
    const [err, ctx] = mocks.logServerException.mock.calls[0] as [Error, Record<string, unknown>];
    expect(err.name).toBe('UnhandledRejection');
    expect(err.message).toContain('a string reason');
    expect(ctx.metadata).toEqual({ reason: 'a string reason' });
    consoleError.mockRestore();
  });

  it('bounds the wait — a hung write resolves timed_out instead of wedging the handler', async () => {
    vi.useFakeTimers();
    mocks.logServerException.mockImplementation(() => new Promise(() => {}));

    const pending = handleUncaughtException(new Error('hang'));
    await vi.advanceTimersByTimeAsync(BRIDGE_PROCESS_WRITE_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBe('timed_out');
  });

  it('hands the write to the platform waitUntil when a Vercel request context exists', async () => {
    const waitUntil = vi.fn();
    __setVercelRequestContextForTests({ waitUntil });

    await handleUncaughtException(new Error('boom'));

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0]![0]).toBeInstanceOf(Promise);
  });

  it('rate-limits to 20 writes a minute across both handlers', async () => {
    for (let i = 0; i < 20; i++) await handleUncaughtException(new Error(`e${i}`));
    expect(await handleUnhandledRejection(new Error('21st'))).toBe('rate_limited');
    expect(mocks.logServerException).toHaveBeenCalledTimes(20);
    // Sentry still sees it; only the Bridge write is capped.
    expect(mocks.captureException).toHaveBeenCalledTimes(21);
  });

  it('never rejects when the logger does', async () => {
    mocks.logServerException.mockRejectedValueOnce(new Error('logger down'));
    await expect(handleUnhandledRejection(new Error('boom'))).resolves.toBe('written');
  });

  it('registers exactly one listener per event, once', () => {
    const on = vi.spyOn(process, 'on').mockImplementation((() => process) as never);
    registerProcessErrorHandlers();
    registerProcessErrorHandlers();
    const events = on.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === 'unhandledRejection')).toHaveLength(1);
    expect(events.filter((e) => e === 'uncaughtException')).toHaveLength(1);
    on.mockRestore();
  });
});
