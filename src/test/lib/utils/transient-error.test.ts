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

  /**
   * The 10s `AbortSignal.timeout` in src/lib/supabase/server.ts is the abort
   * this helper exists to catch, and it reaches callers in two shapes. Both
   * were classified as NON-transient before 2026-07-28, so every retry gated
   * on this helper was dead code for the codebase's most common transport
   * failure — and the Bridge filed each one as a hard error.
   */
  describe('the server client\'s own 10s abort', () => {
    it('returns true for a thrown AbortSignal.timeout DOMException', () => {
      // Real shape: name is TimeoutError, NOT AbortError.
      const err = Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      });
      expect(isTransientFetchError(err)).toBe(true);
    });

    it('returns true on the message alone when the name is missing', () => {
      expect(isTransientFetchError(new Error('The operation was aborted due to timeout'))).toBe(
        true,
      );
    });

    it('returns true for an explicit AbortController abort', () => {
      expect(isTransientFetchError(new Error('This operation was aborted'))).toBe(true);
    });

    it('returns true for the "user aborted a request" phrasing', () => {
      expect(isTransientFetchError(new Error('The user aborted a request.'))).toBe(true);
    });

    it('returns true for the plain object supabase-js resolves with after an abort', () => {
      // Verbatim from postgrest-js: not an Error, no `name`, empty `code`.
      // `String(err)` on this is '[object Object]' — the exact production
      // signature of the editRecurringEvent incidents (2026-07-27).
      const err = {
        message: 'TimeoutError: The operation was aborted due to timeout',
        details: 'TimeoutError: The operation was aborted due to timeout\n    at node:internal',
        hint: '',
        code: '',
      };
      expect(String(err)).toBe('[object Object]'); // guards the premise
      expect(isTransientFetchError(err)).toBe(true);
    });

    it('returns true for the plain-object shape of a bare fetch failure', () => {
      expect(
        isTransientFetchError({ message: 'TypeError: fetch failed', details: '', hint: '', code: '' }),
      ).toBe(true);
    });

    it('does NOT treat a plain-object PostgrestError with a real pg code as transient', () => {
      // A constraint violation is a deterministic rejection — retrying it
      // just fails again. Same envelope shape, opposite verdict.
      expect(
        isTransientFetchError({
          message: 'new row violates row-level security policy for table "golf_events"',
          details: null,
          hint: null,
          code: '42501',
        }),
      ).toBe(false);
    });
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
