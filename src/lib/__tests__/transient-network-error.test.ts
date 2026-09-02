import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTransientNetworkErrorMessage, withOneTransportRetry } from '@/lib/transient-network-error';

describe('isTransientNetworkErrorMessage — the wording of "the request never got a response"', () => {
  it.each([
    ['Safari / WKWebView', 'Load failed'],
    ['Chromium', 'Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['WebKit mid-request', 'The network connection was lost.'],
    ['Chromium net stack', 'net::ERR_CONNECTION_RESET'],
  ])('%s: %s', (_engine, message) => {
    expect(isTransientNetworkErrorMessage(message)).toBe(true);
  });

  it('does not claim an application error or our own abort budget', () => {
    expect(isTransientNetworkErrorMessage('Unauthorized')).toBe(false);
    expect(isTransientNetworkErrorMessage('AbortError: This operation was aborted')).toBe(false);
    // undici's server-side wording is a different animal — a Vercel function
    // failing to reach Supabase is ours to fix, not the visitor's connectivity.
    expect(isTransientNetworkErrorMessage('fetch failed')).toBe(false);
  });
});

describe('withOneTransportRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries exactly once, after the delay, when the first attempt dies on the wire', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce('sent');

    const pending = withOneTransportRetry(attempt, 750);
    await vi.advanceTimersByTimeAsync(749);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe('sent');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry an application error — that is an answer, not a dropped socket', async () => {
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('Unauthorized'));
    await expect(withOneTransportRetry(attempt, 0)).rejects.toThrow('Unauthorized');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up after the second transport failure and surfaces that one', async () => {
    const attempt = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(new TypeError('The network connection was lost.'));
    await expect(withOneTransportRetry(attempt, 0)).rejects.toThrow('network connection was lost');
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
