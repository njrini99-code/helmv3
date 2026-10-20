'use client';

import { haptic } from '@/lib/haptics';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/golf/actions/auth';
import { logError } from '@/lib/error-logging';
import { Eye, EyeOff } from 'lucide-react';

import { fwHapticSequence } from '@/lib/fairway/haptics';
import {
  EMPTY_FIELDS_MESSAGE,
  STALE_BUNDLE_MESSAGE,
  UNEXPECTED_MESSAGE,
  getErrorMessage,
  hasReloadedForStaleBundle,
  invalidFieldFor,
  isStaleBundleError,
  markReloadedForStaleBundle,
  resolveSignInHref,
  type InvalidField,
} from '@/lib/auth/golf-sign-in-logic';
import { IconButton } from '@/components/fairway/controls/button';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  AuthFieldError,
  AuthSubmitButton,
  GroupedFieldRow,
  GroupedFields,
  authTextLinkClass,
} from '@/components/auth/golf-auth-canvas';

const ERROR_ID = 'golf-signin-error';

export function GolfSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Presentation only: which field(s) the current error is about, so they get
  // aria-invalid and focus moves to the first one. Doesn't affect what is sent.
  const [invalidField, setInvalidField] = useState<InvalidField>(null);
  // Bumped on every failed attempt so a repeated identical error still moves focus.
  const [errorNonce, setErrorNonce] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotionGuard();
  // False until the client has mounted; gates submit so a pre-hydration tap
  // cannot fire the action with React's empty initial state (#1245).
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get returnTo from URL params (e.g., /golf/login?returnTo=/golf/join/ABC123)
  const returnTo = searchParams.get('returnTo');

  // Get ref from URL params (e.g., /golf/login?ref=coach_nick_rini)
  // Used for demo-login tracing — stash it so it survives any redirect cycle.
  const refParam = searchParams.get('ref');

  // Store returnTo + ref in sessionStorage so they persist through login
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('golf_login_returnTo', returnTo);
    }
  }, [returnTo]);

  useEffect(() => {
    if (refParam) {
      sessionStorage.setItem('golf_login_ref', refParam);
    }
  }, [refParam]);

  /**
   * #1245 — adopt whatever is already in the inputs at mount.
   *
   * These are CONTROLLED inputs seeded from `useState('')`. Anything that put
   * text in the DOM before hydration — a fast typist on a cold load, a browser
   * or password-manager autofill, an automated test — is invisible to React,
   * and hydration then paints the empty state back over it. The submit that
   * follows carries the EMPTY string: the server rejects it as "Invalid email
   * or password" (the user's credentials were fine, the app dropped them) and
   * records a failed attempt against a blank identity, so the failure is not
   * even counted against the right account.
   *
   * Reading the live DOM values once on mount closes the window instead of
   * papering over it, and fixes pre-hydration autofill as a side effect.
   */
  const adoptDomValues = useCallback(() => {
    const emailEl = document.getElementById('golf-signin-email') as HTMLInputElement | null;
    const passwordEl = document.getElementById('golf-signin-password') as HTMLInputElement | null;
    if (emailEl?.value) setEmail((cur) => cur || emailEl.value);
    if (passwordEl?.value) setPassword((cur) => cur || passwordEl.value);
  }, []);

  useEffect(() => {
    adoptDomValues();
    setHydrated(true);
  }, [adoptDomValues]);

  // Move focus to the first invalid field after a failed attempt. role="alert"
  // on the message covers the announcement.
  useEffect(() => {
    if (errorNonce === 0 || !invalidField) return;
    const target = invalidField === 'password' ? passwordRef.current : emailRef.current;
    target?.focus();
  }, [errorNonce, invalidField]);

  // Keyboard: once a field has focus and the keyboard has animated in, bring
  // the submit button into view so it isn't hidden under the keyboard.
  function revealSubmit() {
    window.setTimeout(() => {
      submitRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }, 320);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Belt-and-braces for the same race: never hand the server an empty
    // credential pair. Without this the user is told their password is wrong
    // when nothing was ever sent, and `login_attempts` accrues a failure under
    // a blank email — a bucket shared by every user who hits this.
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(EMPTY_FIELDS_MESSAGE);
      setInvalidField(!trimmedEmail ? 'email' : 'password');
      setErrorNonce((n) => n + 1);
      return;
    }

    setIsLoading(true);
    setError(null);
    setInvalidField(null);
    // Light haptic when the user taps Sign In — matches native iOS button feel.
    void haptic('commit');

    try {
      // Read ref from sessionStorage (set on mount from URL param, persists through any redirect cycle)
      const storedRef = sessionStorage.getItem('golf_login_ref') ?? undefined;
      const result = await loginAction(trimmedEmail, password, storedRef);

      if (!result.success) {
        void haptic('error');
        const message = getErrorMessage(result.error || 'Login failed');
        setError(message);
        // A credentials rejection is about both fields. Other failures
        // (rate limit, network) aren't about field content.
        setInvalidField(invalidFieldFor(message));
        setErrorNonce((n) => n + 1);
        setIsLoading(false);
        return;
      }

      // Two-beat commit pattern rather than the flat system "success" buzz:
      // signing in is the single most consequential tap in the app, and a
      // rise-then-land sequence reads as a door opening instead of an alert.
      fwHapticSequence('commit');

      // CRITICAL: After login, refresh first to ensure the session cookies
      // are recognized by the Next.js router cache before navigating.
      router.refresh();

      // Wait for cookies to propagate and cache to invalidate
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for stored returnTo URL (from invite link flow)
      const storedReturnTo = sessionStorage.getItem('golf_login_returnTo');

      // Clear ref regardless of path — it's been forwarded to the server already
      sessionStorage.removeItem('golf_login_ref');

      // Where to go is decided in src/lib/auth/golf-sign-in-logic.ts, shared
      // with the Clubhouse form so the two cannot drift: returnTo is honoured
      // only when it is a safe internal path (open-redirect guard) and the user
      // is fully onboarded; heading into onboarding it keeps the invite's join
      // code so the new player auto-joins on completion; onboarding skips the
      // greeting (no profile yet, so it has no name to show).
      const href = resolveSignInHref(result.redirectTo, storedReturnTo);
      // A stored returnTo is spent whichever branch used it (or dropped it).
      if (storedReturnTo) sessionStorage.removeItem('golf_login_returnTo');
      router.push(href);
    } catch (err) {
      // "An unexpected response was received from the server" is Next's message
      // for a Server Action whose response it could not parse. It is NOT a
      // login failure — nothing is wrong with the account or the password — but
      // the screen said "An unexpected error occurred. Please try again.", and
      // pressing the same button again reproduces it.
      //
      // Seen in production on 2026-08-07 at 17:35: a Guilford player on the iOS
      // app (HelmSportsLabsApp), on a page load that transferred ZERO bytes,
      // i.e. served entirely from cache.
      //
      // THE CAUSE IS NOT ESTABLISHED. The obvious candidate is deployment skew
      // — Server Action ids change on every deploy — but Vercel Skew Protection
      // IS enabled on this project at 7 days (verified against the authenticated
      // API), so that should already be handled. Other candidates that produce
      // the same message: a service worker answering the action POST with an
      // HTML document, or the action returning a non-RSC response.
      //
      // What is true regardless of which it is: the client is holding something
      // it cannot use, and one reload replaces it. That is why this recovers
      // without claiming to know why it broke.
      const message = err instanceof Error ? err.message : String(err);
      const bundleIsStale = isStaleBundleError(message);

      if (bundleIsStale && !hasReloadedForStaleBundle()) {
        markReloadedForStaleBundle();
        logError(
          err instanceof Error ? err : new Error(message),
          { component: 'GolfSignInForm', action: 'loginAction.staleBundle', sport: 'golf' },
          'low',
        );
        // Guarded by the session flag above so a genuinely broken deploy cannot
        // put the sign-in screen into a reload loop.
        window.location.reload();
        return;
      }

      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'GolfSignInForm', action: 'loginAction', sport: 'golf' },
        'high'
      );
      setError(bundleIsStale ? STALE_BUNDLE_MESSAGE : UNEXPECTED_MESSAGE);
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because
    // we're navigating away and want to keep the loading state
  }

  const canSubmit = hydrated && email.trim().length > 0 && password.length > 0;
  const emailInvalid = invalidField === 'email' || invalidField === 'both';
  const passwordInvalid = invalidField === 'password' || invalidField === 'both';

  return (
    <form
      onSubmit={handleSubmit}
      // A password manager can fill fields without firing React's onChange,
      // which would leave a visibly filled form behind a disabled button.
      // Re-adopt the live DOM values on any interaction (same sync as on mount).
      onFocus={adoptDomValues}
      onPointerDown={adoptDomValues}
      noValidate
      aria-label="Sign in to GolfHelm"
    >
      <GroupedFields>
        <GroupedFieldRow
          ref={emailRef}
          id="golf-signin-email"
          label="Email"
          placeholder="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          aria-required="true"
          aria-invalid={emailInvalid || undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={revealSubmit}
          onKeyDown={(e) => {
            // "next" on the keyboard moves to the password row instead of
            // attempting an implicit submit.
            if (e.key === 'Enter') {
              e.preventDefault();
              passwordRef.current?.focus();
            }
          }}
        />
        <GroupedFieldRow
          ref={passwordRef}
          id="golf-signin-password"
          label="Password"
          placeholder="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          required
          aria-required="true"
          aria-invalid={passwordInvalid || undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={revealSubmit}
          trailing={
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              aria-controls="golf-signin-password"
              onClick={() => setShowPassword((v) => !v)}
              className="text-text-tertiary"
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </IconButton>
          }
        />
      </GroupedFields>

      {error && <AuthFieldError id={ERROR_ID}>{error}</AuthFieldError>}

      <AuthSubmitButton
        ref={submitRef}
        className="mt-6"
        disabled={!canSubmit}
        pending={isLoading}
        pendingLabel="Signing in…"
      >
        Sign in
      </AuthSubmitButton>

      <div className="mt-3 flex justify-center">
        <Link href="/golf/forgot-password" className={authTextLinkClass}>
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
