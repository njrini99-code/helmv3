import { describe, it, expect } from 'vitest';
import { classifyAuthError, type ClassifyAuthContext } from '../classify-auth';

const baseCtx: ClassifyAuthContext = {
  operation: 'sign_in',
  feature: 'auth_onboarding',
  action: 'golf.login',
};

describe('classifyAuthError — expected/low (brief §10)', () => {
  it('invalid_credentials is expected/info', () => {
    const result = classifyAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, baseCtx);
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('otp_expired is expected/info', () => {
    const result = classifyAuthError({ code: 'otp_expired', status: 400, message: 'Token has expired' }, baseCtx);
    expect(result.expectedness).toBe('expected');
  });

  it('session_not_found is routine_recovery, not expected and not unexpected', () => {
    const result = classifyAuthError({ code: 'session_not_found', status: 401 }, baseCtx);
    expect(result.expectedness).toBe('routine_recovery');
    expect(result.family).toBe('session');
  });
});

describe('classifyAuthError — provider_disabled is context-sensitive', () => {
  it('unexpected/error when the provider is not declared optional', () => {
    const result = classifyAuthError({ code: 'provider_disabled', status: 422 }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('error');
  });

  it('expected/info when the caller declares the provider optional', () => {
    const result = classifyAuthError({ code: 'provider_disabled', status: 422 }, { ...baseCtx, providerOptional: true });
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('the SAME code differs by context, same discipline as classify.ts 42501', () => {
    const unexpected = classifyAuthError({ code: 'signup_disabled', status: 422 }, baseCtx);
    const expected = classifyAuthError({ code: 'signup_disabled', status: 422 }, { ...baseCtx, providerOptional: true });
    expect(unexpected.expectedness).not.toBe(expected.expectedness);
  });
});

describe('classifyAuthError — actionable (brief §10)', () => {
  it('unexpected_failure (DB-trigger-caused 500) is critical/unexpected', () => {
    const result = classifyAuthError({ code: 'unexpected_failure', status: 500 }, baseCtx);
    expect(result.severity).toBe('critical');
    expect(result.expectedness).toBe('unexpected');
    expect(result.family).toBe('server_error');
  });

  it('bad_oauth_callback is always actionable — never routine, unlike a wrong password', () => {
    const result = classifyAuthError({ code: 'bad_oauth_callback', status: 400 }, { ...baseCtx, operation: 'oauth_callback' });
    expect(result.expectedness).toBe('unexpected');
    expect(result.family).toBe('oauth');
  });

  it('refresh_token_not_found is warning/unexpected, retryable — the "misclassified as sign-out" case', () => {
    const result = classifyAuthError({ code: 'refresh_token_not_found', status: 401 }, { ...baseCtx, operation: 'refresh_session' });
    expect(result.severity).toBe('warning');
    expect(result.expectedness).toBe('unexpected');
    expect(result.retryability).toBe('conditional');
  });

  it('rate limit codes classify as warning/rate_limit, retryable', () => {
    const result = classifyAuthError({ code: 'over_email_send_rate_limit', status: 429 }, { ...baseCtx, operation: 'otp_send' });
    expect(result.family).toBe('rate_limit');
    expect(result.retryability).toBe('yes');
  });
});

describe('classifyAuthError — status/message fallbacks', () => {
  it('falls back to status when code is absent', () => {
    const result = classifyAuthError({ status: 500, message: 'internal server error' }, baseCtx);
    expect(result.family).toBe('server_error');
    expect(result.severity).toBe('critical');
  });

  it('a retryable fetch error (network failure, never reached GoTrue) classifies as network/warning/retryable', () => {
    const result = classifyAuthError({ isRetryableFetchError: true, message: 'fetch failed' }, baseCtx);
    expect(result.family).toBe('network');
    expect(result.retryability).toBe('yes');
    expect(result.authCode).toBeNull();
  });

  it('unknown code AND missing status classifies as unknown, never throws', () => {
    const result = classifyAuthError({ message: 'something odd' }, baseCtx);
    expect(result.family).toBe('unknown');
    expect(result.expectedness).toBe('unknown');
  });

  it('a completely malformed input never throws', () => {
    expect(() => classifyAuthError(null as never, baseCtx)).not.toThrow();
    const result = classifyAuthError(null as never, baseCtx);
    expect(result.code).toBe('classifier_failure');
  });
});
