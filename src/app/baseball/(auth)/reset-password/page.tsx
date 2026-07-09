'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AuthCard,
  AuthFooterLinks,
  AuthPendingDots,
  BaseballAuthShell,
  humanizeAuthError,
} from '@/components/auth/baseball-auth-shell';
import { InkNotice } from '@/components/baseball/living-annual';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    // Check if user has a valid session (from email link)
    async function checkSession() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError('Unable to verify reset link. Please try again.');
          setSessionValid(false);
          return;
        }

        if (!session) {
          setError('Invalid or expired reset link. Please request a new one.');
          setSessionValid(false);
        } else {
          setSessionValid(true);
        }
      } catch {
        setError('An unexpected error occurred. Please try again.');
        setSessionValid(false);
      }
    }

    checkSession();
  }, [supabase]); // supabase is stable via useRef — no re-fire risk

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(humanizeAuthError(updateError.message));
        setLoading(false);
        return;
      }

      // Password updated successfully - redirect to login with the
      // predefined message code (login page only renders known keys)
      router.push('/baseball/login?message=password_reset');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <BaseballAuthShell
      skipTargetId="reset-form"
      skipLabel="Skip to form"
      sceneIdSuffix="reset-password"
      eyebrow="ACCOUNT RECOVERY"
      welcomeLine="A fresh key to the Yard."
      tagline={sessionValid ? 'Enter your new password below.' : undefined}
      footer={
        <AuthFooterLinks
          switchLabel="Remember your password?"
          switchHref="/baseball/login"
          switchCta="Sign in"
        />
      }
    >
      <AuthCard ariaLabel="Set new password">
        <div className="mb-6 text-center">
          <h2 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">
            Set new password
          </h2>
        </div>

        {sessionValid === null ? (
          // Loading state while checking session
          <div className="space-y-4 py-2" aria-busy="true" aria-label="Checking reset link">
            <div className="h-11 w-full animate-pulse rounded-xl bg-warm-100" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-warm-100" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-grade-plus/15" />
            <div className="flex justify-center pt-1">
              <AuthPendingDots label="Checking reset link" />
            </div>
          </div>
        ) : sessionValid === false ? (
          // Invalid session state
          <div className="animate-fade-in space-y-4">
            <InkNotice>
              <p>{error}</p>
              <Link
                href="/baseball/forgot-password"
                className="mt-2 block rounded font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
              >
                Request a new reset link
              </Link>
            </InkNotice>
            <Link href="/baseball/login">
              <Button variant="outline" className="w-full py-2.5 text-sm font-medium sm:py-3">
                Back to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          // Valid session - show form
          <form onSubmit={handleSubmit} className="animate-fade-in space-y-4 sm:space-y-5" noValidate>
            {error && <InkNotice>{error}</InkNotice>}

            <div className="space-y-1.5">
              <Input
                id="reset-new-password"
                name="password"
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your new password"
                required
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
                autoFocus
                autoComplete="new-password"
              />
              <PasswordStrengthIndicator password={password} />
            </div>

            <div className="space-y-1.5">
              <Input
                id="reset-confirm-password"
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                required
                autoComplete="new-password"
                error={confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined}
                success={confirmPassword && confirmPassword === password && password.length >= 8 ? 'Passwords match' : undefined}
              />
            </div>

            <Button
              variant="primary"
              type="submit"
              isLoading={loading}
              disabled={!password || !confirmPassword}
              className="w-full py-2.5 text-sm font-medium sm:py-3"
            >
              {loading ? 'Updating password…' : 'Update password'}
            </Button>
          </form>
        )}
      </AuthCard>
    </BaseballAuthShell>
  );
}
