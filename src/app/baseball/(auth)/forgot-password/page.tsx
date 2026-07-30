'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AuthCard,
  AuthFooterLinks,
  BaseballAuthShell,
  humanizeAuthError,
} from '@/components/auth/baseball-auth-shell';
import { InkNotice } from '@/components/baseball/living-annual';

function humanizeResetRequestError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('rate limit') || /only request this (again|once)/.test(lower)) {
    return 'You already requested a reset link recently. Please wait a moment before trying again.';
  }
  if (lower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  return humanizeAuthError(message);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/baseball/reset-password`,
      });

      if (resetError) {
        setError(humanizeResetRequestError(resetError.message));
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

  return (
    <BaseballAuthShell
      skipTargetId="forgot-form"
      skipLabel="Skip to form"
      sceneIdSuffix="forgot-password"
      eyebrow="ACCOUNT RECOVERY"
      welcomeLine="We’ll light the way back."
      tagline={success ? undefined : 'Enter your email and we’ll send you a reset link.'}
      footer={
        <AuthFooterLinks
          switchLabel={!success ? 'Remember your password?' : undefined}
          switchHref="/baseball/login"
          switchCta="Sign in"
        />
      }
    >
      <AuthCard ariaLabel={success ? 'Check your email' : 'Reset your password'}>
        <div className="mb-6 text-center">
          <h2 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">
            {success ? 'Check your email' : 'Reset your password'}
          </h2>
          {success && (
            <p className="mt-1 text-sm text-warm-500">We&apos;ve sent a reset link to {email}</p>
          )}
        </div>

        {success ? (
          <div className="animate-fade-in space-y-4 sm:space-y-5">
            <div className="mb-2 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-grade-plus/10">
                <Mail className="h-8 w-8 text-grade-plus" aria-hidden />
              </div>
            </div>
            <div className="rounded-xl border border-grade-plus/25 bg-grade-plus/10 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-grade-plus" aria-hidden />
                <div className="text-sm text-primary-700">
                  <p>Click the link in the email to reset your password.</p>
                  <p className="mt-1 text-primary-600">The link will expire in 1 hour.</p>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-warm-500">
              Did not receive the email? Check your spam folder or try again with a different email address.
            </p>
            <Button
              asChild
              variant="outline"
              className="w-full py-2.5 text-sm font-medium sm:py-3"
            >
              <Link href="/baseball/login">Back to Sign In</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
            {error && <InkNotice>{error}</InkNotice>}

            <Input
              id="forgot-email"
              name="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
              autoFocus
            />

            <Button
              variant="primary"
              type="submit"
              isLoading={loading}
              className="w-full py-2.5 text-sm font-medium sm:py-3"
            >
              {loading ? 'Sending reset link…' : 'Send reset link'}
            </Button>
          </form>
        )}
      </AuthCard>
    </BaseballAuthShell>
  );
}
