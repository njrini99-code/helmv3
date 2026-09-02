'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signupAction, type GolfSignupRole } from '@/app/golf/actions/auth';
import { Users, GraduationCap, AlertCircle } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

import type { SignupCodeScope } from '@/app/golf/actions/access-code';

type Role = GolfSignupRole;

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
  // Deliberately NOT rewritten. The narrowing above stopped this branch eating
  // the server's good messages, but the replacement text it still returned gave
  // advice the client had already disproved — the form enforces length >= 8
  // before submitting, so "use at least 8 characters" can never be the real
  // reason by the time this runs. Measured in production over 30 days, every
  // password rejection came back already written for the end user and already
  // actionable: "Please choose a stronger password — this one is too common or
  // has appeared in a data breach" (9), "Password must contain at least one
  // special character (!@#$%^&*...)" (8), "Password must contain at least one
  // number" (1). Passing those through is strictly better than any string we
  // could substitute; only a bare, unhelpful raw code gets a generic wrapper.
  if (lower.includes('weak password') || lower.includes('weak_password')) {
    return /[a-z]{4,}\s+[a-z]{4,}/i.test(error)
      ? error // already a sentence written for the user — show it verbatim
      : 'That password was rejected. Try a longer one with a mix of letters, numbers and symbols that you have not used elsewhere.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return error;
}

