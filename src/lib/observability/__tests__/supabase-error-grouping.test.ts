import { describe, it, expect } from 'vitest';
import {
  fingerprintSupabaseAutoCapture,
  isInfrastructurePgCode,
  postgresCodeFromHint,
} from '../supabase-error-grouping';

/** The shape Sentry's Supabase integration produces (@sentry/core integrations/supabase.js). */
type AutoCaptureEvent = {
  fingerprint?: string[];
  tags?: Record<string, unknown>;
  exception: { values: Array<{ value: string; mechanism: { type: string } }> };
};

function autoCapture(value: string): AutoCaptureEvent {
  return {
    exception: { values: [{ value, mechanism: { type: 'auto.db.supabase.postgres' } }] },
  };
}

function codedError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

describe('fingerprintSupabaseAutoCapture', () => {
  /**
   * 2026-09-18 19:54Z: one PostgREST schema-cache reload surfaced from 15+
   * call sites. Each became its own Sentry issue because the code lived only
   * on hint.originalException.
   */
  it('groups an infrastructure code across call sites on the code alone', () => {
    const message = 'Could not query the database for the schema cache. Retrying.';
    const event = fingerprintSupabaseAutoCapture(autoCapture(message), {
      originalException: codedError(message, 'PGRST002'),
    });
    expect(event.fingerprint).toEqual(['supabase-infra', 'pg:PGRST002']);
    expect(event.tags?.pg_code).toBe('PGRST002');
  });

  it('groups statement timeouts together', () => {
    const message = 'canceling statement due to statement timeout';
    const event = fingerprintSupabaseAutoCapture(autoCapture(message), {
      originalException: codedError(message, '57014'),
    });
    expect(event.fingerprint).toEqual(['supabase-infra', 'pg:57014']);
  });

  it('keeps default grouping as the first axis for query-specific codes', () => {
    const message = 'permission denied for table golf_message_reactions';
    const event = fingerprintSupabaseAutoCapture(autoCapture(message), {
      originalException: codedError(message, '42501'),
    });
    expect(event.fingerprint).toEqual(['{{ default }}', 'pg:42501']);
  });

  it('groups uncoded transport failures by kind', () => {
    const cases: Array<[string, string]> = [
      ['TimeoutError: The operation was aborted due to timeout', 'timeout'],
      ['TimeoutError: signal timed out', 'timeout'],
      ['AbortError: This operation was aborted', 'aborted'],
      ['TypeError: fetch failed', 'fetch-failed'],
    ];
    for (const [value, kind] of cases) {
      const event = fingerprintSupabaseAutoCapture(autoCapture(value), { originalException: new Error(value) });
      expect(event.fingerprint).toEqual(['supabase-transport', kind]);
    }
  });

  it('never overrides a deliberate fingerprint', () => {
    const event = { ...autoCapture('x'), fingerprint: ['deliberate'] };
    expect(fingerprintSupabaseAutoCapture(event, { originalException: codedError('x', '57014') }).fingerprint).toEqual([
      'deliberate',
    ]);
  });

  it('leaves events from any other mechanism untouched', () => {
    const event = {
      exception: { values: [{ value: 'canceling statement', mechanism: { type: 'generic' } }] },
    };
    expect(fingerprintSupabaseAutoCapture(event, { originalException: codedError('x', '57014') })).toBe(event);
  });

  it('leaves an auto-capture with no code and no transport signature untouched', () => {
    const event = autoCapture('something unexpected');
    expect(fingerprintSupabaseAutoCapture(event, { originalException: new Error('x') })).toBe(event);
  });
});

describe('isInfrastructurePgCode', () => {
  it.each(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '08006', '53300', '57014', '57P01', '55P03'])(
    'treats %s as infrastructure',
    (code) => expect(isInfrastructurePgCode(code)).toBe(true),
  );
  it.each(['PGRST116', 'PGRST202', '42501', '23505', '22P02'])('treats %s as query-specific', (code) =>
    expect(isInfrastructurePgCode(code)).toBe(false),
  );
});

describe('postgresCodeFromHint', () => {
  it('reads the code the integration attaches to the Error', () => {
    expect(postgresCodeFromHint({ originalException: codedError('x', '23505') })).toBe('23505');
  });
  it('ignores anything that is not a Postgres or PostgREST code', () => {
    expect(postgresCodeFromHint({ originalException: codedError('x', 'ECONNRESET') })).toBeNull();
    expect(postgresCodeFromHint({ originalException: 'string' })).toBeNull();
    expect(postgresCodeFromHint(undefined)).toBeNull();
  });
});
