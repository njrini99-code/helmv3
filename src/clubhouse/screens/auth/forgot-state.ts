/**
 * The reset form's rules and words: today's (`src/app/golf/(auth)/forgot-password/page.tsx`), unchanged. The address is
 * trimmed and lowercased before it is checked or sent, and a malformed one never reaches the server (a "sent" screen
 * for an address that cannot exist was the 2026-09-02 audit finding). auth-forgot.test holds the two copies together.
 */
export const RESET_EMPTY_MESSAGE = 'Enter your email address.';
export const RESET_INVALID_MESSAGE = 'Enter a valid email address.';
export const RESET_UNEXPECTED_MESSAGE = 'An unexpected error occurred. Please try again.';

// Pragmatic format check, not a full RFC 5322 validator (today's).
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeResetEmail = (raw: string) => raw.trim().toLowerCase();

/** CH-15120 an empty address, CH-15121 one that is not an address; null when it can be sent. */
export function resetEmailProblem(normalized: string): { message: string; code: 'CH-15120' | 'CH-15121' } | null {
  if (!normalized) return { message: RESET_EMPTY_MESSAGE, code: 'CH-15120' };
  if (!EMAIL_FORMAT.test(normalized)) return { message: RESET_INVALID_MESSAGE, code: 'CH-15121' };
  return null;
}
