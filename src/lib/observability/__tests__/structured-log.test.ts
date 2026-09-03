/**
 * `helmLog.{debug,info,warn,error}` is the normalized entry point onto
 * `Sentry.logger` — every call carries a dot-namespaced `event` plus the
 * shared low-cardinality fields (`sport`, `feature`, `action`, `result`,
 * `error_code`, `retry`, `runtime`), and refuses secret-shaped field names
 * (dropping the field, never the whole log call). These tests lock the
 * refusal list, the redaction of extra string fields, the 2KB object cap,
 * and the "never throw" contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const traceMock = vi.fn();
const debugMock = vi.fn();
const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();
const countMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  logger: {
    trace: (...args: unknown[]) => traceMock(...args),
    debug: (...args: unknown[]) => debugMock(...args),
    info: (...args: unknown[]) => infoMock(...args),
    warn: (...args: unknown[]) => warnMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
  metrics: {
    count: (...args: unknown[]) => countMock(...args),
    gauge: vi.fn(),
    distribution: vi.fn(),
  },
}));

import { helmLog } from '../structured-log';
import { METRIC_LOG_REDACTED_FIELD } from '../metrics';

beforeEach(() => {
  debugMock.mockReset();
  infoMock.mockReset();
  warnMock.mockReset();
  errorMock.mockReset();
  countMock.mockReset();
});

describe('helmLog — level routing', () => {
  it('routes each level to the matching Sentry.logger method', () => {
    helmLog.debug('golf.round.autosave.started', {});
    helmLog.info('golf.round.autosave.succeeded', {});
    helmLog.warn('golf.round.autosave.degraded', {});
    helmLog.error('golf.round.autosave.failed', {});
    expect(debugMock).toHaveBeenCalledTimes(1);
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('passes the event string as the message and as the `event` attribute', () => {
    helmLog.info('golf.round.autosave.succeeded', {});
    expect(infoMock).toHaveBeenCalledWith(
      'golf.round.autosave.succeeded',
      expect.objectContaining({ event: 'golf.round.autosave.succeeded' }),
    );
  });
});

describe('helmLog — normalized fields', () => {
  it('carries sport/feature/action/result/error_code/retry/runtime onto attributes', () => {
    helmLog.error('golf.round.submit.failed', {
      sport: 'golf',
      feature: 'round_tracking',
      action: 'submit_round',
      result: 'rpc_failed',
      error_code: '57014',
      retry: 2,
      runtime: 'nodejs',
    });
    expect(errorMock).toHaveBeenCalledWith('golf.round.submit.failed', expect.objectContaining({
      sport: 'golf',
      feature: 'round_tracking',
      action: 'submit_round',
      result: 'rpc_failed',
      error_code: '57014',
      retry: 2,
      runtime: 'nodejs',
    }));
  });

  it('omits normalized fields that were not supplied, rather than sending "undefined"', () => {
    helmLog.info('golf.round.autosave.started', {});
    const attrs = infoMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(attrs).not.toHaveProperty('sport');
    expect(attrs).not.toHaveProperty('retry');
  });
});

describe('helmLog — secret-shaped field refusal', () => {
  const secretKeys = ['token', 'secret', 'password', 'authorization', 'cookie', 'key', 'jwt', 'apikey', 'Authorization', 'API_KEY'];

  for (const key of secretKeys) {
    it(`drops a top-level field named "${key}" and bumps the redaction counter`, () => {
      helmLog.info('golf.round.autosave.started', { [key]: 'sentry-test-secret-DO-NOT-STORE-123' } as never);
      const attrs = infoMock.mock.calls[0]![1] as Record<string, unknown>;
      expect(JSON.stringify(attrs)).not.toContain('sentry-test-secret-DO-NOT-STORE-123');
      expect(countMock).toHaveBeenCalledWith(METRIC_LOG_REDACTED_FIELD, 1, expect.anything());
    });
  }

  it('drops a NESTED secret-shaped key inside an object field', () => {
    helmLog.warn('golf.round.autosave.degraded', {
      context: { user: { authToken: 'sentry-test-secret-DO-NOT-STORE-123' } },
    } as never);
    const attrs = warnMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(JSON.stringify(attrs)).not.toContain('sentry-test-secret-DO-NOT-STORE-123');
  });

  it('keeps an ordinary field whose name does not match a secret pattern', () => {
    helmLog.info('golf.round.autosave.started', { holesCount: 18 } as never);
    const attrs = infoMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(attrs.holesCount).toBe(18);
  });
});

describe('helmLog — extra field redaction', () => {
  it('masks an email address in an extra string field', () => {
    helmLog.error('golf.email.send_failed', { recipient: 'nick@example.com' } as never);
    const attrs = errorMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(attrs.recipient).toBe('n***@example.com');
  });

  it('never sends a raw object — stringifies and caps at ~2KB', () => {
    const bigArray = Array.from({ length: 500 }, (_, i) => ({ shotIndex: i, distance: 123.45 }));
    helmLog.warn('golf.shot.persist.slow', { shots: bigArray } as never);
    const attrs = warnMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof attrs.shots).toBe('string');
    expect((attrs.shots as string).length).toBeLessThanOrEqual(2000);
  });

  it('passes through numbers and booleans unchanged', () => {
    helmLog.info('golf.round.autosave.started', { holesCount: 18, isRecovery: true } as never);
    const attrs = infoMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(attrs.holesCount).toBe(18);
    expect(attrs.isRecovery).toBe(true);
  });

  it('drops null and undefined extra fields', () => {
    helmLog.info('golf.round.autosave.started', { playerId: null, teamId: undefined } as never);
    const attrs = infoMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(attrs).not.toHaveProperty('playerId');
    expect(attrs).not.toHaveProperty('teamId');
  });
});

describe('helmLog — never throws', () => {
  it('swallows an SDK failure', () => {
    infoMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => helmLog.info('golf.round.autosave.started', {})).not.toThrow();
  });

  it('swallows a hostile field shape', () => {
    const hostile = { get poison(): string { throw new Error('boom'); } };
    expect(() => helmLog.info('golf.round.autosave.started', hostile as never)).not.toThrow();
  });

  it('never throws even when event is not a string', () => {
    expect(() => helmLog.info(undefined as unknown as string, {})).not.toThrow();
  });
});
