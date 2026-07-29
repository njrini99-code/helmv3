import { describe, expect, it, vi } from 'vitest';
import { createRetryingFetch, describeFetchError, TRANSIENT_HTTP } from '../retrying-fetch';

/**
 * These cover the exact failure that froze the repo on 2026-07-29: Supabase
 * answering `Seed BaseballHelm CI accounts` with a Cloudflare 522, three times
 * in half an hour, taking main and every open PR red with it.
 *
 * Sleeps are injected so the suite does not spend the real ~11s of backoff.
 */

const res = (status: number) => new Response(status === 204 ? null : 'body', { status });

function harness(responses: Array<number | Error>) {
  const calls: number[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    calls.push(i);
    if (next instanceof Error) throw next;
    return res(next);
  });
  const sleeps: number[] = [];
  const retries: string[] = [];
  const f = createRetryingFetch({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    onRetry: (m) => retries.push(m),
  });
  return { f, fetchImpl, sleeps, retries };
}

describe('retryingFetch', () => {
  it('retries a Cloudflare 522 and succeeds once the origin recovers', async () => {
    // The real incident: two 522s, then the service comes back.
    const { f, fetchImpl, sleeps } = harness([522, 522, 200]);
    const response = await f('https://example.supabase.co/auth/v1/admin/users');

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Exponential: 750 then 1500.
    expect(sleeps).toEqual([750, 1500]);
  });

  it('does NOT retry a 4xx — a real answer must surface immediately', async () => {
    // "already registered" / bad service key / schema violation. Retrying these
    // only makes a genuine failure take four times as long to appear.
    const { f, fetchImpl, sleeps } = harness([422]);
    const response = await f('https://example.supabase.co/auth/v1/admin/users');

    expect(response.status).toBe(422);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('retries network-level throws (reset / hang-up / DNS)', async () => {
    const { f, fetchImpl } = harness([new Error('socket hang up'), 200]);
    const response = await f('https://example.supabase.co/rest/v1/users');

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives the transient response back when attempts run out, not a synthetic error', async () => {
    // A sustained outage should report the TRUE status so the log says 503,
    // not something invented by the wrapper.
    const { f, fetchImpl } = harness([503]);
    const response = await f('https://example.supabase.co/rest/v1/users');

    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('rethrows the original error when every attempt throws', async () => {
    const boom = new Error('ECONNRESET');
    const { f, fetchImpl } = harness([boom]);

    await expect(f('https://example.supabase.co/rest/v1/users')).rejects.toThrow('ECONNRESET');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('covers the whole Cloudflare 52x family plus 5xx and throttling', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]) {
      expect(TRANSIENT_HTTP.has(status)).toBe(true);
    }
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 422]) {
      expect(TRANSIENT_HTTP.has(status)).toBe(false);
    }
  });
});

describe('describeFetchError', () => {
  it('renders the empty supabase-js error that made the 522 undiagnosable', () => {
    // The original log line was literally `createUser failed for ...: {}` —
    // a genuinely contentless error, which is the case worth naming.
    expect(describeFetchError({})).toBe('Error with no message');
    // When there IS any serialisable detail, keep it verbatim rather than
    // flattening it into prose: `{"status":522}` tells the reader more than
    // "Error with no message (HTTP 522)" does.
    expect(describeFetchError({ status: 522 })).toBe('{"status":522}');
  });

  it('prefers a real message, with the status when present', () => {
    expect(describeFetchError({ message: 'User already registered', status: 422 })).toBe(
      'User already registered (HTTP 422)',
    );
    expect(describeFetchError(new Error('socket hang up'))).toBe('socket hang up');
  });

  it('never throws on odd input', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeFetchError(circular)).not.toThrow();
    expect(describeFetchError(null)).toBe('unknown error');
  });
});
