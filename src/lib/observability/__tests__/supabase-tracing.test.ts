/**
 * These tests exist because the failure mode they cover is silent and severe.
 *
 * `Sentry.instrumentSupabaseClient` resolves the class to patch from
 * `client.constructor` and then proxies `Ctor.prototype.from`. Handed a plain
 * object — which is exactly what six middleware tests pass, and what any future
 * hand-rolled Supabase double will pass — that resolves to `Object`, and the
 * call either throws or targets `Object.prototype`.
 *
 * The other half is the privacy contract: `sendOperationData: false` is the one
 * flag standing between Sentry and a full round-submit mutation body. A future
 * refactor that drops it would be invisible in review and invisible in
 * production until someone read a shot payload out of a span.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const instrumentSupabaseClient = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  instrumentSupabaseClient: (...args: unknown[]) => instrumentSupabaseClient(...args),
}));

import { withSupabaseTracing, SUPABASE_TRACE_PROPAGATION } from '../supabase-tracing';

/** Minimal stand-in with the shape the real SupabaseClient has: `from` on the prototype. */
class FakeSupabaseClient {
  auth = { admin: {} };
  from() {
    return {};
  }
}

describe('withSupabaseTracing', () => {
  beforeEach(() => {
    instrumentSupabaseClient.mockReset();
  });

  it('instruments a real client and always passes sendOperationData: false', () => {
    const client = new FakeSupabaseClient();

    expect(withSupabaseTracing(client)).toBe(client);
    expect(instrumentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(instrumentSupabaseClient).toHaveBeenCalledWith(client, { sendOperationData: false });
  });

  it('never enables sendOperationData, whatever the Sentry-side default is', () => {
    withSupabaseTracing(new FakeSupabaseClient());
    const [, options] = instrumentSupabaseClient.mock.calls[0] as [unknown, { sendOperationData: boolean }];
    expect(options.sendOperationData).toBe(false);
  });

  it('skips plain-object test doubles instead of targeting Object.prototype', () => {
    // The exact shape used by src/lib/supabase/__tests__/middleware-*.test.ts.
    const doubled = { auth: { getUser: vi.fn() }, from: vi.fn() };

    expect(withSupabaseTracing(doubled)).toBe(doubled);
    expect(instrumentSupabaseClient).not.toHaveBeenCalled();
    expect('from' in Object.prototype).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not-a-client'],
    ['a number', 7],
    ['an object with a null prototype', Object.create(null)],
  ])('returns %s untouched without instrumenting', (_label, value) => {
    expect(withSupabaseTracing(value)).toBe(value);
    expect(instrumentSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns the client even when Sentry instrumentation throws', () => {
    instrumentSupabaseClient.mockImplementation(() => {
      throw new Error('sentry exploded');
    });
    const client = new FakeSupabaseClient();

    // Observability must never be able to break a round submit.
    expect(() => withSupabaseTracing(client)).not.toThrow();
    expect(withSupabaseTracing(client)).toBe(client);
  });
});

describe('SUPABASE_TRACE_PROPAGATION', () => {
  it('enables propagation while leaving the sampling-respect default alone', () => {
    expect(SUPABASE_TRACE_PROPAGATION.enabled).toBe(true);
    // Explicitly NOT set: on supabase-js 2.112.3 the default (`true`) still
    // sends `traceparent` on an unsampled trace and only withholds
    // tracestate/baggage, which is the behaviour we want for log correlation.
    expect('respectSamplingDecision' in SUPABASE_TRACE_PROPAGATION).toBe(false);
  });
});
