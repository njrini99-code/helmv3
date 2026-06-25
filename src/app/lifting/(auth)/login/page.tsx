'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { liftingLoginAction } from '@/app/lifting/actions/auth';

const LOGIN_MESSAGES: Record<string, string> = {
  session_expired: 'Session expired. Please sign in again.',
  password_reset: 'Password reset successfully. Please sign in with your new password.',
  account_created: 'Account created — check your email to confirm, then sign in here.',
  signed_out: 'You have been signed out.',
};

function LoginContent() {
  const prefersReducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const messageKey = searchParams.get('message');
  const successMessage = messageKey ? (LOGIN_MESSAGES[messageKey] ?? null) : null;
  const returnTo = searchParams.get('returnTo');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
      setCheckingAuth(false);
    });
  }, [supabase]);

  async function handleSignOut() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsLoggingOut(false);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await liftingLoginAction(email, password);
    if (result.success && result.redirectTo) {
      router.push(returnTo ?? result.redirectTo);
    } else {
      setError(result.error ?? 'Sign in failed. Please try again.');
      setIsLoading(false);
    }
  }

  const signupHref = returnTo
    ? `/lifting/signup?returnTo=${encodeURIComponent(returnTo)}`
    : '/lifting/signup';

  return (
    <div className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6"
      style={{ background: 'linear-gradient(135deg, #FFFEFA 0%, #f0fdf4 50%, #dcfce7 100%)' }}
    >
      {/* Skip nav */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to login form
      </a>

      {/* Animated orbs — helm green palette */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] -top-32 -right-32 rounded-full bg-gradient-to-br from-primary-400/30 to-primary-600/20 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] -bottom-24 -left-24 rounded-full bg-gradient-to-tr from-primary-400/25 to-primary-400/20 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 0.95, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute w-[200px] h-[200px] top-20 left-[10%] rounded-full bg-gradient-to-br from-primary-300/20 to-primary-400/15 blur-2xl hidden sm:block"
          animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <motion.div
          className="absolute w-3 h-3 rounded-full bg-primary-500/40 top-[30%] right-[20%]"
          animate={{ y: [0, -10, 0], opacity: [0.4, 0.8, 0.4] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(22, 163, 74, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(22, 163, 74, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glass card */}
      <div id="login-form" className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass-standard rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
        >
          {/* Logo */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, duration: 0.5 }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-xl scale-150" />
              <div className="relative w-14 h-14 flex items-center justify-center mb-4 bg-primary-50 rounded-2xl border border-primary-100">
                <Image src="/helm-lifting-logo.png" alt="Helm Lifting Lab" width={56} height={56} className="object-contain" priority />
              </div>
            </div>
            <h1 className="text-xl font-bold text-warm-900">Helm Lifting Lab</h1>
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-warm-900 mb-2">
              Welcome back
            </h2>
            <p className="text-warm-500 text-sm">Sign in to manage your strength programs</p>
          </motion.div>

          {/* Success message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary-50 border border-primary-200 text-primary-700 px-4 py-3 rounded-xl text-sm mb-6"
            >
              {successMessage}
            </motion.div>
          )}

          {/* Form or already-logged-in */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4, duration: 0.5 }}
          >
            {checkingAuth ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-4">
                <div className="bg-primary-50 border border-primary-200 text-primary-700 px-4 py-3 rounded-xl text-sm text-center">
                  You&apos;re already signed in
                </div>
                <Button
                  variant="primary"
                  onClick={() => router.push(returnTo ?? '/lifting/dashboard')}
                  className="w-full min-h-[50px] bg-primary-600 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/25 hover:bg-primary-700 transition-all"
                >
                  {returnTo ? 'Continue' : 'Continue to Dashboard'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full min-h-[50px] bg-warm-100 text-warm-700 font-semibold rounded-xl hover:bg-warm-200 transition-all disabled:opacity-50"
                >
                  {isLoggingOut ? 'Signing out…' : 'Sign out & use a different account'}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                  <label htmlFor="lifting-email" className="text-sm font-medium text-warm-700">
                    Email
                  </label>
                  <Input
                    id="lifting-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
                    autoFocus
                    autoComplete="email"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="lifting-password" className="text-sm font-medium text-warm-700">
                      Password
                    </label>
                    <Link
                      href="/lifting/forgot-password"
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="lifting-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full"
                  />
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[50px] bg-primary-600 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/25 hover:bg-primary-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            )}
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.6, duration: 0.5 }}
        >
          {!isLoggedIn && !checkingAuth && (
            <p className="text-center mt-6 text-warm-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href={signupHref}
                className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
              >
                Sign up
              </Link>
            </p>
          )}

          <p className="text-center mt-4 text-warm-500 text-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-1 hover:text-warm-700 transition-colors px-3 py-3 -my-3 min-h-[44px] rounded-lg active:bg-warm-100/50"
            >
              ← Back to HelmLabs
            </Link>
          </p>

          <div className="flex items-center justify-center gap-2 mt-3">
            <Link href="/privacy" className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg">
              Privacy
            </Link>
            <span className="text-warm-300" aria-hidden="true">·</span>
            <Link href="/terms" className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg">
              Terms
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LiftingLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
