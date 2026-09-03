import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Client-side twin of instrumentation-privacy-sentinel.test.ts. This module
 * calls `Sentry.init` at import time (not inside an exported function), so
 * each test re-imports it fresh via `vi.resetModules()` and reads the
 * captured `init` call.
 */
const SENTINEL = 'sentry-test-secret-DO-NOT-STORE-123';

const initMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  replayIntegration: () => ({ name: 'Replay' }),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));

type SentryInitOptions = {
  beforeSend?: (event: Record<string, unknown>, hint?: unknown) => unknown;
  beforeSendMetric?: (metric: Record<string, unknown>) => unknown;
  beforeSendLog?: (log: Record<string, unknown>) => unknown;
};

async function loadInitOptions(): Promise<SentryInitOptions> {
  vi.resetModules();
  initMock.mockClear();
  await import('@/instrumentation-client');
  return (initMock.mock.calls.at(-1)?.[0] ?? {}) as SentryInitOptions;
}

describe('instrumentation-client privacy sentinel — beforeSend / beforeSendMetric / beforeSendLog', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('beforeSend strips Authorization, Cookie, and Set-Cookie headers', async () => {
    const { beforeSend } = await loadInitOptions();
    expect(beforeSend).toBeTypeOf('function');
    const event = {
      request: {
        url: 'https://helm.app/golf/dashboard',
        headers: {
          Authorization: `Bearer ${SENTINEL}`,
          Cookie: `sb-access-token=${SENTINEL}`,
          'Set-Cookie': `sb-access-token=${SENTINEL}; HttpOnly`,
        },
      },
    };
    const out = beforeSend!(event, {}) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(SENTINEL);
  });

  it('beforeSend strips a token embedded in the request query string', async () => {
    const { beforeSend } = await loadInitOptions();
    const event = { request: { url: `https://helm.app/reset?token=${SENTINEL}` } };
    const out = beforeSend!(event, {}) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(SENTINEL);
  });

  it('beforeSendMetric strips a secret-shaped attribute key', async () => {
    const { beforeSendMetric } = await loadInitOptions();
    expect(beforeSendMetric).toBeTypeOf('function');
    const metric = {
      name: 'helm.workflow.success',
      value: 1,
      type: 'counter',
      attributes: { authorization: SENTINEL, feature: 'round_tracking' },
    };
    const out = beforeSendMetric!(metric) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(SENTINEL);
    expect((out.attributes as Record<string, unknown>).feature).toBe('round_tracking');
  });

  it('beforeSendLog strips a secret-shaped attribute key', async () => {
    const { beforeSendLog } = await loadInitOptions();
    expect(beforeSendLog).toBeTypeOf('function');
    const log = {
      level: 'error',
      message: 'auth failed',
      attributes: { cookie: SENTINEL, feature: 'auth' },
    };
    const out = beforeSendLog!(log) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(SENTINEL);
    expect((out.attributes as Record<string, unknown>).feature).toBe('auth');
  });
});
