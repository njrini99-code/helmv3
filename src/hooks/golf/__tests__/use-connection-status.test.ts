// @vitest-environment jsdom
/**
 * useConnectionStatus — `isConnected` must mean network reachability, not
 * "the server's own backend was fully healthy".
 *
 * WHY THIS EXISTS. /api/health used to always return HTTP 200, even when its
 * own DB probe failed (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(i)).
 * Fixing that route to return 503 on a degraded backend (a real, useful
 * signal for an uptime monitor) exposed a latent bug here: this hook set
 * `isConnected = response.ok`, which used to be harmless only because
 * /api/health never returned anything but 200. Once it can return 503, a
 * server-side database hiccup — nothing to do with THIS device's network —
 * would have read as "you're offline", which round-entry surfaces
 * (new-round-client.tsx) key off indirectly. `isConnected`'s own doc comment
 * says "whether actual network requests succeed" — a 503 response IS a
 * request succeeding; only a thrown fetch error (timeout, DNS, no network)
 * is a real connectivity failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useConnectionStatus } from '../use-connection-status';

describe('useConnectionStatus — isConnected reflects reachability, not HTTP status', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('is connected when the health check responds 200', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionStatus({ autoCheck: false }));
    await result.current.checkNow();

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it('is STILL connected when the health check responds 503 (degraded backend, reachable device)', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionStatus({ autoCheck: false }));
    await result.current.checkNow();

    // The regression this test exists to catch: a degraded-but-reachable
    // backend must never read as "this device is offline".
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it('is NOT connected when the fetch itself throws (a real connectivity failure)', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionStatus({ autoCheck: false }));
    await result.current.checkNow();

    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(result.current.error).toBe('Unable to reach server');
  });

  it('is NOT connected on an abort/timeout', async () => {
    global.fetch = vi.fn(async () => {
      const err = new DOMException('The operation was aborted.', 'AbortError');
      throw err;
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionStatus({ autoCheck: false, checkTimeout: 100 }));
    await result.current.checkNow();

    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });
});
