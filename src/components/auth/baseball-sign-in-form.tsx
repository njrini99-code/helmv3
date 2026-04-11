'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/baseball/actions/auth';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils/capacitor';

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

export function BaseballSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get returnTo from URL params (e.g., /baseball/login?returnTo=/baseball/join/ABC123)
  const returnTo = searchParams.get('returnTo');

  // Store returnTo in sessionStorage so it persists through login
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('baseball_login_returnTo', returnTo);
    }
  }, [returnTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    void triggerHaptic('light');

    try {
      const result = await loginAction(email, password);

      if (!result.success) {
        void triggerHaptic('error');
        setError(getErrorMessage(result.error || 'Login failed'));
        setIsLoading(false);
        return;
      }

      void triggerHaptic('success');

      // CRITICAL: After login, refresh first to ensure the session cookies
      // are recognized by the Next.js router cache before navigating.
      router.refresh();

      // Wait for cookies to propagate and cache to invalidate
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for stored returnTo URL (from invite link flow)
      const storedReturnTo = sessionStorage.getItem('baseball_login_returnTo');

      // Validate returnTo to prevent open redirect attacks.
      // Only allow relative paths starting with /baseball/ or /golf/
      const isValidReturnTo = (path: string): boolean => {
        return (path.startsWith('/baseball/') || path.startsWith('/golf/')) && !path.includes('//');
      };

      // Only use returnTo if the user is fully onboarded (redirectTo = dashboard).
      // If they still need onboarding, send them there first.
      const needsOnboarding = result.redirectTo === '/baseball/coach-onboarding' || result.redirectTo === '/baseball/player';

      if (storedReturnTo && !needsOnboarding && isValidReturnTo(storedReturnTo)) {
        sessionStorage.removeItem('baseball_login_returnTo');
        router.push(storedReturnTo);
      } else {
        // Clear stale returnTo if present — onboarding takes priority
        if (storedReturnTo) sessionStorage.removeItem('baseball_login_returnTo');
        router.push(result.redirectTo || '/baseball/dashboard');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because
    // we're navigating away and want to keep the loading state
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Error message */}
      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-[10px] flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="baseball-signin-email" className="text-sm font-medium text-warm-700">
          Email
        </label>
        <input
          id="baseball-signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          className="
            w-full px-4 py-3 min-h-[48px]
            bg-white
            border border-warm-200
            rounded-xl
            text-warm-900 text-base lg:text-sm
            placeholder:text-warm-400
            transition-all duration-200 ease-ios
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/15
          "
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="baseball-signin-password" className="text-sm font-medium text-warm-700">
            Password
          </label>
          <Link
            href="/baseball/forgot-password"
            className="text-xs text-primary-600 hover:text-primary-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="baseball-signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          enterKeyHint="go"
          className="py-3 min-h-[48px] rounded-xl"
        />
      </div>

      {/* Submit button — inline spinner, iOS ease, tactile press */}
      <button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="
          w-full min-h-[50px] py-3
          bg-primary-600 text-white
          font-semibold text-[15px] tracking-[-0.01em]
          rounded-xl
          shadow-lg shadow-primary-600/25
          transition-all duration-200 ease-ios
          hover:bg-primary-700 hover:shadow-primary-600/30
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
      </button>
    </form>
  );
}
