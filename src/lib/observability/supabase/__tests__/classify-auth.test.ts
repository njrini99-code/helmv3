import { describe, it, expect } from 'vitest';
import { classifyAuthError, type ClassifyAuthContext } from '../classify-auth';

const baseCtx: ClassifyAuthContext = {
  feature: 'auth',
  action: 'sign_in',
  operation: 'sign_in',
};

describe('classifyAuthError — unconditionally expected codes', () => {
  it('invalid_credentials is expected/info', () => {
    const result = classifyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }, baseCtx);
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
    expect(result.authCode).toBe('invalid_credentials');
  });

  it.each(['otp_expired', 'email_not_confirmed', 'weak_password', 'validation_failed', 'same_password'])(
    '%s is expected/info',
    (code) => {
      const result = classifyAuthError({ code }, baseCtx);
      expect(result.expectedness, code).toBe('expected');
      expect(result.severity, code).toBe('info');
    },
  );
});

describe('classifyAuthError — context-sensitive codes', () => {
  it('user_not_found on a sign-in probe is expected/info', () => {
    const result = classifyAuthError({ code: 'user_not_found' }, { ...baseCtx, operation: 'sign_in' });
    expect(result.expectedness).toBe('expected');
  });

  it('user_not_found on a non-sign-in path is unexpected/warning', () => {
    const result = classifyAuthError({ code: 'user_not_found' }, { ...baseCtx, operation: 'other' });
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('warning');
  });

  it('session_not_found on sign-out is expected/info', () => {
    const result = classifyAuthError({ code: 'session_not_found' }, { ...baseCtx, operation: 'sign_out' });
    expect(result.expectedness).toBe('expected');
  });

  it('session_not_found mid-session (no expectedSessionAbsence) is unexpected/warning', () => {
    const result = classifyAuthError({ code: 'session_not_found' }, { ...baseCtx, operation: 'other' });
    expect(result.expectedness).toBe('unexpected');
  });

  it('session_not_found is expected when the caller declares expectedSessionAbsence', () => {
    const result = classifyAuthError(
      { code: 'session_not_found' },
      { ...baseCtx, operation: 'other', expectedSessionAbsence: true },
    );
    expect(result.expectedness).toBe('expected');
  });

  it('provider_disabled defaults to unexpected/warning; expectedProviderDisabled flips to expected/info', () => {
    const unexpected = classifyAuthError({ code: 'provider_disabled' }, baseCtx);
    expect(unexpected.expectedness).toBe('unexpected');

    const expected = classifyAuthError(
      { code: 'provider_disabled' },
      { ...baseCtx, expectedProviderDisabled: true },
    );
    expect(expected.expectedness).toBe('expected');
  });

  it('bad_jwt defaults to unexpected/error; expectedUnauthenticated flips to expected/info', () => {
    const unexpected = classifyAuthError({ code: 'bad_jwt' }, baseCtx);
    expect(unexpected.expectedness).toBe('unexpected');
    expect(unexpected.severity).toBe('error');

    const expected = classifyAuthError({ code: 'bad_jwt' }, { ...baseCtx, expectedUnauthenticated: true });
    expect(expected.expectedness).toBe('expected');
  });

  it('no_authorization follows the same expectedUnauthenticated rule as bad_jwt', () => {
    const unexpected = classifyAuthError({ code: 'no_authorization' }, baseCtx);
    expect(unexpected.expectedness).toBe('unexpected');
    expect(unexpected.severity).toBe('error');
  });
});

describe('classifyAuthError — actionable codes', () => {
  it('over_request_rate_limit is warning by default', () => {
    const result = classifyAuthError({ code: 'over_request_rate_limit' }, baseCtx);
    expect(result.severity).toBe('warning');
    expect(result.expectedness).toBe('unexpected');
  });

  it('over_request_rate_limit becomes critical when the caller declares a known spike', () => {
    const result = classifyAuthError({ code: 'over_request_rate_limit' }, { ...baseCtx, isRateLimitSpike: true });
    expect(result.severity).toBe('critical');
  });

  it('429 status (no code) follows the same rate-limit rule via the status fallback', () => {
    const result = classifyAuthError({ code: null, status: 429 }, baseCtx);
    expect(result.severity).toBe('warning');
    expect(result.authCode).toBeNull();
    expect(result.httpStatus).toBe(429);
  });

  it('unexpected_failure is critical/unexpected', () => {
    const result = classifyAuthError({ code: 'unexpected_failure' }, baseCtx);
    expect(result.severity).toBe('critical');
    expect(result.expectedness).toBe('unexpected');
  });

  it('a 5xx status with no code classifies as critical via the status fallback', () => {
    const result = classifyAuthError({ code: null, status: 500 }, baseCtx);
    expect(result.severity).toBe('critical');
  });

  it('bad_oauth_state and bad_oauth_callback classify as error/unexpected', () => {
    for (const code of ['bad_oauth_state', 'bad_oauth_callback']) {
      const result = classifyAuthError({ code }, baseCtx);
      expect(result.severity, code).toBe('error');
      expect(result.expectedness, code).toBe('unexpected');
    }
  });

  it('refresh_token_not_found and refresh_token_already_used are warning/unexpected with terminal:false', () => {
    for (const code of ['refresh_token_not_found', 'refresh_token_already_used']) {
      const result = classifyAuthError({ code }, baseCtx);
      expect(result.severity, code).toBe('warning');
      expect(result.expectedness, code).toBe('unexpected');
      expect(result.terminal, code).toBe(false);
    }
  });

  it('hook_timeout and hook_timeout_after_retry classify as error/unexpected/retryable', () => {
    for (const code of ['hook_timeout', 'hook_timeout_after_retry']) {
      const result = classifyAuthError({ code }, baseCtx);
      expect(result.severity, code).toBe('error');
      expect(result.retryability, code).toBe('conditional');
    }
  });

  it('hook_payload_over_size_limit and hook_payload_invalid_content_type are error/not-retryable', () => {
    for (const code of ['hook_payload_over_size_limit', 'hook_payload_invalid_content_type']) {
      const result = classifyAuthError({ code }, baseCtx);
      expect(result.severity, code).toBe('error');
      expect(result.retryability, code).toBe('no');
    }
  });
});

