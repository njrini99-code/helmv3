// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markBridgeLogged } from '@/lib/bridge-logged-marker';

/**
 * The browser's Sentry setup hands the Bridge what Sentry caught by itself, and installs the Bridge's window handlers
 * before the page hydrates. The decisions are tested in lib/observability/__tests__/sentry-bridge-copy.test.ts; this
 * is the wiring.
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

const logging = vi.hoisted(() => ({
  logCapturedErrorToBridge: vi.fn(),
  setupGlobalErrorHandlers: vi.fn(),
}));
vi.mock('@/lib/error-logging', () => logging);

type BeforeSend = (event: Record<string, unknown>, hint?: Record<string, unknown>) => unknown;

async function loadBeforeSend(): Promise<BeforeSend> {
  vi.resetModules();
  initMock.mockClear();
  await import('@/instrumentation-client');
  return (initMock.mock.calls.at(-1)![0] as { beforeSend: BeforeSend }).beforeSend;
}

function consoleEvent(message: string): Record<string, unknown> {
  return {
    environment: 'production',
    level: 'error',
    logger: 'console',
    exception: { values: [{ type: 'Error', value: message, mechanism: { type: 'auto.core.capture_console', handled: true } }] },
  };
}

describe('instrumentation-client: the Bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    logging.logCapturedErrorToBridge.mockClear();
    logging.setupGlobalErrorHandlers.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("installs the Bridge's window handlers when the page loads, before hydration", async () => {
    await loadBeforeSend();
    expect(logging.setupGlobalErrorHandlers).toHaveBeenCalledTimes(1);
  });

  it('copies a console.error Sentry caught to the Bridge, once the current task is over', async () => {
    const beforeSend = await loadBeforeSend();
    beforeSend(consoleEvent('Could not load the rounds'), { originalException: 'Could not load the rounds' });
    expect(logging.logCapturedErrorToBridge).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(logging.logCapturedErrorToBridge).toHaveBeenCalledTimes(1);
    const [error, context, severity] = logging.logCapturedErrorToBridge.mock.calls[0]!;
    expect((error as Error).message).toBe('Could not load the rounds');
    expect(context).toMatchObject({ component: 'SentryCapture', capturedBy: 'console' });
    expect(severity).toBe('medium');
  });

  it('writes nothing when a boundary reports the same error in that task', async () => {
    const beforeSend = await loadBeforeSend();
    const error = new Error('Cannot read properties of undefined');
    beforeSend(consoleEvent(error.message), { originalException: error });
    markBridgeLogged(error); // the boundary's logError, just after React logged it
    vi.runAllTimers();
    expect(logging.logCapturedErrorToBridge).not.toHaveBeenCalled();
  });

  it("leaves an uncaught error to the Bridge's own window handlers", async () => {
    const beforeSend = await loadBeforeSend();
    beforeSend(
      {
        environment: 'production',
        level: 'error',
        exception: { values: [{ type: 'TypeError', value: 'x', mechanism: { type: 'auto.browser.global_handlers.onerror', handled: false } }] },
      },
      { originalException: new TypeError('x') },
    );
    vi.runAllTimers();
    expect(logging.logCapturedErrorToBridge).not.toHaveBeenCalled();
  });

  it('copies an error that Sentry itself then samples away as a repeat', async () => {
    const beforeSend = await loadBeforeSend();
    for (let i = 0; i < 6; i++) beforeSend(consoleEvent('network error'), { originalException: 'network error' });
    vi.runAllTimers();
    // The Bridge's own per-tab throttle (in logCapturedErrorToBridge) decides how many rows; every copy reaches it.
    expect(logging.logCapturedErrorToBridge).toHaveBeenCalledTimes(6);
  });
});
