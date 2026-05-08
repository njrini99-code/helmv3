/**
 * Tests for src/lib/utils/transient-error.ts
 *
 * Confirms the heuristic surface area we rely on at every retry callsite:
 *   - name-based AbortError detection
 *   - code-based detection at top level AND under `.cause.code`
 *   - case-insensitive substring matching of common failure modes
 *   - negative cases (real bugs / 4xx) are NOT misclassified as transient
 *
 * Plus a sanity test that `delay()` actually waits.
 */

import { describe, it, expect } from 'vitest';
import { isTransientFetchError, delay } from '@/lib/utils/transient-error';

describe('isTransientFetchError', () => {
  it('returns true for an AbortError by name', () => {
    const err = new Error('request was aborted');
    err.name = 'AbortError';
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for ABORT_ERR code', () => {
    const err = Object.assign(new Error('aborted'), { code: 'ABORT_ERR' });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for UND_ERR_ABORTED on err.code', () => {
    const err = Object.assign(new Error('undici aborted'), { code: 'UND_ERR_ABORTED' });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for UND_ERR_SOCKET_TIMEOUT on err.cause.code', () => {
    const err = Object.assign(new Error('fetch failed'), {
      cause: { code: 'UND_ERR_SOCKET_TIMEOUT' },
    });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for ECONNRESET via code', () => {
    const err = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for ETIMEDOUT via code', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it('returns true for "fetch failed" message substring', () => {
    expect(isTransientFetchError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true for ECONNRESET in the message (case-insensitive)', () => {
    expect(isTransientFetchError(new Error('socket: ECONNRESET happened'))).toBe(true);
  });

  it('returns true for "socket hang up"', () => {
    expect(isTransientFetchError(new Error('socket hang up'))).toBe(true);
  });

  it('returns true for "503 Service Unavailable"', () => {
    expect(isTransientFetchError(new Error('upstream returned 503 Service Unavailable'))).toBe(
      true,
    );
  });

  it('returns true for "504 Gateway Timeout"', () => {
    expect(isTransientFetchError(new Error('504 Gateway Timeout'))).toBe(true);
  });

  it('returns true for a generic "network error" message', () => {
    expect(isTransientFetchError(new Error('network error'))).toBe(true);
  });

  it("returns false for a TypeError reading an undefined property (real bug)", () => {
    expect(
      isTransientFetchError(new TypeError("Cannot read property 'x' of undefined")),
    ).toBe(false);
  });

  it('returns false for a generic 4xx-like Error', () => {
    expect(isTransientFetchError(new Error('Bad request'))).toBe(false);
  });

  it('returns false for null/undefined/empty inputs', () => {
    expect(isTransientFetchError(null)).toBe(false);
    expect(isTransientFetchError(undefined)).toBe(false);
    expect(isTransientFetchError('')).toBe(false);
  });
});

describe('delay', () => {
  it('resolves after at least ~45ms when asked for 50ms', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    // Allow generous timer slop on slower CI; we only care that it actually waits.
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
