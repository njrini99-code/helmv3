'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/golf/actions/auth';
import { logError } from '@/lib/error-logging';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { fwHapticSequence } from '@/lib/fairway/haptics';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';
import { Button } from '@/components/ui/button';

function getErrorMessage(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }
  return error;
}

export function GolfSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    // Light haptic when the user taps Sign In — matches native iOS button feel.
    void triggerHaptic('light');

    try {
      // Read ref from sessionStorage (set on mount from URL param, persists through any redirect cycle)
      const storedRef = sessionStorage.getItem('golf_login_ref') ?? undefined;
      const result = await loginAction(email, password, storedRef);

      if (!result.success) {
        void triggerHaptic('error');
        setError(getErrorMessage(result.error || 'Login failed'));
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

      // Validate returnTo to prevent open redirect attacks — shared with the
      // already-authenticated fast path (page.tsx) and the welcome screen so
      // the safe-path allowlist (/golf/, /baseball/, and the Helm Bridge
      // /admin surface) can't drift between entry points.
      const isValidReturnTo = isSafeInternalPath;

      // Only use returnTo verbatim if the user is fully onboarded (redirectTo =
      // dashboard). If they still need onboarding, send them there first — but
      // we must preserve the join code so they auto-join the inviting team after
      // onboarding (the onboarding page reads ?joinCode). Player onboarding wires
      // the code through; coach onboarding ignores it (a coach can't join as a
      // player), so forwarding it is harmless there.
      const needsOnboarding = result.redirectTo === '/golf/coach' || result.redirectTo === '/golf/player';

      // Extract a join code from a returnTo that points at the invite route,
      // e.g. /golf/join/ABC123 → "ABC123" (strip any query/hash).
      const extractJoinCode = (path: string): string | null => {
        const match = path.match(/^\/golf\/join\/([^/?#]+)/);
        return match?.[1] ? decodeURIComponent(match[1]) : null;
      };

      // Clear ref regardless of path — it's been forwarded to the server already
      sessionStorage.removeItem('golf_login_ref');

      let destination: string;
      if (storedReturnTo && !needsOnboarding && isValidReturnTo(storedReturnTo)) {
        sessionStorage.removeItem('golf_login_returnTo');
        destination = storedReturnTo;
      } else if (storedReturnTo && needsOnboarding && isValidReturnTo(storedReturnTo)) {
        // Heading into onboarding — carry the join code forward so the new
        // player auto-joins the inviting team on completion.
        const joinCode = extractJoinCode(storedReturnTo);
        sessionStorage.removeItem('golf_login_returnTo');
        const base = result.redirectTo || '/golf/dashboard';
        destination = joinCode ? `${base}?joinCode=${encodeURIComponent(joinCode)}` : base;
      } else {
        // Clear stale returnTo if present — onboarding takes priority
        if (storedReturnTo) sessionStorage.removeItem('golf_login_returnTo');
        destination = result.redirectTo || '/golf/dashboard';
      }

      // Skip the greeting animation for onboarding flows (user hasn't set up
      // their profile yet — the animation wouldn't know their name).
      if (needsOnboarding) {
        router.push(destination);
      } else {
        router.push(`/golf/welcome?next=${encodeURIComponent(destination)}`);
      }
    } catch (err) {
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'GolfSignInForm', action: 'loginAction', sport: 'golf' },
        'high'
      );
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because
    // we're navigating away and want to keep the loading state
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate aria-label="Sign in to GolfHelm">
      {/* Error message */}
      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Email — uses the shared Input which auto-applies iOS email keyboard defaults */}
      <Input
        id="golf-signin-email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        enterKeyHint="next"
      />

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="golf-signin-password" className="text-sm font-medium text-warm-700">
            Password
          </label>
          <Link
            href="/golf/forgot-password"
            className="text-xs text-primary-600 hover:text-primary-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="golf-signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          enterKeyHint="go"
        />
      </div>

      {/* Submit button — inline spinner, iOS ease, tactile press */}
      <Button variant="primary"
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="
          w-full min-h-[50px] py-3
          bg-primary-700
          font-semibold text-body text-white tracking-[-0.01em]
          rounded-xl
          shadow-lg shadow-primary-700/25
          transition-all duration-200 ease-ios
          hover:bg-primary-800 hover:shadow-primary-700/30
          active:scale-[0.97] active:duration-75
          disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100
          flex items-center justify-center gap-2
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        "
      >
        {isLoading ? (
          <>
            <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
            <span>Signing in…</span>
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  );
}
