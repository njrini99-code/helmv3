// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPagePerformance } from '../admin-logger-client';

/** Clubhouse audit A-05: a log the network or a navigation cut off is not reported as an app error. */
describe('admin logger client: slow-load event send', () => {
  const nav = { startTime: 0, loadEventEnd: 9000, domContentLoadedEventEnd: 4000, domInteractive: 3000 };
  let error: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation(((type: string) => (type === 'navigation' ? [nav] : [])) as never);
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'complete' });
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends with keepalive so a navigation does not cancel it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    trackPagePerformance(5000);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).keepalive).toBe(true);
  });
  it('a cut-off request ("Load failed") warns instead of console.error, which Sentry captures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Load failed'));
    trackPagePerformance(5000);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();
  });
  it('any other failure still reports as an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('JSON body too large'));
    trackPagePerformance(5000);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});
