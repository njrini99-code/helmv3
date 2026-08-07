'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signupAction } from '@/app/baseball/actions/auth';
import { Users, GraduationCap } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { humanizeAuthError } from '@/components/auth/baseball-auth-shell';
import { cn } from '@/lib/utils';
import { InkNotice } from '@/components/baseball/living-annual';

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
  return humanizeAuthError(error);
}

export function BaseballSignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>('player');

  // The invite link carries where to go BACK to:
  //   /baseball/join/[code]       -> /baseball/signup?returnTo=/baseball/join/CODE
  //   /baseball/staff/join/[code] -> /baseball/signup?returnTo=/baseball/staff/join/CODE
  //
  // Nothing in the codebase ever wrote this key — the submit handler below only
  // ever REMOVED it, and both onboarding pages read it. So a brand-new user who
  // clicked a coach's invite link finished signup and onboarding and landed on
  // the generic dashboard with no team, having to find and re-open the original
  // link to actually join. This is the primary self-serve path: a coach shares a
  // link and expects the player to end up on the roster.
  //
  // Mirrors baseball-sign-in-form.tsx, which has always had this half. The
  // consumers already validate the value against open redirects before using it.
  const returnTo = searchParams.get('returnTo');
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('baseball_signup_returnTo', returnTo);
    }
  }, [returnTo]);

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

      // The returnTo is deliberately NOT cleared here. Onboarding comes first,
      // and it is the ONBOARDING pages that consume this key to send the user
      // back to the invite they came from (coach-onboarding navigateAfterOnboarding,
      // player page handleSubmit — both remove it once used). Clearing it on
      // signup destroyed the value one step before its only reader, which is the
      // second half of why invite links never landed anyone on a roster.

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
        <InkNotice>
          <span>{error}</span>
          {error.includes('already exists') && (
            <Link
              href="/baseball/login"
              className="mt-1 block rounded font-medium text-grade-plus underline underline-offset-2 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
            >
              Go to sign in
            </Link>
          )}
        </InkNotice>
      )}

      {/* Role Selection */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-warm-700">I am a...</legend>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={() => setRole('player')}
            aria-pressed={role === 'player'}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors',
              role === 'player'
                ? 'border-grade-plus bg-grade-plus/10'
                : 'border-warm-200 bg-cream-50 hover:border-warm-300'
            )}
          >
            <GraduationCap className={cn('h-6 w-6', role === 'player' ? 'text-grade-plus' : 'text-warm-400')} aria-hidden />
            <span className={cn('text-sm font-medium', role === 'player' ? 'text-primary-700' : 'text-warm-700')}>
              Player
            </span>
          </Button>

          <Button
            variant="outline"
            type="button"
            onClick={() => setRole('coach')}
            aria-pressed={role === 'coach'}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors',
              role === 'coach'
                ? 'border-grade-plus bg-grade-plus/10'
                : 'border-warm-200 bg-cream-50 hover:border-warm-300'
            )}
          >
            <Users className={cn('h-6 w-6', role === 'coach' ? 'text-grade-plus' : 'text-warm-400')} aria-hidden />
            <span className={cn('text-sm font-medium', role === 'coach' ? 'text-primary-700' : 'text-warm-700')}>
              Coach
            </span>
          </Button>
        </div>
      </fieldset>

      {/* Name fields - side by side */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="baseball-signup-firstname"
          name="firstName"
          label="First name"
          type="text"
          value={formData.firstName}
          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
          placeholder="John"
          required
          autoComplete="given-name"
        />
        <Input
          id="baseball-signup-lastname"
          name="lastName"
          label="Last name"
          type="text"
          value={formData.lastName}
          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
          placeholder="Doe"
          required
          autoComplete="family-name"
        />
      </div>

      {/* Email — explicit "Email" label + honest autocomplete */}
      <Input
        id="baseball-signup-email"
        name="email"
        label="Email"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="you@example.com"
        required
      />

      {/* Password with strength indicator */}
      <div className="space-y-1.5">
        <Input
          id="baseball-signup-password"
          name="password"
          label="Password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Create a strong password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <PasswordStrengthIndicator password={formData.password} />
      </div>

      {/* Submit */}
      <Button
        variant="primary"
        type="submit"
        isLoading={isLoading}
        className="w-full py-3 text-sm font-semibold"
      >
        {isLoading ? 'Creating account…' : 'Create account'}
      </Button>

      {/* Divider */}
      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[color:var(--hairline)]" />
        <span className="text-xs font-medium text-warm-400">or</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[color:var(--hairline)]" />
      </div>

      {/* Google SSO - placeholder */}
      <Button
        variant="outline"
        type="button"
        disabled
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-warm-200 bg-cream-50 py-3 text-sm font-medium text-warm-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </Button>

      {/* Terms */}
      <p className="mt-4 text-center text-xs text-warm-400">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="text-warm-600 hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-warm-600 hover:underline">Privacy Policy</Link>
      </p>
    </form>
  );
}
