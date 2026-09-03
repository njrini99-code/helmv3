/**
 * `getSentryCorrelation` / `attachHelmTrace` are the bridge between Sentry's
 * own trace id and Helm's independent trace id (the flight recorder /
 * helm_debug schema). Both directions matter:
 *
 *   getSentryCorrelation()   read the ACTIVE Sentry span's ids, if any.
 *   attachHelmTrace(id)      write Helm's id onto the active span AND scope,
 *                            so a Sentry issue can be filtered by it.
 *
 * `helm-flight-recorder.ts` already writes `sentry_trace_id`/`root_span_id`
 * into `trace_runs.metadata` from the span it constructs at
 * `createHelmFlightRecorder` time (helm-flight-recorder.ts:247-248) — that
 * is the OTHER inverse direction the Phase B brief asked for, and it
 * predates this file. It is exercised by its own test in
 * helm-flight-recorder.test.ts, not duplicated here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getActiveSpanMock = vi.fn();
const setTagMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  getActiveSpan: (...args: unknown[]) => getActiveSpanMock(...args),
  setTag: (...args: unknown[]) => setTagMock(...args),
}));

import { getSentryCorrelation, attachHelmTrace } from '../correlation';

function fakeSpan(traceId: string, spanId: string, extra: { setAttribute?: ReturnType<typeof vi.fn> } = {}) {
  return {
    spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
    setAttribute: extra.setAttribute ?? vi.fn(),
  };
}

beforeEach(() => {
  getActiveSpanMock.mockReset();
  setTagMock.mockReset();
});

describe('getSentryCorrelation', () => {
  it('returns the active span trace + span id', () => {
    getActiveSpanMock.mockReturnValue(fakeSpan('4bf92f3577b34da6a3ce929d0e0e4736', '00f067aa0ba902b7'));
    expect(getSentryCorrelation()).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
    });
  });

  it('returns null when there is no active span', () => {
    getActiveSpanMock.mockReturnValue(undefined);
    expect(getSentryCorrelation()).toBeNull();
  });

  it('returns null when the active span carries no ids (defensive — should not happen in practice)', () => {
    getActiveSpanMock.mockReturnValue({ spanContext: () => ({ traceId: '', spanId: '' }) });
    expect(getSentryCorrelation()).toBeNull();
  });

  it('never throws — a hostile/mocked SDK surface degrades to null', () => {
    getActiveSpanMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => getSentryCorrelation()).not.toThrow();
    expect(getSentryCorrelation()).toBeNull();
  });
});

describe('attachHelmTrace', () => {
  it('sets helm.trace_id on the active span AND as a scope tag', () => {
    const setAttribute = vi.fn();
    getActiveSpanMock.mockReturnValue(fakeSpan('trace', 'span', { setAttribute }));
    attachHelmTrace('4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e');
    expect(setAttribute).toHaveBeenCalledWith('helm.trace_id', '4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e');
    expect(setTagMock).toHaveBeenCalledWith('helm.trace_id', '4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e');
  });

  it('still sets the scope tag when there is no active span', () => {
    getActiveSpanMock.mockReturnValue(undefined);
    attachHelmTrace('trace-only-tag');
    expect(setTagMock).toHaveBeenCalledWith('helm.trace_id', 'trace-only-tag');
  });

  it('never throws when the span attribute write fails', () => {
    getActiveSpanMock.mockReturnValue(fakeSpan('t', 's', {
      setAttribute: vi.fn(() => { throw new Error('boom'); }),
    }));
    expect(() => attachHelmTrace('x')).not.toThrow();
    // The scope tag write is independent and must still happen.
    expect(setTagMock).toHaveBeenCalledWith('helm.trace_id', 'x');
  });

  it('never throws when the scope tag write fails', () => {
    getActiveSpanMock.mockReturnValue(undefined);
    setTagMock.mockImplementation(() => { throw new Error('boom'); });
    expect(() => attachHelmTrace('x')).not.toThrow();
  });
});

/**
 * The SDK stamps `trace_id` onto a log at SERIALIZATION time, inside
 * `_INTERNAL_captureLog` (@sentry/core/build/types/logs/internal.d.ts) — not
 * inside `Sentry.logger.info` itself, and not inside anything this file or
 * structured-log.ts calls directly. Mocking `@sentry/nextjs` the way this
 * suite (and every other test in this module) mocks it REPLACES that
 * serialization step, so no mock can ever demonstrate the stamped id — the
 * assertion would only ever be testing the mock.
 *
 * The next-best, real assertion: `getSentryCorrelation()` reads the SAME
 * `getActiveSpan()` value the SDK's own serializer reads from, using the
 * REAL SDK (not the module mock above) inside a real `Sentry.startSpan`.
 * That the correlation id is available and matches the span's own id, while
 * a span is active, is the actual mechanism that makes a log's trace_id
 * correct — the SDK's internal stamping is Sentry's own tested contract,
 * not this repo's.
 */
describe('trace correlation with a REAL Sentry SDK (not the module mock above)', () => {
  it('getSentryCorrelation matches the active span it was read from', async () => {
    vi.resetModules();
    vi.doUnmock('@sentry/nextjs');
    const Sentry = await import('@sentry/nextjs');
    const { getSentryCorrelation: realGetSentryCorrelation } = await import('../correlation');

    Sentry.init({ dsn: undefined, tracesSampleRate: 1 });

    let observed: ReturnType<typeof realGetSentryCorrelation> = null;
    await Sentry.startSpan({ name: 'test-span', op: 'test' }, (span) => {
      observed = realGetSentryCorrelation();
      const json = span.spanContext();
      expect(observed).toEqual({ traceId: json.traceId, spanId: json.spanId });
    });
    expect(observed).not.toBeNull();
  });
});
