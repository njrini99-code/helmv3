/**
 * The pure rules of the GolfHelm sign-in form, shared by the current form
 * (`components/auth/golf-sign-in-form.tsx`) and the Clubhouse one
 * (`clubhouse/screens/auth/SignInForm.tsx`). They live here so the two screens
 * cannot drift: what a failed sign-in says, which field it marks, where a
 * successful one goes, and when a stale bundle reloads the page are decided
 * once. Nothing here touches React, Supabase or the server action: the form
 * still calls `loginAction` (which resets the shared idle marker before it
 * returns success) and does its own navigation.
 */
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';

export type InvalidField = 'email' | 'password' | 'both' | null;

export const CREDENTIALS_MESSAGE = 'Incorrect email or password. Please check your credentials and try again.';
export const UNVERIFIED_MESSAGE = 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
export const RATE_LIMIT_MESSAGE = 'Too many sign-in attempts. Please wait a moment and try again.';
export const NETWORK_MESSAGE = 'Unable to reach the server. Please check your internet connection and try again.';
export const EMPTY_FIELDS_MESSAGE = 'Enter your email and password to sign in.';
export const STALE_BUNDLE_MESSAGE = 'The app updated in the background. Please try signing in once more.';
export const UNEXPECTED_MESSAGE = 'An unexpected error occurred. Please try again.';

/** Turns the server action's error text into what the person reads. Anything it does not recognise passes through. */
export function getErrorMessage(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return CREDENTIALS_MESSAGE;
  }
  if (lower.includes('email not confirmed')) {
    return UNVERIFIED_MESSAGE;
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return RATE_LIMIT_MESSAGE;
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return NETWORK_MESSAGE;
  }
  return error;
}

/** The notices `/golf/login?message=` can show (the middleware and the other auth pages send these keys). */
export const SIGN_IN_NOTICES: Readonly<Record<string, string>> = {
  session_expired: 'Session expired. Please sign in again.',
  password_reset: 'Password reset successfully. Please sign in with your new password.',
  account_created: 'Account created successfully. Please sign in.',
  signed_out: 'You have been signed out.',
};

/** A credentials rejection is about both fields; other failures (rate limit, network) are not about field content. */
export function invalidFieldFor(message: string): InvalidField {
  return message === CREDENTIALS_MESSAGE ? 'both' : null;
}

/**
 * One reload per tab. sessionStorage rather than component state, because the
 * reload itself destroys state: without this the guard would reset on every
 * pass and a genuinely broken deploy would loop the sign-in screen.
 */
export const STALE_BUNDLE_RELOAD_KEY = 'golf.signin.staleBundleReloaded';

export function hasReloadedForStaleBundle(): boolean {
  try {
    return window.sessionStorage.getItem(STALE_BUNDLE_RELOAD_KEY) === '1';
  } catch {
    // Private mode / storage disabled: treat as "already reloaded" so we show
    // the message rather than risk a loop we cannot track.
    return true;
  }
}

export function markReloadedForStaleBundle(): void {
  try {
    window.sessionStorage.setItem(STALE_BUNDLE_RELOAD_KEY, '1');
  } catch {
    /* nothing to do: hasReloadedForStaleBundle() fails closed */
  }
}

/**
 * Next's message for a Server Action whose response it could not parse, or
 * whose id it no longer knows (a deploy in between). It is not a login
 * failure: one reload replaces what the client is holding.
 */
export function isStaleBundleError(message: string): boolean {
  return /unexpected response was received from the server/i.test(message) || /failed to find server action/i.test(message);
}

/** A join code out of a returnTo that points at the invite route, e.g. /golf/join/ABC123 gives "ABC123" (any query or hash stripped). */
export function extractJoinCode(path: string): string | null {
  const match = path.match(/^\/golf\/join\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** The two onboarding routes the server action names for someone with no profile yet. */
export function needsOnboardingFor(redirectTo: string | undefined): boolean {
  return redirectTo === '/golf/coach' || redirectTo === '/golf/player';
}

/**
 * Where a successful sign-in goes.
 *  - Fully onboarded with a safe stored returnTo: that path, through the welcome.
 *  - Heading into onboarding with an invite returnTo: onboarding with `?joinCode=`, so the new player auto-joins on completion (coach onboarding ignores it).
 *  - Otherwise the server's `redirectTo`, else the dashboard; a stale returnTo is dropped, onboarding takes priority.
 * Onboarding skips the welcome (no profile yet, so it has no name to greet); everything else goes `/golf/welcome?next=`.
 */
export function resolveSignInHref(redirectTo: string | undefined, storedReturnTo: string | null): string {
  const needsOnboarding = needsOnboardingFor(redirectTo);
  let destination: string;
  if (storedReturnTo && !needsOnboarding && isSafeInternalPath(storedReturnTo)) {
    destination = storedReturnTo;
  } else if (storedReturnTo && needsOnboarding && isSafeInternalPath(storedReturnTo)) {
    const joinCode = extractJoinCode(storedReturnTo);
    const base = redirectTo || '/golf/dashboard';
    destination = joinCode ? `${base}?joinCode=${encodeURIComponent(joinCode)}` : base;
  } else {
    destination = redirectTo || '/golf/dashboard';
  }
  return needsOnboarding ? destination : `/golf/welcome?next=${encodeURIComponent(destination)}`;
}
