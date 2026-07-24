'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { isNativeApp } from '@/lib/utils/capacitor';
import { cn } from '@/lib/utils';
import { IconCheck, IconShield } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { GolfAuthShell, AuthPrimaryButton } from '@/components/auth/GolfAuthShell';

type RecoveryState = 'verifying' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const isNative = isNativeApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('verifying');
  const router = useRouter();
  // `createClient()` returns a fresh browser client per call — memoize so the
  // recovery-session effect below isn't re-run on every render.
  const supabase = useMemo(() => createClient(), []);

  // Establish the recovery session BEFORE allowing updateUser. Supabase delivers
  // the reset link as either a PKCE `?code=` query param (exchangeCodeForSession)
  // or a `?token_hash=&type=recovery` param (verifyOtp). Without an explicit
  // recovery session, updateUser would silently target the wrong (or no) user.
  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) {
          if (!cancelled) setRecoveryState('ready');
          return;
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!cancelled) setRecoveryState(exchangeError ? 'invalid' : 'ready');
          return;
        }

        if (tokenHash && type === 'recovery') {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          });
          if (!cancelled) setRecoveryState(verifyError ? 'invalid' : 'ready');
          return;
        }

        if (!cancelled) setRecoveryState('invalid');
      } catch {
        if (!cancelled) setRecoveryState('invalid');
      }
    }

    establishRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Refuse to mutate until a verified recovery session exists.
    if (recoveryState !== 'ready') {
      setError('This reset link is invalid or has expired. Please request a new one.');
      return;
    }

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
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      router.push('/golf/login?message=password_reset');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const heading = recoveryState === 'invalid' ? 'Link expired' : 'Reset your password';
  const subheading =
    recoveryState === 'verifying'
      ? 'Verifying your reset link…'
      : recoveryState === 'invalid'
        ? 'This password reset link is invalid or has expired.'
        : 'Choose a new password for your account.';

  const footer = (
    <>
      <p className="text-center mt-5 text-warm-600 text-body-sm">
        Remember your password?{' '}
        <Link href="/golf/login" className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">
          Sign in
        </Link>
      </p>
      {!isNative && (
        <p className="text-center mt-3 text-warm-500 text-body-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-3 -my-3 min-h-[44px] transition-colors hover:text-warm-700 active:bg-warm-100/50"
          >
            ← Back to HelmLabs
          </Link>
        </p>
      )}
    </>
  );

  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  return (
    <GolfAuthShell idSuffix="golf-reset" heading={heading} subheading={subheading} footer={footer}>
      {recoveryState === 'verifying' ? (
        <div className="flex justify-center py-6" role="status" aria-label="Verifying reset link">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      ) : recoveryState === 'invalid' ? (
        <div className="space-y-4">
          <div
            className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger"
            role="alert"
          >
            <span aria-hidden className="mt-px font-semibold">!</span>
            <span>Your reset link is invalid or has expired. Please request a new one.</span>
          </div>
          <Link
            href="/golf/forgot-password"
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-primary-600 py-3 text-body font-semibold text-white shadow-lg shadow-primary-600/25 transition-all duration-200 hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.98]"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger"
              role="alert"
            >
              <span aria-hidden className="mt-px font-semibold">!</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Input
              id="golf-reset-password"
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your new password"
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input on this auth page
              autoFocus
              autoComplete="new-password"
              enterKeyHint="next"
            />
            <PasswordStrengthIndicator password={password} />
          </div>

          <div className="space-y-1.5">
            <Input
              id="golf-reset-confirm"
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              required
              autoComplete="new-password"
              enterKeyHint="go"
              className={cn(
                passwordsMismatch
                  ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
                  : passwordsMatch
                    ? 'border-primary-300 focus:border-primary-500 focus:ring-primary-500/25'
                    : '',
              )}
            />
            {passwordsMismatch && (
              <p className="flex items-center gap-1 text-caption text-danger">
                <span aria-hidden className="font-semibold">!</span>
                Passwords do not match
              </p>
            )}
            {passwordsMatch && password.length >= 8 && (
              <p className="flex items-center gap-1 text-caption text-primary-600">
                <IconShield size={12} aria-hidden />
                Passwords match
              </p>
            )}
          </div>

          <AuthPrimaryButton
            type="submit"
            loading={loading}
            loadingLabel="Updating password"
            disabled={!password || !confirmPassword || recoveryState !== 'ready'}
          >
            <span className="inline-flex items-center gap-1.5">
              <IconCheck size={16} aria-hidden />
              Update password
            </span>
          </AuthPrimaryButton>
        </form>
      )}
    </GolfAuthShell>
  );
}
