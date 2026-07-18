'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type RecoveryState = 'verifying' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const prefersReducedMotion = useReducedMotion();
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
        // If a recovery session is already present (e.g. detectSessionInUrl
        // already processed a hash fragment), trust it.
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

        // No recoverable credentials in the URL and no existing session.
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
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

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

  return (
    <LazyMotion features={loadFeatures}>
    <div className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6 bg-auth-golf">
      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <m.div
          className="auth-orb auth-orb-1 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] -top-20 -right-20 sm:-top-32 sm:-right-32 bg-gradient-to-br from-primary-400/40 to-primary-500/30 motion-reduce:animate-none"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            scale: [1, 1.05, 1],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          })}
        />
        {/* Medium orb - bottom left */}
        <m.div
          className="auth-orb auth-orb-2 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] -bottom-16 -left-16 sm:-bottom-24 sm:-left-24 bg-gradient-to-tr from-primary-400/30 to-primary-400/25 motion-reduce:animate-none"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
            scale: [1, 0.95, 1],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          })}
        />
        {/* Small accent orb - top left (hidden on very small screens) */}
        <m.div
          className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-primary-300/25 to-primary-400/20 motion-reduce:animate-none"
          animate={{
            x: [0, 20, 0],
            y: [0, -15, 0],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          })}
        />
        {/* Tiny floating dot */}
        <m.div
          className="absolute w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-primary-500/40 top-[30%] right-[15%] sm:right-[20%] motion-reduce:animate-none"
          animate={{
            y: [0, -10, 0],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          })}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-[420px]">
        <m.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
          {/* Logo with glow effect */}
          <m.div
            className="flex flex-col items-center mb-6 sm:mb-8"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.2, duration: 0.5 })}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/30 rounded-full blur-xl scale-150" />
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 sm:mb-4">
                <Image
                  src="/helm-golf-logo-transparent.png"
                  alt="GolfHelm Logo"
                  width={56}
                  height={56}
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-warm-900 to-warm-700 bg-clip-text text-transparent">
              GolfHelm
            </h1>
          </m.div>

          {/* Header */}
          <m.div
            className="text-center mb-6 sm:mb-8"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3, duration: 0.5 })}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
              {recoveryState === 'invalid' ? 'Link expired' : 'Reset your password'}
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">
              {recoveryState === 'verifying'
                ? 'Verifying your reset link…'
                : recoveryState === 'invalid'
                  ? 'This password reset link is invalid or has expired.'
                  : 'Enter your new password below'}
            </p>
          </m.div>

          {/* Form */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, duration: 0.5 })}
          >
            {recoveryState === 'verifying' ? (
              <div className="flex justify-center py-6" role="status" aria-label="Verifying reset link">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            ) : recoveryState === 'invalid' ? (
              <div className="space-y-4 sm:space-y-5">
                <div
                  className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your reset link is invalid or has expired. Please request a new one.</span>
                </div>
                <Link
                  href="/golf/forgot-password"
                  className="
                    block w-full py-2.5 sm:py-3
                    bg-primary-600 text-white
                    font-semibold text-sm text-center
                    rounded-xl
                    shadow-lg shadow-primary-600/25
                    transition-all duration-200
                    hover:bg-primary-700 hover:shadow-primary-600/30
                    active:scale-[0.98]
                  "
                >
                  Request a new reset link
                </Link>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
              {error && (
                <div
                  className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="golf-reset-password" className="text-sm font-medium text-warm-700">New Password</label>
                <Input
                  id="golf-reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
                  autoFocus
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="golf-reset-confirm" className="text-sm font-medium text-warm-700">Confirm Password</label>
                <Input
                  id="golf-reset-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className={cn(
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : confirmPassword && confirmPassword === password
                      ? 'border-primary-300 focus:border-primary-500 focus:ring-primary-500/10'
                      : ''
                  )}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && confirmPassword === password && password.length >= 8 && (
                  <p className="text-xs text-primary-600 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Passwords match
                  </p>
                )}
              </div>

              <Button variant="primary"
                type="submit"
                disabled={loading || !password || !confirmPassword || recoveryState !== 'ready'}
                className="
                  w-full py-2.5 sm:py-3
                  bg-primary-600 text-white
                  font-semibold text-sm
                  rounded-xl
                  shadow-lg shadow-primary-600/25
                  transition-all duration-200
                  hover:bg-primary-700 hover:shadow-primary-600/30
                  active:scale-[0.98]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center
                "
              >
                {loading ? (
                  <div className="flex items-center gap-1" role="status" aria-label="Updating password">
                    <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="sr-only">Updating password...</span>
                  </div>
                ) : (
                  'Update password'
                )}
              </Button>
            </form>
            )}
          </m.div>
        </m.div>

        {/* Footer links */}
        <m.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
        >
          <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
            Remember your password?{' '}
            <Link href="/golf/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
              Sign in
            </Link>
          </p>

          {!isNative && (
            <p className="text-center mt-3 sm:mt-4 text-warm-500 text-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-warm-700 transition-colors px-3 py-3 -my-3 min-h-[44px] rounded-lg active:bg-warm-100/50"
              >
                ← Back to HelmLabs
              </Link>
            </p>
          )}
        </m.div>
      </div>
    </div>
    </LazyMotion>
  );
}
