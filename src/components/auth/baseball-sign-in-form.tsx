'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/baseball/actions/auth';
import { createClient } from '@/lib/supabase/client';
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

export function BaseballSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Get returnTo from URL params (e.g., /baseball/login?returnTo=/baseball/dashboard/team)
  const returnTo = searchParams.get('returnTo');

  // Store returnTo in sessionStorage so it persists through login
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('baseball_login_returnTo', returnTo);
    }
  }, [returnTo]);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      setCheckingAuth(false);
    }
    checkAuth();
  }, [supabase.auth]);

  async function handleSignOut() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsLoggingOut(false);
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="space-y-4">
        <div className="bg-helm-amber-400/10 border border-helm-amber-400/30 text-helm-amber-600 px-4 py-3 rounded-xl text-sm text-center">
          You&apos;re already signed in
        </div>
        <button
          onClick={() => router.push(returnTo || '/baseball/dashboard')}
          className="w-full py-3 bg-primary-600 text-white font-medium text-sm rounded-[10px] shadow-sm transition-all duration-200 hover:bg-primary-700 hover:shadow-md"
        >
          {returnTo ? 'Continue' : 'Continue to Dashboard'}
        </button>
        <button
          onClick={handleSignOut}
          disabled={isLoggingOut}
          className="w-full py-3 bg-warm-100 text-warm-700 font-medium text-sm rounded-[10px] transition-all duration-200 hover:bg-warm-200 disabled:opacity-50"
        >
          {isLoggingOut ? 'Signing out...' : 'Sign out & use a different account'}
        </button>
      </div>
    );
  }

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

      // Refresh first to ensure session cookies are recognized
      router.refresh();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for stored returnTo URL
      const storedReturnTo = sessionStorage.getItem('baseball_login_returnTo');

      // Validate returnTo to prevent open redirect attacks
      const isValidReturnTo = (path: string): boolean => {
        return (path.startsWith('/baseball/') || path.startsWith('/golf/')) && !path.includes('//');
      };

      // Only use returnTo if the user is fully onboarded (redirectTo = dashboard)
      const needsOnboarding = result.redirectTo === '/baseball/coach-onboarding' || result.redirectTo === '/baseball/player';

      if (storedReturnTo && !needsOnboarding && isValidReturnTo(storedReturnTo)) {
        sessionStorage.removeItem('baseball_login_returnTo');
        router.push(storedReturnTo);
      } else {
        if (storedReturnTo) sessionStorage.removeItem('baseball_login_returnTo');
        router.push(result.redirectTo || '/baseball/dashboard');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
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
          autoFocus
          autoComplete="email"
          aria-describedby={error ? 'signin-error' : undefined}
          className="
            w-full px-4 py-3
            bg-white
            border border-warm-200
            rounded-[10px]
            text-warm-900 text-base lg:text-sm
            placeholder:text-warm-400
            transition-all duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
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
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white
          font-medium text-sm
          rounded-[10px]
          shadow-sm
          transition-all duration-200
          hover:bg-primary-700 hover:shadow-md
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
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