export function GolfSignUpForm({
  joinCode,
  codeScope = 'generic',
  teamName = null,
}: {
  joinCode?: string | null;
  /**
   * The program the roster code belongs to, when the gate could resolve one.
   *
   * Purely for legibility, never for authorization — the server re-derives the
   * team from the gate cookie and ignores anything the browser says about it.
   * But "Join Guilford as..." is the difference between a choice and a guess:
   * the head coach hands the SAME code to players and to an incoming assistant,
   * so until now the person typing it was picking a role with no confirmation
   * of which program they were picking it for.
   */
  teamName?: string | null;
  /**
   * Which namespace the code that opened the gate came from.
   *
   * 'roster'  — a team join_code, the ONE code a team gets. Both options are
   *             offered here: Player, or Assistant coach. "Assistant coach"
   *             joins THIS program immediately with full access — never
   *             new-program onboarding, which is what minted a phantom
   *             duplicate for the assistants who picked Coach (UNCW
   *             2026-08-18, Shenandoah 2026-08-19).
   * 'staff'   — a head-coach-minted staff code. The role lives in the signed
   *             token and `signupAction` redeems it, so there is nothing to
   *             pick; showing a picker only invites the wrong choice.
   * 'generic' — the global access code, or no gate. Unchanged behaviour.
   */
  codeScope?: SignupCodeScope;
}) {
  const router = useRouter();
  const rosterCodeOnly = codeScope === 'roster';
  const staffInvite = codeScope === 'staff';
  const [role, setRole] = useState<Role>('player');

  /*
   * The role picker only appears when the code does not already decide.
   *
   * roster → player, always. This is the fix for the phantom-duplicate program:
   *   the picker used to offer Coach here, and choosing it ran new-program
   *   onboarding. A note explaining that was added after UNCW hit it on
   *   2026-08-18; Shenandoah hit it anyway on 2026-08-19. A note is not a
   *   control.
   * staff  → the signed token carries the role and `signupAction` redeems it,
   *   so there is nothing to choose. Treated as 'coach' locally ONLY so the
   *   player-specific graduation-year requirement is skipped — an assistant
   *   coach does not have one. The server ignores this value entirely.
   */
  const showRolePicker = !staffInvite;

  /*
   * The second option MEANS something different on the two paths, which is why
   * it is derived rather than stored.
   *
   *   roster  → 'assistant_request'. Joins THIS program as an assistant
   *             immediately, with full access, and never runs new-program
   *             onboarding. There is no approval step: holding the code IS the
   *             authorization (owner decision 2026-08-20). Deriving it also means a visitor who picked Coach
   *             before typing a team code cannot be left holding 'coach' once
   *             the scope resolves — the exact mismatch that sent Shenandoah's
   *             assistant into school-details onboarding.
   *   generic → 'coach', the original new-program path. The owner stands head
   *             coaches up by hand, so this is effectively their door only.
   */
  const isCoachChoice = role === 'coach' || role === 'assistant_request';
  const effectiveRole: Role = staffInvite
    ? 'coach'
    : isCoachChoice
      ? (rosterCodeOnly ? 'assistant_request' : 'coach')
      : 'player';
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

    if (effectiveRole === 'player') {
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
        effectiveRole,
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


      /*
       * THE SERVER'S REDIRECT WINS.
       *
       * This used to check `role === 'player' && code` FIRST, which beat
       * `result.redirectTo` outright. That silently broke the staff path: a
       * typed staff code is carried in `joinCode`, the picker still said
       * 'player', so a successful staff redemption — which returns
       * '/golf/dashboard' — was overridden and the new assistant was sent to
       * `/golf/player?joinCode=<their staff code>` instead.
       *
       * signupAction already computes every case, INCLUDING carrying a roster
       * join code onto the player onboarding path, so deferring to it is not
       * just safer, it is less logic. The client fallback stays only for a
       * response that somehow carries no redirect.
       */
      const onboardingPath =
        result.redirectTo ||
        (effectiveRole === 'player' && code
          ? `/golf/player?joinCode=${encodeURIComponent(code)}`
          : effectiveRole === 'assistant_request'
            ? '/golf/coach/pending'
            : effectiveRole === 'coach'
              ? '/golf/coach'
              : '/golf/player');
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

      {showRolePicker ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text-secondary">
            {rosterCodeOnly && teamName ? `Join ${teamName} as...` : 'I am a...'}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {/* variant="ghost", NOT "primary": primary's solid bg-primary-600
                out-specifies the tile's light bg-primary-50 (stylesheet order
                beats class order), which painted the SELECTED tile solid green
                under its green icon/label — illegible, seen live in prod
                2026-08-20. ghost sets no background, so the classes below own
                the look. */}
            <Button variant="ghost"
              type="button"
              onClick={() => setRole('player')}
              aria-pressed={role === 'player'}
              className={`
                p-4 rounded-md border-2 transition-colors
                flex flex-col items-center gap-2
                ${role === 'player'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-border-subtle bg-surface hover:border-border-strong'
                }
              `}
            >
              <GraduationCap className={`w-6 h-6 ${role === 'player' ? 'text-primary-600' : 'text-text-tertiary'}`} />
              <span className={`text-sm font-medium ${role === 'player' ? 'text-primary-600' : 'text-text-secondary'}`}>
                Player
              </span>
            </Button>

            <Button variant="ghost"
              type="button"
              onClick={() => setRole(rosterCodeOnly ? 'assistant_request' : 'coach')}
              aria-pressed={isCoachChoice}
              className={`
                p-4 rounded-md border-2 transition-colors
                flex flex-col items-center gap-2
                ${isCoachChoice
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-border-subtle bg-surface hover:border-border-strong'
                }
              `}
            >
              <Users className={`w-6 h-6 ${isCoachChoice ? 'text-primary-600' : 'text-text-tertiary'}`} />
              <span className={`text-sm font-medium ${isCoachChoice ? 'text-primary-600' : 'text-text-secondary'}`}>
                {rosterCodeOnly ? 'Assistant coach' : 'Coach'}
              </span>
            </Button>
          </div>
        </fieldset>
      ) : null}

      {/* NO explanatory box under the role picker — owner directive 2026-08-20
          ("There should be no fuckin words"). The picker labels carry the whole
          meaning: you pick Player or Assistant coach and you're on the team. */}

      {staffInvite && (
        <p className="text-sm text-text-secondary bg-surface border border-border-subtle rounded-xl p-3">
          You&rsquo;re joining with a{' '}
          <strong className="font-semibold text-text-primary">staff invite</strong> — your
          role and team are already set by the invite, so there&rsquo;s nothing to pick.
        </p>
      )}

      {/* Name fields - side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="golf-signup-firstname" className="text-sm font-medium text-text-secondary">
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
          <label htmlFor="golf-signup-lastname" className="text-sm font-medium text-text-secondary">
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
              <p className="text-xs text-text-secondary mt-1">
                By creating an account, a parent or guardian acknowledges and consents to the collection of information as described in our{' '}
                <Link href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>.
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="golf-signup-email" className="text-sm font-medium text-text-secondary">
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
        <label htmlFor="golf-signup-password" className="text-sm font-medium text-text-secondary">
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
            <span className="w-1.5 h-1.5 bg-surface rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-surface rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-surface rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="sr-only">Creating account...</span>
          </div>
        ) : (
          'Create account'
        )}
      </Button>

      {/* Terms */}
      <p className="text-xs text-text-tertiary text-center mt-4">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="text-text-secondary hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-text-secondary hover:underline">Privacy Policy</Link>
      </p>
    </form>
  );
}