describe('classifyAuthError — code-first, status/message as fallback only', () => {
  it('a code is used even when a status is also present and would classify differently', () => {
    // invalid_credentials with an incidental 500 status must still classify
    // as the routine sign-in failure the CODE says it is.
    const result = classifyAuthError({ code: 'invalid_credentials', status: 500 }, baseCtx);
    expect(result.expectedness).toBe('expected');
  });

  it('falls back to status only when code is absent', () => {
    const result = classifyAuthError({ code: null, status: 401 }, baseCtx);
    expect(result.httpStatus).toBe(401);
    expect(result.authCode).toBeNull();
  });

  it('falls back to message matching only when both code and status are absent', () => {
    const result = classifyAuthError({ code: null, status: null, message: 'Invalid login credentials' }, baseCtx);
    expect(result.expectedness).toBe('expected');
    expect(result.authCode).toBeNull();
    expect(result.httpStatus).toBeNull();
  });

  it('an unrecognized code lands in the unknown-expectedness bucket rather than being silently dropped', () => {
    const result = classifyAuthError({ code: 'mfa_verification_failed' }, baseCtx);
    expect(result.expectedness).toBe('unknown');
  });

  it('never throws on a malformed error object', () => {
    expect(() => classifyAuthError({} as never, baseCtx)).not.toThrow();
    expect(() => classifyAuthError({ code: undefined, status: undefined, message: undefined }, baseCtx)).not.toThrow();
  });
});

/**
 * `expectedMissingUser` — added 2026-09-03 by the Auth WIRING pass so the
 * password-reset link minter (`lib/auth/send-password-reset.ts`) can say
 * "an unregistered address is routine HERE" without mislabelling its
 * operation as a sign-in. Additive: the flag defaults false, so every
 * pre-existing caller classifies exactly as it did before.
 */
describe('classifyAuthError — expectedMissingUser', () => {
  const resetCtx = { feature: 'auth_password_reset', action: 'send_password_reset_link', operation: 'password_reset' as const };

  it('user_not_found on a password-reset path is EXPECTED when the caller declares it', () => {
    const result = classifyAuthError({ code: 'user_not_found', status: 404 }, { ...resetCtx, expectedMissingUser: true });
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('the SAME code on the SAME operation stays UNEXPECTED without the flag — silence is never evidence of routineness', () => {
    const result = classifyAuthError({ code: 'user_not_found', status: 404 }, resetCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('warning');
  });

  it('the flag does not reclassify anything else — a 429 on the same path is still actionable', () => {
    const result = classifyAuthError({ code: 'over_request_rate_limit' }, { ...resetCtx, expectedMissingUser: true });
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('warning');
  });

  it('the flag does not reclassify a GoTrue 5xx on the same path', () => {
    const result = classifyAuthError({ code: 'unexpected_failure' }, { ...resetCtx, expectedMissingUser: true });
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('critical');
  });

  it('covers the code-less 404 fallback too — a GoTrue release that omits `code` must not page anyone', () => {
    const withFlag = classifyAuthError({ code: null, status: 404 }, { ...resetCtx, expectedMissingUser: true });
    expect(withFlag.expectedness).toBe('expected');

    const withoutFlag = classifyAuthError({ code: null, status: 404 }, resetCtx);
    expect(withoutFlag.expectedness).toBe('unknown');
  });

  it('sign_in keeps its own pre-existing user_not_found expectedness, flag or no flag', () => {
    const signInCtx = { feature: 'golf_auth', action: 'golf.login', operation: 'sign_in' as const };
    expect(classifyAuthError({ code: 'user_not_found' }, signInCtx).expectedness).toBe('expected');
    expect(classifyAuthError({ code: 'user_not_found' }, { ...signInCtx, expectedMissingUser: true }).expectedness).toBe('expected');
  });
});
