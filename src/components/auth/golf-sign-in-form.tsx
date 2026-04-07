'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/golf/actions/auth';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';

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

  // Store returnTo in sessionStorage so it persists through login
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('golf_login_returnTo', returnTo);
    }
  }, [returnTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await loginAction(email, password);

      if (!result.success) {
        setError(getErrorMessage(result.error || 'Login failed'));
        setIsLoading(false);
        return;
      }

      // CRITICAL: After login, refresh first to ensure the session cookies
      // are recognized by the Next.js router cache before navigating.
      router.refresh();

      // Wait for cookies to propagate and cache to invalidate
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for stored returnTo URL (from invite link flow)
      const storedReturnTo = sessionStorage.getItem('golf_login_returnTo');

      // Validate returnTo to prevent open redirect attacks.
      // Only allow relative paths starting with /golf/ or /baseball/
      const isValidReturnTo = (path: string): boolean => {
        return (path.startsWith('/golf/') || path.startsWith('/baseball/')) && !path.includes('//');
      };

      // Only use returnTo if the user is fully onboarded (redirectTo = dashboard).
      // If they still need onboarding, send them there first — the join page will
      // redirect to onboarding with the joinCode anyway.
      const needsOnboarding = result.redirectTo === '/golf/coach' || result.redirectTo === '/golf/player';

      if (storedReturnTo && !needsOnboarding && isValidReturnTo(storedReturnTo)) {
        sessionStorage.removeItem('golf_login_returnTo');
        router.push(storedReturnTo);
      } else {
        // Clear stale returnTo if present — onboarding takes priority
        if (storedReturnTo) sessionStorage.removeItem('golf_login_returnTo');
        router.push(result.redirectTo || '/golf/dashboard');
      }
    } catch {
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

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="golf-signin-email" className="text-sm font-medium text-warm-700">
          Email
        </label>
        <input
          id="golf-signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          autoComplete="email"
          className="
            w-full px-4 py-2.5
            bg-white
            border border-warm-200
            rounded-[10px]
            text-warm-900 text-base lg:text-sm
            placeholder:text-warm-400
            transition-all duration-200
            focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/10
          "
        />
      </div>

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
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white
          font-semibold text-sm
          rounded-xl
          shadow-lg shadow-primary-600/25
          transition-all duration-200
          hover:bg-primary-700 hover:shadow-primary-600/30
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
          focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        "
      >
        {isLoading ? (
          <div className="flex items-center gap-1" role="status" aria-label="Signing in">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="sr-only">Signing in...</span>
          </div>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
}
