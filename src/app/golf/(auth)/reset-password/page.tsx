'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { isNativeApp } from '@/lib/utils/capacitor';
import { cn } from '@/lib/utils';
import {
  AuthCanvas,
  AuthFieldError,
  AuthSubmitButton,
  GroupedFieldRow,
  GroupedFields,
  authPrimaryButtonClass,
  authTextLinkClass,
} from '@/components/auth/golf-auth-canvas';

const ERROR_ID = 'golf-reset-error';
const MISMATCH_ID = 'golf-reset-mismatch';

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
  // Bumped on each validation/server failure so focus returns to the field
  // (same pattern as forgot-password).
  const [errorNonce, setErrorNonce] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (errorNonce > 0) passwordRef.current?.focus();
  }, [errorNonce]);

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
      setError('Passwords do not match.');
      setErrorNonce((n) => n + 1);
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      setErrorNonce((n) => n + 1);
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setErrorNonce((n) => n + 1);
        setLoading(false);
        return;
      }
      router.push('/golf/login?message=password_reset');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const heading = recoveryState === 'invalid' ? 'Link expired' : 'Reset password';
  const subheading =
    recoveryState === 'verifying'
      ? 'Checking your reset link…'
      : recoveryState === 'invalid'
        ? 'This reset link is invalid or has expired.'
        : 'Choose a new password.';

  const homeLink = !isNative ? (
    <Link
      href="/"
      aria-label="Back to home"
      className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-body-lg text-accent-700 outline-none focus-visible:ring-2 focus-visible:ring-accent-600 active:opacity-60"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Home
    </Link>
  ) : null;

  const footer = (
    <p className="text-center text-body text-text-secondary">
      Remember it?{' '}
      <Link href="/golf/login" className={authTextLinkClass}>
        Sign in
      </Link>
    </p>
  );

  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const showMismatch = passwordsMismatch && !error;
  const describedBy = [error ? ERROR_ID : null, showMismatch ? MISMATCH_ID : null]
    .filter(Boolean)
    .join(' ') || undefined;

  // AUTH-02: the same flat AuthCanvas as /golf/login and /golf/forgot-password
  // (2026-09 redesign), replacing the old card-on-an-illustration GolfAuthShell.
  return (
    <AuthCanvas
      contentId="auth-card"
      contentLabel={heading}
      title={heading}
      subtitle={subheading}
      topBar={homeLink}
      footer={footer}
    >
      {recoveryState === 'verifying' ? (
        <div className="flex justify-center py-6" role="status" aria-label="Verifying reset link">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary motion-reduce:animate-none" aria-hidden="true" />
        </div>
      ) : recoveryState === 'invalid' ? (
        <div>
          <p role="alert" className="px-4 text-center text-body text-text-secondary">
            Reset links expire after 1 hour and work once. Request a new one to continue.
          </p>
          <Link href="/golf/forgot-password" className={cn(authPrimaryButtonClass, 'mt-8')}>
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate aria-label="Choose a new password">
          <GroupedFields>
            <GroupedFieldRow
              ref={passwordRef}
              id="golf-reset-password"
              label="New password"
              placeholder="New password"
              type="password"
              autoComplete="new-password"
              enterKeyHint="next"
              required
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input on this auth page
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
            />
            <GroupedFieldRow
              id="golf-reset-confirm"
              label="Confirm password"
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              enterKeyHint="go"
              required
              aria-required="true"
              aria-invalid={passwordsMismatch || undefined}
              aria-describedby={describedBy}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError('');
              }}
            />
          </GroupedFields>
          {showMismatch && (
            <p id={MISMATCH_ID} className="mt-2.5 px-4 text-body-sm text-fw-danger">
              Passwords do not match.
            </p>
          )}
          {error && <AuthFieldError id={ERROR_ID}>{error}</AuthFieldError>}
          <div className="mt-3 px-1">
            <PasswordStrengthIndicator password={password} />
          </div>
          <AuthSubmitButton
            className="mt-6"
            pending={loading}
            pendingLabel="Updating password…"
            disabled={!password || !confirmPassword || recoveryState !== 'ready'}
          >
            Update password
          </AuthSubmitButton>
        </form>
      )}
    </AuthCanvas>
  );
}
