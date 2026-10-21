/**
 * Plain-language outcomes for a failed `updateUser({ password })`.
 *
 * The page used to show Supabase's raw error text ("New password should be
 * different from the old password.", "Auth session missing!"). Each case below
 * maps to a sentence a coach or player can act on, and to WHERE it belongs:
 * under the password field, in a banner, or as the expired-link state.
 */

export type ResetFailure =
  | { kind: 'field'; message: string }
  | { kind: 'banner'; message: string }
  | { kind: 'expired' };

interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  name?: string | null;
  message?: string | null;
}

const EXPIRED_CODES = new Set(['session_not_found', 'session_expired', 'bad_jwt', 'refresh_token_not_found', 'user_not_found']);

export function describeResetFailure(error: AuthErrorLike): ResetFailure {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (code === 'same_password' || message.includes('different from the old password')) {
    return { kind: 'field', message: 'Choose a password you haven’t used here before.' };
  }
  if (code === 'weak_password' || message.includes('weak') || message.includes('pwned')) {
    return { kind: 'field', message: 'That password is too easy to guess. Try a longer one.' };
  }
  if (
    EXPIRED_CODES.has(code) ||
    error.status === 401 ||
    error.status === 403 ||
    message.includes('session missing') ||
    message.includes('expired')
  ) {
    return { kind: 'expired' };
  }
  if (code === 'over_request_rate_limit' || error.status === 429) {
    return { kind: 'banner', message: 'Too many tries. Wait a minute, then try again.' };
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timed out')
  ) {
    return { kind: 'banner', message: 'Couldn’t save. Check your connection and try again.' };
  }
  return { kind: 'banner', message: 'Couldn’t save your password. Try again.' };
}
