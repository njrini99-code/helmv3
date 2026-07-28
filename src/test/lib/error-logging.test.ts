/**
 * Tests for src/lib/error-logging.ts
 *
 * Confirms the unified contract for stale-server-action handling:
 *   - One predicate, one sessionStorage key, one reload-once-per-session guard.
 *   - Both window.unhandledrejection / window.error and the route error
 *     boundary funnel through the same `softReloadForStaleServerAction` so
 *     a session can only reload once for the same error class.
 *   - The reload guard is layered: sessionStorage is primary, but a
 *     module-level flag prevents an infinite loop when sessionStorage
 *     throws (Safari private mode, sandboxed iframes, quota exceeded).
 *   - `logError` short-circuits stale-action errors so they do not page
 *     the monitoring sink.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sonner so the dynamic import inside softReloadForStaleServerAction
// resolves synchronously to a stable shape — otherwise the resolution timing
// races against vi.runAllTimersAsync() and the 250ms reload setTimeout never
// drains within the test.
vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

describe('isStaleServerActionError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true for the canonical Next.js stale-action message', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(
      isStaleServerActionError(
        new Error('Server Action "abc123" was not found on the server.'),
      ),
    ).toBe(true);
  });

  it('returns true for the partial "was not found on the server" message', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(
      isStaleServerActionError(new Error('foo was not found on the server')),
    ).toBe(true);
  });

  it('returns true for a plain string carrying the same message (rejection reason)', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(
      isStaleServerActionError(
        'Server Action "xyz" was not found on the server.',
      ),
    ).toBe(true);
  });

  it('returns true for an object-shaped rejection reason with a matching message', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(
      isStaleServerActionError({
        message: 'Server Action "qrs" was not found on the server.',
      }),
    ).toBe(true);
  });

  it('returns false for unrelated database / network errors', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(isStaleServerActionError(new Error('Database connection failed'))).toBe(false);
    expect(isStaleServerActionError(new Error('Bad request'))).toBe(false);
    expect(isStaleServerActionError(new Error('fetch failed'))).toBe(false);
  });

  it('returns false for null / undefined / unrelated string', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(isStaleServerActionError(null)).toBe(false);
    expect(isStaleServerActionError(undefined)).toBe(false);
    expect(isStaleServerActionError('string error')).toBe(false);
  });

  it('returns false for an object with no message field', async () => {
    const { isStaleServerActionError } = await import('@/lib/error-logging');
    expect(isStaleServerActionError({})).toBe(false);
    expect(isStaleServerActionError({ message: 42 })).toBe(false);
  });
});

/**
 * Helper: waits long enough for the dynamic `import('sonner')` promise
 * chain to resolve and the 250ms reload `setTimeout` inside `.finally()`
 * to fire. We use real timers (not fake) because vi.useFakeTimers does
 * not reliably drain a setTimeout that's queued by a `.finally()` after
 * a dynamic-import-resolved promise — the microtask/timer interleaving
 * is fragile, and a 400ms real wait is cheap and deterministic.
 */
async function waitForReload(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));
}

