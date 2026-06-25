'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Dumbbell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { liftingSignupAction } from '@/app/lifting/actions/auth';

function SignInLink() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const loginHref = returnTo
    ? `/lifting/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/lifting/login';
  return (
    <Link href={loginHref} className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
      Sign in
    </Link>
  );
}

function SignupContent() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await liftingSignupAction(email, password, fullName);
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error ?? 'Sign up failed. Please try again.');
    }
    setIsLoading(false);
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6"
      style={{ background: 'linear-gradient(135deg, #FFFEFA 0%, #f0fdf4 50%, #dcfce7 100%)' }}
    >
      <a
        href="#signup-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to signup form
      </a>

      {/* Animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] -top-32 -right-32 rounded-full bg-gradient-to-br from-green-400/30 to-green-600/20 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] -bottom-24 -left-24 rounded-full bg-gradient-to-tr from-emerald-400/25 to-green-400/20 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 0.95, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(22, 163, 74, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(22, 163, 74, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div id="signup-form" className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
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
                <Dumbbell className="w-8 h-8 text-primary-600" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-warm-900">Helm Lifting Lab</h1>
          </motion.div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-primary-50 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold text-warm-900">Check your email</h2>
              <p className="text-warm-600 text-sm">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Click the link to verify your account, then sign in.
              </p>
              <Button
                variant="primary"
                onClick={() => router.push('/lifting/login')}
                className="w-full bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all"
              >
                Go to sign in
              </Button>
            </motion.div>
          ) : (
            <>
              <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3, duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold text-warm-900 mb-2">Create your account</h2>
                <p className="text-warm-500 text-sm">Build championship strength programs</p>
              </motion.div>

              <motion.form
                onSubmit={handleSubmit}
                className="space-y-5"
                noValidate
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4, duration: 0.5 }}
              >
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
                  <label htmlFor="signup-name" className="text-sm font-medium text-warm-700">Full name</label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Coach name"
                    required
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
                    autoFocus
                    autoComplete="name"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="signup-email" className="text-sm font-medium text-warm-700">Email</label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="signup-password" className="text-sm font-medium text-warm-700">Password</label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className="w-full"
                  />
                  <PasswordStrengthIndicator password={password} />
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
                      <span>Creating account…</span>
                    </>
                  ) : (
                    'Create account'
                  )}
                </Button>
              </motion.form>
            </>
          )}
        </motion.div>

        {!success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.6, duration: 0.5 }}
          >
            <p className="text-center mt-6 text-warm-600 text-sm">
              Already have an account?{' '}
              <Suspense
                fallback={
                  <Link href="/lifting/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                    Sign in
                  </Link>
                }
              >
                <SignInLink />
              </Suspense>
            </p>
            <p className="text-center mt-4 text-warm-500 text-sm">
              <Link href="/" className="inline-flex items-center gap-1 hover:text-warm-700 transition-colors px-3 py-3 -my-3 min-h-[44px] rounded-lg">
                ← Back to HelmLabs
              </Link>
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function LiftingSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#FFFEFA] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
