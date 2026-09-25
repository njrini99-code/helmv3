'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { isNativeApp } from '@/lib/utils/capacitor';
import {
  AuthCanvas,
  AuthFieldError,
  AuthSubmitButton,
  GroupedFieldRow,
  GroupedFields,
  authPrimaryButtonClass,
  authTextLinkClass,
} from '@/components/auth/golf-auth-canvas';
import { cn } from '@/lib/utils';

const ERROR_ID = 'golf-forgot-error';

// Pragmatic format check, not a full RFC 5322 validator — matches the intent
// of the native `type="email"` check the form skips via `noValidate`.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const isNative = isNativeApp();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  // The normalized address actually submitted — shown in the confirmation
  // copy instead of the raw input, so it always reflects what was sent.
  const [submittedEmail, setSubmittedEmail] = useState('');
  // Bumped on each validation/server failure so focus returns to the field.
  const [errorNonce, setErrorNonce] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (errorNonce > 0) emailRef.current?.focus();
  }, [errorNonce]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // `noValidate` deliberately skips the browser's native check (the design
    // system owns error presentation — see the inline banner below), so
    // nothing else was stopping a malformed address from reaching the server
    // action and rendering a false-positive "sent" confirmation.
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your email address.');
      setErrorNonce((n) => n + 1);
      return;
    }
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      setErrorNonce((n) => n + 1);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Hardened server action: rate-limited, always returns a generic message
      // to prevent email enumeration.
      const result = await requestPasswordResetAction(normalizedEmail);
      if (!result.success) {
        setError(result.error ?? 'An unexpected error occurred. Please try again.');
        setErrorNonce((n) => n + 1);
        setLoading(false);
        return;
      }
      setSubmittedEmail(normalizedEmail);
      setSuccess(true);
      setLoading(false);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

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

  return (
    <AuthCanvas
      contentId="auth-card"
      contentLabel={success ? 'Check your email' : 'Reset your password'}
      title={success ? 'Check your email' : 'Reset password'}
      subtitle={
        success ? (
          <>
            We sent a reset link to <span className="font-medium text-text-primary">{submittedEmail}</span>
          </>
        ) : (
          'Enter your email and we’ll send you a link.'
        )
      }
      topBar={homeLink}
      footer={
        !success ? (
          <p className="text-center text-body text-text-secondary">
            Remember it?{' '}
            <Link href="/golf/login" className={authTextLinkClass}>
              Sign in
            </Link>
          </p>
        ) : undefined
      }
    >
      {success ? (
        <div>
          <p className="px-4 text-center text-body text-text-secondary">
            Open the link in the email to choose a new password. It expires in 1 hour. If it
            doesn’t arrive, check your spam folder or try a different email.
          </p>
          <Link href="/golf/login" className={cn(authPrimaryButtonClass, 'mt-8')}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate aria-label="Reset your password">
          <GroupedFields>
            <GroupedFieldRow
              ref={emailRef}
              id="golf-forgot-email"
              label="Email"
              placeholder="Email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              required
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input on a single-field auth page
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
            />
          </GroupedFields>
          {error && <AuthFieldError id={ERROR_ID}>{error}</AuthFieldError>}
          {/* Stays enabled when the field is empty: tapping it shows the
              inline "Enter your email address." guidance (see page.test.tsx). */}
          <AuthSubmitButton className="mt-6" pending={loading} pendingLabel="Sending reset link…">
            Send reset link
          </AuthSubmitButton>
        </form>
      )}
    </AuthCanvas>
  );
}
