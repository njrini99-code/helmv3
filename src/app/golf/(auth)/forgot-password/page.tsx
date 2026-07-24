'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { isNativeApp } from '@/lib/utils/capacitor';
import { IconCheck, IconMail } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { GolfAuthShell, AuthPrimaryButton } from '@/components/auth/GolfAuthShell';

export default function ForgotPasswordPage() {
  const isNative = isNativeApp();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Hardened server action: rate-limited, always returns a generic message
      // to prevent email enumeration.
      const result = await requestPasswordResetAction(email);
      if (!result.success) {
        setError(result.error ?? 'An unexpected error occurred. Please try again.');
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const footer = (
    <>
      {!success && (
        <p className="text-center mt-5 text-warm-600 text-body-sm">
          Remember your password?{' '}
          <Link href="/golf/login" className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">
            Sign in
          </Link>
        </p>
      )}
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

  return (
    <GolfAuthShell
      idSuffix="golf-forgot"
      heading={success ? 'Check your email' : 'Reset your password'}
      subheading={
        success
          ? <>We&rsquo;ve sent a reset link to <span className="font-medium text-warm-700">{email}</span></>
          : 'Enter your email and we’ll send you a reset link.'
      }
      footer={footer}
    >
      {success ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <IconMail size={30} aria-hidden />
            </span>
          </div>
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <IconCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-primary-600" />
              <div className="text-body-sm text-primary-700">
                <p>Click the link in the email to reset your password.</p>
                <p className="mt-1 text-primary-600">The link expires in 1 hour.</p>
              </div>
            </div>
          </div>
          <p className="text-center text-caption text-warm-500">
            Didn’t get it? Check your spam folder, or try again with a different email.
          </p>
          <Link
            href="/golf/login"
            className="block w-full rounded-xl border border-warm-200 bg-cream-50 py-2.5 text-center text-body-sm font-semibold text-warm-700 transition-all duration-200 hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98]"
          >
            Back to sign in
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
          <Input
            id="golf-forgot-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus -- primary input on a single-field auth page
            autoFocus
            enterKeyHint="send"
          />
          <AuthPrimaryButton type="submit" loading={loading} loadingLabel="Sending reset link">
            Send reset link
          </AuthPrimaryButton>
        </form>
      )}
    </GolfAuthShell>
  );
}