describe('softReloadForStaleServerAction', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let getItemSpy: ReturnType<typeof vi.fn>;
  let setItemSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();

    reloadSpy = vi.fn();
    // jsdom's location is non-configurable on `window.location.reload`,
    // so we replace the whole `location` object via stubGlobal.
    vi.stubGlobal('location', {
      ...window.location,
      reload: reloadSpy,
    });

    getItemSpy = vi.fn().mockReturnValue(null);
    setItemSpy = vi.fn();
    vi.stubGlobal('sessionStorage', {
      getItem: getItemSpy,
      setItem: setItemSpy,
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes to sessionStorage and reloads on first call', async () => {
    const { softReloadForStaleServerAction, STALE_ACTION_RELOAD_KEY } =
      await import('@/lib/error-logging');

    softReloadForStaleServerAction();
    await waitForReload();

    expect(setItemSpy).toHaveBeenCalledWith(
      STALE_ACTION_RELOAD_KEY,
      expect.any(String),
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on the second call when sessionStorage already has the key', async () => {
    const { softReloadForStaleServerAction } = await import('@/lib/error-logging');

    softReloadForStaleServerAction();
    await waitForReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Simulate the post-reload world: sessionStorage now reports the key set.
    getItemSpy.mockReturnValue('123');
    softReloadForStaleServerAction();
    await waitForReload();

    // Still only the original reload — no second reload triggered.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a module-level flag when sessionStorage.setItem throws', async () => {
    // Simulate Safari private mode: getItem returns null, but setItem throws.
    setItemSpy.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { softReloadForStaleServerAction } = await import('@/lib/error-logging');

    softReloadForStaleServerAction();
    await waitForReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Second call: sessionStorage still throws AND still reads as empty,
    // so without the module flag this would reload again. With the flag,
    // it must be a no-op.
    softReloadForStaleServerAction();
    await waitForReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the module flag when sessionStorage.getItem throws', async () => {
    getItemSpy.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });

    const { softReloadForStaleServerAction } = await import('@/lib/error-logging');

    softReloadForStaleServerAction();
    await waitForReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    softReloadForStaleServerAction();
    await waitForReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('logError → monitoring sink', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not forward stale-server-action errors to the sink', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(
      new Error('Server Action "abc123" was not found on the server.'),
      { component: 'test' },
      'high',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward "was not found on the server" partial-match errors', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('something was not found on the server'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward "ResizeObserver loop completed with undelivered notifications"', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward "ResizeObserver loop limit exceeded"', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('ResizeObserver loop limit exceeded'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * CefSharp's embedded-browser bridge. instrumentation-client.ts already lists
   * this exact pattern in Sentry's `ignoreErrors` because it originates outside
   * our bundle, but the Bridge pipeline is a separate path and was persisting
   * one `severity:error` row per occurrence.
   */
  it('does not forward the CefSharp "Object Not Found Matching Id" bridge error', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(
      new Error('Object Not Found Matching Id:1, MethodName:update, ParamCount:4'),
      { component: 'GlobalErrorHandler' },
      'high',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards non-stale errors to the monitoring endpoint', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Database connection failed'), { component: 'test' }, 'high');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/log-error');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.message).toBe('Database connection failed');
    expect(body.severity).toBe('high');
  });
});

/**
 * Severity ceiling for self-recovering failures (capSeverityForSelfRecovering).
 *
 * A chunk-load failure is a tab holding asset URLs from a retired deployment.
 * The one-shot reload recovers it and Sentry already declines to open an issue,
 * so arriving in Helm Bridge at `severity:error` (log-error maps high → error)
 * made a non-incident read as a live one. It must still ARRIVE — a spike means
 * a bad deploy or a purged CDN — just as a warning.
 */
describe('logError → chunk-load severity ceiling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function bodyOf(call: unknown[]): { message: string; severity: string } {
    return JSON.parse((call[1] as RequestInit).body as string);
  }

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chunkMessages = [
    'Loading chunk 97094 failed.\n(error: https://helmv3.vercel.app/_next/static/chunks/97094-d1294ae3b5083b2e.js)',
    'Loading CSS chunk 8351 failed.',
    'ChunkLoadError: Loading chunk 42 failed.',
    "Cannot read properties of undefined (reading 'call')",
  ];

  for (const message of chunkMessages) {
    it(`caps 'high' to 'medium' for: ${message.slice(0, 40)}`, async () => {
      const { logError } = await import('@/lib/error-logging');
      logError(new Error(message), { component: 'GlobalErrorHandler' }, 'high');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('medium');
    });
  }

  it('still delivers the report — a spike of stale tabs is real signal', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Loading chunk 31172 failed.'), { component: 'RouteErrorBoundary' }, 'high');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a genuine error at high', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Cannot read properties of undefined (reading \'id\')'), {}, 'high');
    expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('high');
  });

  it('does not touch critical — the caller knows more than this filter', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Loading chunk 5 failed.'), {}, 'critical');
    expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('critical');
  });

  it('does not raise a lower severity', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Loading chunk 5 failed.'), {}, 'low');
    expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('low');
  });
});

/**
 * Transient network failures share the chunk-load ceiling.
 *
 * Production, 2026-07-23: `TypeError: Load failed` (iOS WebKit's wording for a
 * fetch that never reached the server) from `useShotStateMachine` on
 * /golf/dashboard/rounds/new, action "auto-save initial attempt",
 * consecutiveFailures 0 — filed as `severity:error`. That call site sits on a
 * recovery ladder (retries at 5s/15s/30s, then a circuit breaker with 60s
 * probes), so the save it describes almost certainly succeeded seconds later.
 * Same day, "A network error occurred." from Stripe.js on /products.
 *
 * The reports must still ARRIVE — a sustained outage produces one per retry and
 * per probe, which is the shape worth alerting on — just not as errors.
 */
