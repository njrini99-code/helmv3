// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The paths into the Bridge besides logError: the copy of an error Sentry caught by itself
 * (logCapturedErrorToBridge), the window handlers installed once before hydration, and the release on every report.
 */

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  withScope: vi.fn((run: (scope: unknown) => void) =>
    run({ setLevel: vi.fn(), setContext: vi.fn(), setTag: vi.fn(), setExtra: vi.fn() }),
  ),
}));
vi.mock('@sentry/nextjs', () => sentry);

type Listener = Parameters<typeof window.addEventListener>[1];
const added: Array<[string, Listener]> = [];
let fetchMock: ReturnType<typeof vi.fn>;
let addSpy: { mockRestore: () => void } | null = null;

function posted(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/log-error')
    .map(([, init]) => JSON.parse((init as { body: string }).body) as Record<string, unknown>);
}

beforeEach(() => {
  vi.resetModules();
  sentry.captureException.mockClear();
  sentry.withScope.mockClear();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'a0480dbc8b97');
  // Each test installs handlers from a fresh module; remove them after, so one test's handlers never answer another's.
  const realAdd = window.addEventListener.bind(window);
  const record = (type: string, listener: Listener, options?: boolean | AddEventListenerOptions): void => {
    added.push([type, listener]);
    realAdd(type, listener, options);
  };
  addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(record as typeof window.addEventListener);
});

afterEach(() => {
  addSpy?.mockRestore();
  for (const [type, listener] of added.splice(0)) window.removeEventListener(type, listener);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('logCapturedErrorToBridge', () => {
  it('writes the row and sends nothing more to Sentry, which already has the event', async () => {
    const { logCapturedErrorToBridge } = await import('@/lib/error-logging');
    logCapturedErrorToBridge(new Error('Could not load the rounds'), { component: 'SentryCapture', action: 'console', capturedBy: 'console' }, 'medium');
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.withScope).not.toHaveBeenCalled();
    const [body] = posted();
    expect(body).toMatchObject({
      message: 'Could not load the rounds',
      severity: 'medium',
      release: 'a0480dbc8b97',
      context: { component: 'SentryCapture', capturedBy: 'console' },
    });
  });

  it('marks the error, so a later Sentry copy of the same object is not written twice', async () => {
    const { logCapturedErrorToBridge } = await import('@/lib/error-logging');
    const { isAlreadyBridgeLogged } = await import('@/lib/bridge-logged-marker');
    const error = new Error('once');
    logCapturedErrorToBridge(error, { component: 'SentryCapture' }, 'medium');
    expect(isAlreadyBridgeLogged(error)).toBe(true);
  });

  it("shares logError's per-tab throttle", async () => {
    const { logCapturedErrorToBridge } = await import('@/lib/error-logging');
    for (let i = 0; i < 3; i++) logCapturedErrorToBridge(new Error('network error'), { component: 'SentryCapture' }, 'medium');
    expect(posted()).toHaveLength(1);
  });
});

describe('logError', () => {
  it('still writes to Sentry and the Bridge, with the release', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Save failed'), { component: 'RoundForm' }, 'high');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(posted()).toEqual([expect.objectContaining({ message: 'Save failed', release: 'a0480dbc8b97' })]);
  });

  it('sends no release when the bundle has none', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', '');
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Save failed'), { component: 'RoundForm' }, 'high');
    expect(posted()[0]).not.toHaveProperty('release');
  });
});

describe('setupGlobalErrorHandlers', () => {
  it('installs once, so an uncaught error is written once however often it is called', async () => {
    const { setupGlobalErrorHandlers } = await import('@/lib/error-logging');
    setupGlobalErrorHandlers();
    setupGlobalErrorHandlers();
    const error = new Error('Cannot read properties of undefined');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    expect(posted()).toHaveLength(1);
  });

  it('writes a rejection with an Error as that Error: its own stack, and marked for Sentry', async () => {
    const { setupGlobalErrorHandlers } = await import('@/lib/error-logging');
    const { isAlreadyBridgeLogged } = await import('@/lib/bridge-logged-marker');
    setupGlobalErrorHandlers();
    const reason = new Error('Round did not save');
    reason.stack = 'Error: Round did not save\n    at saveRound (app:///_next/static/chunks/round.js:12:3)';
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);
    const [body] = posted();
    expect(body).toMatchObject({ message: 'Round did not save', stack: reason.stack });
    expect(isAlreadyBridgeLogged(reason)).toBe(true);
  });

  it('still writes a rejection with no Error as one built from its message', async () => {
    const { setupGlobalErrorHandlers } = await import('@/lib/error-logging');
    setupGlobalErrorHandlers();
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: 'timed out' });
    window.dispatchEvent(event);
    expect(posted()[0]).toMatchObject({ message: 'timed out' });
  });
});
