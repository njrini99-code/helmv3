import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepeatErrorSampler, repeatErrorKey, REPEAT_ERROR_PER_KEY, REPEAT_ERROR_TOTAL } from '../repeat-error-sampler';

/**
 * MAC-12 (production audit 2026-11-15): the Sentry tunnel returned 429 because a page sent the same error again and
 * again. A page load now sends the first few of each error and a bounded total.
 */

const err = (type: string, value: string) => ({ exception: { values: [{ type, value }] } });

describe('repeatErrorKey', () => {
  it('folds the digits that vary between repeats of one error', () => {
    expect(repeatErrorKey(err('TypeError', 'Row 12 failed after 300ms'))).toBe(repeatErrorKey(err('TypeError', 'Row 13 failed after 1200ms')));
  });

  it('tells different errors apart by type and text', () => {
    expect(repeatErrorKey(err('TypeError', 'x is undefined'))).not.toBe(repeatErrorKey(err('RangeError', 'x is undefined')));
    expect(repeatErrorKey(err('TypeError', 'x is undefined'))).not.toBe(repeatErrorKey(err('TypeError', 'y is undefined')));
  });

  it('keys a message event by its message, and an empty event by nothing', () => {
    expect(repeatErrorKey({ message: 'Slow read 4521ms' })).toBe('Slow read #ms');
    expect(repeatErrorKey({})).toBeNull();
  });
});

describe('createRepeatErrorSampler', () => {
  it('sends the first few of one error and drops the rest', () => {
    const s = createRepeatErrorSampler();
    const sent = Array.from({ length: 10 }, (_, i) => s.keep(err('TypeError', `Row ${i} failed`)));
    expect(sent.filter(Boolean)).toHaveLength(REPEAT_ERROR_PER_KEY);
    expect(sent.slice(0, REPEAT_ERROR_PER_KEY).every(Boolean)).toBe(true);
  });

  it('an error that alternates with another is still capped (Sentry’s dedupe lets that through)', () => {
    const s = createRepeatErrorSampler({ perKey: 2 });
    const sent = Array.from({ length: 8 }, (_, i) => s.keep(i % 2 ? err('A', 'a') : err('B', 'b')));
    expect(sent).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('a new error still goes through after another has hit its cap', () => {
    const s = createRepeatErrorSampler({ perKey: 1 });
    expect(s.keep(err('A', 'a'))).toBe(true);
    expect(s.keep(err('A', 'a'))).toBe(false);
    expect(s.keep(err('B', 'b'))).toBe(true);
  });

  it('past the total for the page load, nothing more is sent', () => {
    const s = createRepeatErrorSampler();
    const sent = Array.from({ length: REPEAT_ERROR_TOTAL + 5 }, (_, i) => s.keep(err('E', `distinct ${String.fromCharCode(65 + (i % 26))}${'x'.repeat(i)}`)));
    expect(sent.filter(Boolean)).toHaveLength(REPEAT_ERROR_TOTAL);
  });
});

// The wiring: the client's Sentry.init drops the fourth repeat in beforeSend and names the dedupe integration.
const initMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  replayIntegration: () => ({ name: 'Replay' }),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));

describe('instrumentation-client wiring', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));
  afterEach(() => vi.unstubAllEnvs());

  it('beforeSend drops an error past its allowance for the page load', async () => {
    vi.resetModules();
    initMock.mockClear();
    await import('@/instrumentation-client');
    const { beforeSend } = initMock.mock.calls.at(-1)![0] as { beforeSend: (e: unknown, h: unknown) => unknown };
    const results = Array.from({ length: REPEAT_ERROR_PER_KEY + 2 }, () => beforeSend(err('TypeError', 'Cannot read properties of undefined'), {}));
    expect(results.slice(0, REPEAT_ERROR_PER_KEY).every((r) => r !== null)).toBe(true);
    expect(results.slice(REPEAT_ERROR_PER_KEY)).toEqual([null, null]);
  });

  it('names the dedupe integration in the browser list', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', '..', '..', 'instrumentation-client.ts'), 'utf8');
    expect(src).toContain('Sentry.dedupeIntegration()');
    expect(src).toContain('repeatErrors.keep(event)');
  });
});
