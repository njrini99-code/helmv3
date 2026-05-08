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
