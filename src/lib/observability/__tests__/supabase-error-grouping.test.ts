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

  /**
   * 2026-10-22 15:29-15:33Z: one Supabase 502 answered by Cloudflare's HTML
   * error page became three Sentry issues (JAVASCRIPT-NEXTJS-1D6/-1D7/-1D8),
   * each titled "Error: <!DOCTYPE html>" and storing the whole page, because
   * the Ray ID and timestamp in the body differ per request.
   */
  it('groups a gateway HTML error page on its HTTP status and keeps only the title', () => {
    const page = (ray: string) =>
      [
        '<!DOCTYPE html>',
        '<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->',
        '<!--[if gt IE 8]><!--> <html class="no-js" lang="en-US"> <!--<![endif]-->',
        '<head>',
        '<title>supabase.co | 502: Bad gateway</title>',
        '</head><body><span class="code-label">Error code 502</span>',
        `<span>Cloudflare Ray ID: <strong>${ray}</strong></span>`,
        '<span id="cf-footer-ip">203.0.113.7</span></body></html>',
      ].join('\n');
    const first = fingerprintSupabaseAutoCapture(autoCapture(page('a4e98d523df5823e')), {
      originalException: new Error(page('a4e98d523df5823e')),
    });
    const second = fingerprintSupabaseAutoCapture(autoCapture(page('b1c2d3e4f5a60718')), {
      originalException: new Error(page('b1c2d3e4f5a60718')),
    });
    expect(first.fingerprint).toEqual(['supabase-gateway', 'http:502']);
    expect(second.fingerprint).toEqual(first.fingerprint);
    expect(first.tags?.http_status).toBe('502');
    const value = first.exception.values[0]?.value ?? '';
    expect(value).toBe('Supabase gateway error page: supabase.co | 502: Bad gateway');
    expect(value).not.toMatch(/<html|Ray ID|203\.0\.113\.7/);
  });

  it('groups a gateway page with no status in its title as unknown', () => {
    const event = fingerprintSupabaseAutoCapture(autoCapture('<html><head></head><body>oops</body></html>'), {
      originalException: new Error('x'),
    });
    expect(event.fingerprint).toEqual(['supabase-gateway', 'http:unknown']);
    expect(event.exception.values[0]?.value).toBe('Supabase gateway error page: HTML error page (no title)');
  });

  it('does not treat a message that merely quotes a tag as a gateway page', () => {
    const event = autoCapture('invalid input syntax near "<html>" in user content');
    expect(fingerprintSupabaseAutoCapture(event, { originalException: new Error('x') })).toBe(event);
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
