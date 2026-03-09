'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signupAction } from '@/app/baseball/actions/auth';
import { Users, GraduationCap, AlertCircle } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';

type Role = 'player' | 'coach';

function getSignupErrorMessage(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('user_already_exists')) {
    return 'An account with this email already exists. Please sign in instead, or use a different email.';
  }
  if (lower.includes('invalid email') || lower.includes('validate email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('weak password') || lower.includes('password')) {
    return 'Password does not meet the requirements. Use at least 8 characters with uppercase, lowercase, number, and special character.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return error;
}

export function BaseballSignUpForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('player');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signupAction(
        formData.email,
        formData.password,
        role,
        formData.firstName,
        formData.lastName
      );

      if (!result.success) {
        setError(getSignupErrorMessage(result.error || 'Signup failed'));
        setIsLoading(false);
        return;
      }

      // After signup, user always needs onboarding first.
      sessionStorage.removeItem('baseball_signup_returnTo');

      // Refresh router cache so the new session cookie is recognized server-side
      router.refresh();
      await new Promise(resolve => setTimeout(resolve, 150));

      const onboardingPath = result.redirectTo || (role === 'coach' ? '/baseball/coach-onboarding' : '/baseball/player');
      router.push(onboardingPath);
    } catch (err) {
      setError(getSignupErrorMessage(err instanceof Error ? err.message : 'Signup failed'));
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because
    // we're navigating away and want to keep the loading state
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-[10px] flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <span>{error}</span>
            {error.includes('already exists') && (
              <Link
                href="/baseball/login"
                className="block mt-1 text-primary-600 font-medium hover:text-primary-700 underline underline-offset-2"
              >
                Go to sign in
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Role Selection */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-warm-700">I am a...</legend>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRole('player')}
            aria-pressed={role === 'player'}
            className={`
              p-4 rounded-[10px] border-2 transition-colors
              flex flex-col items-center gap-2
              ${role === 'player'
                ? 'border-primary-600 bg-primary-50'
                : 'border-warm-200 bg-white hover:border-warm-300'
              }
            `}
          >
            <GraduationCap className={`w-6 h-6 ${role === 'player' ? 'text-primary-600' : 'text-warm-400'}`} />
            <span className={`text-sm font-medium ${role === 'player' ? 'text-primary-600' : 'text-warm-700'}`}>
              Player
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRole('coach')}
            aria-pressed={role === 'coach'}
            className={`
              p-4 rounded-[10px] border-2 transition-colors
              flex flex-col items-center gap-2
              ${role === 'coach'
                ? 'border-primary-600 bg-primary-50'
                : 'border-warm-200 bg-white hover:border-warm-300'
              }
            `}
          >
            <Users className={`w-6 h-6 ${role === 'coach' ? 'text-primary-600' : 'text-warm-400'}`} />
            <span className={`text-sm font-medium ${role === 'coach' ? 'text-primary-600' : 'text-warm-700'}`}>
              Coach
            </span>
          </button>
        </div>
      </fieldset>

      {/* Name fields - side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="baseball-signup-firstname" className="text-sm font-medium text-warm-700">
            First name
          </label>
          <input
            id="baseball-signup-firstname"
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="John"
            required
            autoComplete="given-name"
            className="
              w-full px-4 py-3
              bg-white border border-warm-200 rounded-[10px]
              text-warm-900 text-base lg:text-sm placeholder:text-warm-400
              transition-colors duration-200
              focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
            "
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="baseball-signup-lastname" className="text-sm font-medium text-warm-700">
            Last name
          </label>
          <input
            id="baseball-signup-lastname"
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Doe"
            required
            autoComplete="family-name"
            className="
              w-full px-4 py-3
              bg-white border border-warm-200 rounded-[10px]
              text-warm-900 text-base lg:text-sm placeholder:text-warm-400
              transition-colors duration-200
              focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
            "
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="baseball-signup-email" className="text-sm font-medium text-warm-700">
          Email
        </label>
        <input
          id="baseball-signup-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="
            w-full px-4 py-3
            bg-white border border-warm-200 rounded-[10px]
            text-warm-900 text-base lg:text-sm placeholder:text-warm-400
            transition-colors duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
          "
        />
      </div>

      {/* Password with strength indicator */}
      <div className="space-y-1.5">
        <label htmlFor="baseball-signup-password" className="text-sm font-medium text-warm-700">
          Password
        </label>
        <input
          id="baseball-signup-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Create a strong password"
          required
          minLength={8}
          autoComplete="new-password"
          className="
            w-full px-4 py-3
            bg-white border border-warm-200 rounded-[10px]
            text-warm-900 text-base lg:text-sm placeholder:text-warm-400
            transition-colors duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
          "
        />
        <PasswordStrengthIndicator password={formData.password} />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white font-medium text-sm
          rounded-[10px] shadow-sm
          transition-colors duration-200
          hover:bg-primary-700 hover:shadow-md
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
        "
      >
        {isLoading ? (
          <div className="flex items-center gap-1" role="status" aria-label="Creating account">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="sr-only">Creating account...</span>
          </div>
        ) : (
          'Create account'
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-warm-200" />
        <span className="text-xs text-warm-400 font-medium">or</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-warm-200" />
      </div>

      {/* Google SSO - placeholder */}
      <button
        type="button"
        disabled
        className="
          w-full py-3
          bg-white text-warm-700 font-medium text-sm
          rounded-[10px] border border-warm-200
          transition-colors duration-200
          hover:bg-warm-50 hover:border-warm-300
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-3
        "
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      {/* Terms */}
      <p className="text-xs text-warm-400 text-center mt-4">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="text-warm-600 hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-warm-600 hover:underline">Privacy Policy</Link>
      </p>
    </form>
  );
}
