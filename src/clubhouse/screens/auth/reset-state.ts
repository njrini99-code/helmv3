import { passwordProblem } from '../onboard/logic';

/**
 * The new-password page's rules and words (P015, front-door completion): today's page is
 * `src/app/golf/(auth)/reset-password/page.tsx` and these are its checks, in the same order, with the same outcomes for
 * a refused save. Nothing here decides what saving does; the Supabase calls are in `reset-writes.ts` and are today's.
 * auth-reset.test holds `describeResetFailure` and the two links' words to today's page.
 */

export const RESET_NEW_EMPTY = 'Enter a new password.';
export const RESET_CONFIRM_EMPTY = 'Enter your new password again.';
export const RESET_MISMATCH = 'These passwords don’t match.';
export const RESET_COMMON = 'That password is too common. Pick something less guessable.';
export const RESET_LINK_EXPIRED = 'Reset links work once and expire after 1 hour. Enter your email and we’ll send a new one.';

export type ResetFieldProblem = { field: 'password' | 'confirm'; message: string; code: 'CH-15030' | 'CH-15130' | 'CH-15131' | 'CH-15132' | 'CH-15133' };

/**
 * The first thing wrong with the two boxes, or null when the page may save. The order is today's: nothing typed, a rule
 * missing, the confirmation empty, the two different. The rule sentences are sign up's (`passwordProblem`), which are
 * the server's rules in the design's words.
 */
export function resetFieldProblem(password: string, confirm: string): ResetFieldProblem | null {
  if (!password) return { field: 'password', message: RESET_NEW_EMPTY, code: 'CH-15130' };
  const rule = passwordProblem(password);
  if (rule) return { field: 'password', message: rule, code: 'CH-15131' };
  if (!confirm) return { field: 'confirm', message: RESET_CONFIRM_EMPTY, code: 'CH-15132' };
  if (confirm !== password) return { field: 'confirm', message: RESET_MISMATCH, code: 'CH-15133' };
  return null;
}

export type ResetFailure = { kind: 'field'; message: string } | { kind: 'banner'; message: string } | { kind: 'expired' };

interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  name?: string | null;
  message?: string | null;
}

const EXPIRED_CODES = new Set(['session_not_found', 'session_expired', 'bad_jwt', 'refresh_token_not_found', 'user_not_found']);

/** Today's `describeResetFailure`: a refused save, in a sentence a person can act on, and where it belongs. */
export function describeResetFailure(error: AuthErrorLike): ResetFailure {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (code === 'same_password' || message.includes('different from the old password')) {
    return { kind: 'field', message: 'Choose a password you haven’t used here before.' };
  }
  if (code === 'weak_password' || message.includes('weak') || message.includes('pwned')) {
    return { kind: 'field', message: 'That password is too easy to guess. Try a longer one.' };
  }
  if (EXPIRED_CODES.has(code) || error.status === 401 || error.status === 403 || message.includes('session missing') || message.includes('expired')) {
    return { kind: 'expired' };
  }
  if (code === 'over_request_rate_limit' || error.status === 429) {
    return { kind: 'banner', message: 'Too many tries. Wait a minute, then try again.' };
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || message.includes('fetch') || message.includes('network') || message.includes('timed out')) {
    return { kind: 'banner', message: 'Couldn’t save. Check your connection and try again.' };
  }
  return { kind: 'banner', message: 'Couldn’t save your password. Try again.' };
}

/** Two addresses are the same account when they differ only by case or spaces. */
export const sameAccount = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