describe('logError → transient-network severity ceiling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function bodyOf(call: unknown[]): { message: string; severity: string } {
    return JSON.parse((call[1] as RequestInit).body as string);
  }

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // One per engine — the message is the only signal these carry.
  const networkMessages = [
    'Load failed',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'A network error occurred.',
    'The network connection was lost.',
    'net::ERR_INTERNET_DISCONNECTED',
  ];

  for (const message of networkMessages) {
    it(`caps 'high' to 'medium' for: ${message}`, async () => {
      const { logError } = await import('@/lib/error-logging');
      logError(
        new Error(message),
        { component: 'useShotStateMachine', action: 'auto-save initial attempt' },
        'high',
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('medium');
    });
  }

  it('still delivers the report so a sustained outage stays visible', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Load failed'), { component: 'useShotStateMachine' }, 'high');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0]!).message).toBe('Load failed');
  });

  /**
   * An abort is OUR timeout budget expiring, not the user's connection
   * dropping. Tiering it down would hide the signal that a budget needs
   * revisiting — which is exactly the shot-drivers RLS bug.
   */
  it('leaves AbortError at high — an abort is our own budget, not the network', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('AbortError: This operation was aborted'), {}, 'high');
    expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('high');
  });

  it('leaves a server-side failure at high — fetch resolves for any HTTP response', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Internal Server Error'), {}, 'high');
    expect(bodyOf(fetchMock.mock.calls[0]!).severity).toBe('high');
  });
});

/**
 * Automated clients are not users.
 *
 * Production, 2026-07-16: Stripe's `Stripebot/1.0` crawler hit the public
 * /products page, Stripe.js could not reach its own API, and the unhandled
 * rejection was filed as a `severity:error` incident against a page that was
 * working for every human on it.
 */
describe('logError → automated clients', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function stubUserAgent(userAgent: string, webdriver = false): void {
    vi.stubGlobal('navigator', { userAgent, webdriver });
  }

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const botAgents = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (Stripebot/1.0; +https://docs.stripe.com/stripebot-crawler)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
    'facebookexternalhit/1.1',
  ];

  for (const ua of botAgents) {
    it(`drops reports from: ${ua.slice(0, 45)}`, async () => {
      stubUserAgent(ua);
      const { logError } = await import('@/lib/error-logging');
      logError(new Error('A network error occurred.'), { route: '/products' }, 'high');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('drops reports when navigator.webdriver is set despite a human-looking UA', async () => {
    stubUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      true,
    );
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Cannot read properties of undefined'), {}, 'high');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still reports for a real browser', async () => {
    stubUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HelmSportsLabsApp',
    );
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('Cannot read properties of undefined'), {}, 'high');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * "Mobile Safari" contains no automation token, and the iOS app UA above ends
   * in `HelmSportsLabsApp`. Neither may be swept up by the bot regex — that
   * would silently blind the Bridge to the platform most of the round-tracking
   * traffic comes from.
   */
  it('does not mistake ordinary mobile browsers for crawlers', async () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ]) {
      vi.resetModules();
      fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      stubUserAgent(ua);
      const { logError } = await import('@/lib/error-logging');
      logError(new Error('Cannot read properties of undefined'), {}, 'high');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

/**
 * Client-side report de-duplication (shouldThrottleClientReport).
 *
 * Regression guard for the production incident where a single flaky/backgrounded
 * tab wrote 320 identical `severity:error` rows in 8h. The throttle is private,
 * so we exercise it through logError() and assert the fetch (sink) call count.
 */
describe('logError → client-report throttle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules(); // resets the module-level reportLedger between tests
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('collapses identical (severity|component|message) reports within the window', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
    // First sent, repeats inside the 60s window suppressed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never suppresses distinct messages or distinct components', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
    logError(new Error('a different error'), { component: 'GolfRoot' }, 'medium'); // distinct message
    logError(new Error('network error'), { component: 'OtherRoot' }, 'medium');   // distinct component
    logError(new Error('network error'), { route: '/golf/x' }, 'medium');          // falls back to route key
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('caps identical reports at 8 per tab even across many windows', async () => {
    vi.useFakeTimers();
    const { logError } = await import('@/lib/error-logging');
    for (let i = 0; i < 12; i++) {
      logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
      vi.advanceTimersByTime(61_000); // step past the 60s dedup window each time
    }
    // Window never throttles (we advance past it), so only the hard session cap bites.
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('treats severity as part of the throttle key', async () => {
    const { logError } = await import('@/lib/error-logging');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'medium');
    logError(new Error('network error'), { component: 'GolfRoot' }, 'high'); // different severity → own budget
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
