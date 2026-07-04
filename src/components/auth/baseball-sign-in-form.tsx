'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/baseball/actions/auth';
import { invalidateAuthCache } from '@/hooks/use-baseball-auth';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';
import { humanizeAuthError } from '@/components/auth/baseball-auth-shell';

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
  return humanizeAuthError(error);
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

      invalidateAuthCache();
      router.refresh();

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
        router.replace(storedReturnTo);
      } else {
        // Clear stale returnTo if present — onboarding takes priority
        if (storedReturnTo) sessionStorage.removeItem('baseball_login_returnTo');
        router.replace(result.redirectTo || '/baseball/dashboard');
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
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Email — explicit "Email" label + honest autocomplete so password
          managers and keyboards offer the right affordance every time. */}
      <Input
        id="baseball-signin-email"
        name="email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
      />

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="baseball-signin-password" className="text-sm font-medium text-warm-700">
            Password
          </label>
          <Link
            href="/baseball/forgot-password"
            className="rounded text-xs font-medium text-grade-plus transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="baseball-signin-password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          enterKeyHint="go"
        />
      </div>

      {/* Submit button — Button owns its own press physics + skeleton/pending state */}
      <Button
        variant="primary"
        type="submit"
        isLoading={isLoading}
        className="min-h-[50px] w-full py-3 text-body font-semibold tracking-[-0.01em]"
      >
        {isLoading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
