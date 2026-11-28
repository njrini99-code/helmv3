import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The browser's Sentry setup (src/instrumentation-client.ts) sends production's errors and no other environment's.
 * The rule is tested in lib/__tests__/sentry-environment.test.ts; this is the wiring into `beforeSend`.
 */

const initMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  replayIntegration: () => ({ name: 'Replay' }),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  browserProfilingIntegration: () => ({ name: 'BrowserProfiling' }),
  browserSessionIntegration: () => ({ name: 'BrowserSession' }),
  httpClientIntegration: () => ({ name: 'HttpClient' }),
  reportingObserverIntegration: () => ({ name: 'ReportingObserver' }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  thirdPartyErrorFilterIntegration: () => ({ name: 'ThirdPartyErrorsFilter' }),
  feedbackIntegration: () => ({ name: 'Feedback' }),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));

type BeforeSend = (event: Record<string, unknown>, hint?: Record<string, unknown>) => unknown;

async function loadBeforeSend(): Promise<BeforeSend> {
  vi.resetModules();
  initMock.mockClear();
  await import('@/instrumentation-client');
  return (initMock.mock.calls.at(-1)![0] as { beforeSend: BeforeSend }).beforeSend;
}

function errorEvent(environment: string): Record<string, unknown> {
  return {
    environment,
    exception: { values: [{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'id')" }] },
  };
}

describe('instrumentation-client: only production errors go to Sentry', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends a production error', async () => {
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent('production'), {})).not.toBeNull();
  });

  it.each(['preview', 'development', 'local-production-build'])('drops a %s error', async (environment) => {
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent(environment), {})).toBeNull();
  });

  it('sends a preview error again when NEXT_PUBLIC_SENTRY_ERRORS_ALL_ENVIRONMENTS is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ERRORS_ALL_ENVIRONMENTS', 'true');
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent('preview'), {})).not.toBeNull();
  });
});
