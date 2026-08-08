'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signupAction } from '@/app/golf/actions/auth';
import { Users, GraduationCap, AlertCircle } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type Role = 'player' | 'coach';

function getSignupErrorMessage(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('user_already_exists')) {
    return 'An account with this email already exists. Please sign in instead, or use a different email.';
  }
  if (lower.includes('invalid email') || lower.includes('validate email')) {
    return 'Please enter a valid email address.';
  }
  // ONLY the raw GoTrue string is rewritten. The bare `includes('password')`
  // that used to sit here matched the server's OWN messages, which are already
  // written for end users, and replaced them with advice the client had already
  // disproved: the form enforces length >= 8 before it ever submits, so
  // "use at least 8 characters" can never be the real problem by the time this
  // runs.
  //
  // It captured both real rejections verbatim — "Password must contain at least
  // one special character (!@#$%^&*...)" and "…this one is too common or has
  // appeared in a data breach." Measured in production: 16 signup-blocking
  // events in three days, every one shown with remediation that could not work.
  // Adding characters never fixes a missing symbol, and nothing fixes a breached
  // password. That is an unwinnable loop at the first step of signup.
  if (lower.includes('weak password')) {
    return 'Password does not meet the requirements. Please use at least 8 characters.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return error;
}

export function GolfSignUpForm({ joinCode }: { joinCode?: string | null }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('player');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    graduationYear: '',
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);



  const currentYear = new Date().getFullYear();
  const graduationYearOptions = Array.from({ length: 13 }, (_, i) => currentYear + i);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (role === 'player') {
      if (!formData.graduationYear) {
        setError('Please select your expected graduation year.');
        return;
      }
      const approxAge = currentYear - (Number(formData.graduationYear) - 18);
      if (approxAge < 13) {
        setError('You must be at least 13 years old to create an account. Please have a parent or guardian contact us for more information.');
        return;
      }
    }

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

      // CRITICAL: After signup, the session cookies are set but the Next.js
      // router cache doesn't know about them. We must call router.refresh()
      // FIRST to force a server-side revalidation that reads the new cookies,
      // THEN navigate to the destination page.
      router.refresh();

      // Wait for cookies to propagate and cache to invalidate
      // Using a slightly longer delay to ensure session is fully established
      await new Promise(resolve => setTimeout(resolve, 150));

      // After signup, user always needs onboarding first.
      sessionStorage.removeItem('golf_signup_returnTo');

      // Coach-invited players carry a team join code from the invite link —
      // forward it to onboarding so they auto-join the inviting team. Everyone
      // else follows the normal onboarding path.
      const code = joinCode?.trim().toUpperCase() ?? '';


      const onboardingPath =
        role === 'player' && code
          ? `/golf/player?joinCode=${encodeURIComponent(code)}`
          : result.redirectTo || (role === 'coach' ? '/golf/coach' : '/golf/player');
      router.push(onboardingPath);
    } catch (err) {
      setError(getSignupErrorMessage(err instanceof Error ? err.message : 'Signup failed'));
      setIsLoading(false);
    }
    // Note: We don't set isLoading to false on success because
    // we're navigating away and want to keep the loading state
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <span>{error}</span>
            {error.includes('already exists') && (
              <Link
                href="/golf/login"
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
          <Button variant="primary"
            type="button"
            onClick={() => setRole('player')}
            aria-pressed={role === 'player'}
            className={`
              p-4 rounded-md border-2 transition-colors
              flex flex-col items-center gap-2
              ${role === 'player'
                ? 'border-primary-600 bg-primary-50'
                : 'border-warm-200 bg-cream-50 hover:border-warm-300'
              }
            `}
          >
            <GraduationCap className={`w-6 h-6 ${role === 'player' ? 'text-primary-600' : 'text-warm-400'}`} />
            <span className={`text-sm font-medium ${role === 'player' ? 'text-primary-600' : 'text-warm-700'}`}>
              Player
            </span>
          </Button>

          <Button variant="primary"
            type="button"
            onClick={() => setRole('coach')}
            aria-pressed={role === 'coach'}
            className={`
              p-4 rounded-md border-2 transition-colors
              flex flex-col items-center gap-2
              ${role === 'coach'
                ? 'border-primary-600 bg-primary-50'
                : 'border-warm-200 bg-cream-50 hover:border-warm-300'
              }
            `}
          >
            <Users className={`w-6 h-6 ${role === 'coach' ? 'text-primary-600' : 'text-warm-400'}`} />
            <span className={`text-sm font-medium ${role === 'coach' ? 'text-primary-600' : 'text-warm-700'}`}>
              Coach
            </span>
          </Button>
        </div>
      </fieldset>

      {/* Name fields - side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="golf-signup-firstname" className="text-sm font-medium text-warm-700">
            First name
          </label>
          <Input
            id="golf-signup-firstname"
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="John"
            required
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="golf-signup-lastname" className="text-sm font-medium text-warm-700">
            Last name
          </label>
          <Input
            id="golf-signup-lastname"
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Doe"
            required
            autoComplete="family-name"
          />
        </div>
      </div>

      {/* Graduation Year (players only) */}
      {role === 'player' && (
        <div className="space-y-1.5">
          <Select
            label="Expected graduation year"
            options={graduationYearOptions.map((year) => ({ value: String(year), label: String(year) }))}
            value={formData.graduationYear}
            onChange={(value) => setFormData({ ...formData, graduationYear: value })}
            placeholder="Select year"
          />
          {formData.graduationYear && (() => {
            const approxAge = currentYear - (Number(formData.graduationYear) - 18);
            return approxAge >= 13 && approxAge <= 17 ? (
              <p className="text-xs text-warm-500 mt-1">
                By creating an account, a parent or guardian acknowledges and consents to the collection of information as described in our{' '}
                <Link href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>.
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="golf-signup-email" className="text-sm font-medium text-warm-700">
          Email
        </label>
        <Input
          id="golf-signup-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>

      {/* Password with strength indicator */}
      <div className="space-y-1.5">
        <label htmlFor="golf-signup-password" className="text-sm font-medium text-warm-700">
          Password
        </label>
        <Input
          id="golf-signup-password"
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
      <Button variant="primary"
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white font-semibold text-sm
          rounded-xl shadow-lg shadow-primary-600/25
          transition-all duration-200
          hover:bg-primary-700 hover:shadow-primary-600/30
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
          focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        "
      >
        {isLoading ? (
          <div className="flex items-center gap-1" role="status" aria-label="Creating account">
            <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="sr-only">Creating account...</span>
          </div>
        ) : (
          'Create account'
        )}
      </Button>

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
