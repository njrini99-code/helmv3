'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowRight, Brain, ClipboardList, Loader2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { BASEBALL_DEMO_LANDING_PATH } from '@/lib/demo/baseball-config';
import { enterBaseballDemo } from '@/app/baseball/actions/demo-access';

// ---------------------------------------------------------------------------
// Value-prop pills shown below the headline (the "why bother" scan).
// ---------------------------------------------------------------------------

const VALUE_PROPS = [
  { icon: Users, text: 'Full live roster' },
  { icon: ClipboardList, text: 'Practice & lifting plans' },
  { icon: Brain, text: 'CoachHelm AI insights' },
] as const;

// ---------------------------------------------------------------------------
// Inline field-level validation (mirrors the server action so errors are fast).
// ---------------------------------------------------------------------------

function validateName(v: string): string | undefined {
  if (!v.trim()) return 'Name is required.';
  if (v.trim().length > 120) return 'Must be 120 characters or fewer.';
  return undefined;
}

function validateEmail(v: string): string | undefined {
  if (!v.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
  if (v.trim().length > 254) return 'Email is too long.';
  return undefined;
}

function validateProgram(v: string): string | undefined {
  if (!v.trim()) return 'Program / Organization is required.';
  if (v.trim().length > 160) return 'Must be 160 characters or fewer.';
  return undefined;
}

// ---------------------------------------------------------------------------
// Demo gate form (interactive island)
// ---------------------------------------------------------------------------

function DemoGateContent() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [program, setProgram] = useState('');

  // Touched tracks blur so inline errors only appear after interaction.
  const [touched, setTouched] = useState({ name: false, email: false, program: false });

  // Submission state
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Already-signed-in shortcut
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        // We can't reliably detect the shared demo account client-side (its
        // email is a server-only value), so any signed-in visitor gets a
        // "continue" shortcut rather than re-authenticating.
        if (active && user) setIsSignedIn(true);
      } finally {
        if (active) setCheckingAuth(false);
      }
    }
    void checkAuth();
    return () => { active = false; };
  }, [supabase]);

  const nameError = touched.name ? validateName(name) : undefined;
  const emailError = touched.email ? validateEmail(email) : undefined;
  const programError = touched.program ? validateProgram(program) : undefined;

  const isFormValid =
    !validateName(name) && !validateEmail(email) && !validateProgram(program);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, program: true });
    if (!isFormValid) return;

    setIsLoading(true);
    setServerError(null);
    void triggerHaptic('light');

    try {
      // enterBaseballDemo either redirects (success) or returns an error result.
      const result = await enterBaseballDemo({ name, email, program });
      if (!result.success) {
        void triggerHaptic('error');
        setServerError(result.error);
        setIsLoading(false);
      }
    } catch {
      // next/navigation redirect() throws a special NEXT_REDIRECT — treat
      // anything else as an unexpected failure.
      setServerError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  const cardTransition = prefersReducedMotion
    ? { duration: 0 }
    : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] } as const);

  return (
    <div className="auth-shell min-h-dvh flex items-center justify-center relative p-4 sm:p-6 bg-auth-baseball">
      {/* Skip link for keyboard users */}
      <a
        href="#demo-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to demo form
      </a>

      {/* Animated floating orbs — same language as the login shell, for parity. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="auth-orb auth-orb-1 w-[500px] h-[500px] -top-32 -right-32 bg-gradient-to-br from-helm-amber-400/40 to-helm-amber-500/30 motion-reduce:animate-none"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="auth-orb auth-orb-2 w-[400px] h-[400px] -bottom-24 -left-24 bg-gradient-to-tr from-helm-amber-400/30 to-helm-amber-400/25 motion-reduce:animate-none"
          animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 0.95, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="auth-orb auth-orb-3 w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-helm-amber-300/25 to-helm-amber-400/20 motion-reduce:animate-none"
          animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(245, 158, 11, 0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(245, 158, 11, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content column */}
      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand + headline + value props */}
        <motion.div
          className="flex flex-col items-center mb-7 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5 }}
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-helm-amber-500/30 rounded-full blur-xl scale-150" />
            <div className="relative w-14 h-14 flex items-center justify-center">
              <Image
                src="/helm-baseball-logo.png"
                alt="BaseballHelm Logo"
                width={56}
                height={56}
                className="w-14 h-14 object-contain"
                priority
                unoptimized
              />
            </div>
          </div>

          <h1 className="text-h2 sm:text-h1 leading-tight font-bold tracking-[-0.02em] text-warm-900">
            Step inside a live program
          </h1>
          <p className="mt-2 text-warm-500 text-sm sm:text-base leading-relaxed max-w-[360px]">
            Explore a fully-populated BaseballHelm team — live roster, practice &
            lifting plans, and CoachHelm AI insights. No setup, no credit card.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {VALUE_PROPS.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-helm-amber-700 bg-helm-amber-400/10 border border-helm-amber-400/25 backdrop-blur-sm"
              >
                <Icon className="w-3.5 h-3.5 text-helm-amber-600" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Gate card */}
        <motion.div
          id="demo-form"
          role="region"
          aria-label="Demo access form"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={cardTransition}
          className="auth-glass-card rounded-3xl p-7 sm:p-8"
        >
          <div className="text-center mb-6">
            <h2 className="text-h3 font-bold tracking-[-0.02em] text-warm-900">
              Try the live demo
            </h2>
            <p className="text-warm-500 text-sm mt-1">
              Tell us a bit about yourself to get instant access.
            </p>
          </div>

          {checkingAuth ? (
            <div className="flex justify-center py-6">
              <span role="status" aria-label="Checking sign-in status" className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : isSignedIn ? (
            <div className="space-y-3">
              <div className="bg-helm-amber-400/10 border border-helm-amber-400/30 text-helm-amber-600 px-4 py-3 rounded-xl text-sm text-center">
                You&apos;re already signed in — continue where you left off.
              </div>
              <Button
                variant="primary"
                onClick={() => router.push(BASEBALL_DEMO_LANDING_PATH)}
                rightIcon={<ArrowRight className="w-4 h-4" aria-hidden />}
                className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold text-body tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.97] active:duration-75"
              >
                Continue to dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-label="Demo access form">
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
                  <span>{serverError}</span>
                </motion.div>
              )}

              <Input
                id="demo-name"
                label="Your name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setServerError(null); }}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Coach Alex Rivera"
                required
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                error={nameError}
              />

              <Input
                id="demo-email"
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setServerError(null); }}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="coach@university.edu"
                required
                autoComplete="email"
                enterKeyHint="next"
                error={emailError}
              />

              <Input
                id="demo-program"
                label="Program / Organization"
                type="text"
                value={program}
                onChange={(e) => { setProgram(e.target.value); setServerError(null); }}
                onBlur={() => setTouched((t) => ({ ...t, program: true }))}
                placeholder="State University Baseball"
                required
                autoCapitalize="words"
                enterKeyHint="go"
                error={programError}
              />

              <Button
                variant="primary"
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold text-body tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.97] active:duration-75 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden />
                    <span>Setting up your demo…</span>
                  </>
                ) : (
                  <>
                    <span>Enter the live demo</span>
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-warm-500 leading-relaxed pt-1">
                You&apos;ll be signed into a shared demo account instantly. No
                password needed.
              </p>
            </form>
          )}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5, duration: 0.5 }}
          className="mt-6 flex flex-col items-center gap-3"
        >
          <p className="text-warm-600 text-sm">
            Already have an account?{' '}
            <Link
              href="/baseball/login"
              className="text-helm-amber-600 font-semibold hover:text-helm-amber-500 transition-colors"
            >
              Sign in
            </Link>
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/privacy" className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg active:bg-warm-100/50">
              Privacy
            </Link>
            <span className="text-warm-300" aria-hidden>·</span>
            <Link href="/terms" className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg active:bg-warm-100/50">
              Terms
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (Suspense boundary for parity with the login route).
// ---------------------------------------------------------------------------

export default function BaseballDemoGatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-warm-900 flex items-center justify-center">
          <span role="status" aria-label="Loading demo" className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      }
    >
      <DemoGateContent />
    </Suspense>
  );
}
