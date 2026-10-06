// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The browser integration list in src/instrumentation-client.ts only exists
 * when `window` is defined, so the node-environment sentinel tests never see
 * it. This pins the integration options that keep @sentry/nextjs v11 behaving
 * like v10 — defaults that changed without any TypeScript signal
 * (sentry-javascript MIGRATION.md, "Upgrading from 10.x to 11.x"):
 *
 * - browserSessionIntegration: v11 default lifecycle is 'page'; v10's was
 *   'route' (a new session on every navigation). Release-health session counts
 *   depend on it.
 * - browserTracingIntegration: v11 adds a navigation span on back/forward-cache
 *   restores (`instrumentBfcacheRestore`, default true); v10 had none.
 * - userTimingIntegration: v11 moved performance.mark()/measure() span capture
 *   out of browserTracingIntegration; v10 captured them by default.
 */
const mocks = vi.hoisted(() => {
  const integration = (name: string) => vi.fn((options?: unknown) => ({ name, options }));
  return {
    init: vi.fn(),
    replayIntegration: integration('Replay'),
    browserTracingIntegration: integration('BrowserTracing'),
    userTimingIntegration: integration('UserTiming'),
    browserProfilingIntegration: integration('BrowserProfiling'),
    browserSessionIntegration: integration('BrowserSession'),
    httpClientIntegration: integration('HttpClient'),
    reportingObserverIntegration: integration('ReportingObserver'),
    consoleLoggingIntegration: integration('ConsoleLogging'),
    captureConsoleIntegration: integration('CaptureConsole'),
    thirdPartyErrorFilterIntegration: integration('ThirdPartyErrorsFilter'),
    feedbackIntegration: integration('Feedback'),
    captureRouterTransitionStart: vi.fn(),
  };
});
vi.mock('@sentry/nextjs', () => mocks);
vi.mock('@supabase/supabase-js/tracing', () => ({}));

async function loadClient(): Promise<{ integrations: Array<{ name: string }>; options: Record<string, unknown> }> {
  vi.resetModules();
  for (const fn of Object.values(mocks)) fn.mockClear();
  await import('@/instrumentation-client');
  const options = mocks.init.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  return { integrations: options.integrations as Array<{ name: string }>, options };
}

describe('instrumentation-client — v10 browser behavior pinned under @sentry/nextjs v11', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps a session per navigation (lifecycle: route)', async () => {
    await loadClient();
    expect(mocks.browserSessionIntegration).toHaveBeenCalledWith({ lifecycle: 'route' });
  });

  it('does not add a back/forward-cache restore navigation span', async () => {
    await loadClient();
    expect(mocks.browserTracingIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ instrumentBfcacheRestore: false }),
    );
  });

  it('still captures performance.mark/measure spans via userTimingIntegration', async () => {
    const { integrations } = await loadClient();
    expect(mocks.userTimingIntegration).toHaveBeenCalledTimes(1);
    expect(integrations.map((i) => i.name)).toContain('UserTiming');
  });

  it('spreads the v10 parity options into Sentry.init', async () => {
    const { options } = await loadClient();
    expect(options.traceLifecycle).toBe('static');
    expect(options.attachStacktrace).toBe(false);
    expect(options).not.toHaveProperty('enableLogs');
  });
});
