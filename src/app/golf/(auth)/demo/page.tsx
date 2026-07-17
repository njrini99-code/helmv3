'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { AlertCircle, Loader2, ArrowRight, BarChart2, Users, Brain } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';
import { createClient } from '@/lib/supabase/client';
import { DEMO_LANDING_PATH } from '@/lib/demo/config';
import { enterDemo } from '@/app/golf/actions/demo-access';

// ---------------------------------------------------------------------------
// Value-prop pill items shown below the headline
// ---------------------------------------------------------------------------

const VALUE_PROPS = [
  { icon: Users, text: 'Full live roster' },
  { icon: BarChart2, text: 'Real strokes-gained stats' },
  { icon: Brain, text: 'CoachHelm AI insights' },
] as const;

// ---------------------------------------------------------------------------
// Inline field-level validation (mirrors server rules so errors appear fast)
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

function validateSchool(v: string): string | undefined {
  if (!v.trim()) return 'School / Program is required.';
  if (v.trim().length > 160) return 'Must be 160 characters or fewer.';
  return undefined;
}

// ---------------------------------------------------------------------------
// Demo gate form (interactive island)
// ---------------------------------------------------------------------------

function DemoGateContent() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');

  // Touched tracks whether the user has blurred a field (show inline errors after blur)
  const [touched, setTouched] = useState({ name: false, email: false, school: false });

  // Submission state
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Already-signed-in demo coach shortcut
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        // Any already-authenticated visitor gets a "continue" shortcut. We can't
        // reliably detect the shared demo account client-side (its email is a
        // server-only secret), so we don't special-case it here.
        if (user) {
          setIsDemoUser(true);
        }
      } finally {
        setCheckingAuth(false);
      }
    }
    void checkAuth();
  }, [supabase]);

  // Derived inline errors (only shown after touch)
  const nameError = touched.name ? validateName(name) : undefined;
  const emailError = touched.email ? validateEmail(email) : undefined;
  const schoolError = touched.school ? validateSchool(school) : undefined;

  const isFormValid =
    !validateName(name) && !validateEmail(email) && !validateSchool(school);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mark all fields touched so errors show immediately on submit attempt
    setTouched({ name: true, email: true, school: true });
    if (!isFormValid) return;

    setIsLoading(true);
    setServerError(null);

    try {
      // enterDemo either redirects (success) or returns an error result
      const result = await enterDemo({ name, email, school });
      // If we get here, the action returned an error (redirect throws internally)
      if (!result.success) {
        setServerError(result.error);
        setIsLoading(false);
      }
    } catch {
      // next/navigation redirect() throws a special NEXT_REDIRECT "error" —
      // treat anything else as an unexpected failure
      setServerError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  const motionCard = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

  const motionStagger = (delay: number) =>
    prefersReducedMotion
      ? { duration: 0 }
      : { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

  return (
    <LazyMotion features={loadFeatures}>
      <div
        className="relative overflow-hidden"
        style={{ minHeight: '100dvh' }}
      >
        {/* Skip link for keyboard users */}
        <a
          href="#demo-form"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Skip to demo form
        </a>

        {/* Painterly scene backdrop — one scene per viewport */}
        {isDesktop
          ? <CoastalScene idSuffix="demo-coastal" />
          : <CourseScene idSuffix="demo" />}

        {/* Page content */}
        <div
          className="relative z-10 flex flex-col items-center px-5 py-10 sm:py-14"
          style={{
            paddingTop: 'max(2.5rem, calc(env(safe-area-inset-top) + 1.75rem))',
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Brand mark */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionStagger(0)}
            className="flex flex-col items-center gap-2 mb-6 sm:mb-8"
          >
            <Image
              src="/helm-golf-logo-transparent.png"
              alt=""
              width={56}
              height={56}
              className="object-contain"
              priority
              style={{ filter: 'drop-shadow(0 2px 6px rgba(60,40,20,0.20))' }}
            />
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.032em',
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.10))',
              }}
            >
              <span style={{ color: '#1c1917' }}>Golf</span>
              <span style={{ color: '#15803D' }}>Helm</span>
            </span>
          </m.div>

          {/* Headline + value props */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionStagger(0.1)}
            className="text-center mb-6 sm:mb-8 max-w-[380px]"
          >
            <h1
              style={{
                fontSize: 'clamp(1.5rem, 5vw, 2rem)',
                fontWeight: 700,
                color: '#1c1917',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                filter: 'drop-shadow(0 1px 2px rgba(60,40,20,0.10))',
              }}
            >
              Step inside a live GolfHelm team
            </h1>
            <p
              className="mt-2 text-warm-700 text-sm sm:text-base leading-relaxed"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.5))' }}
            >
              Explore a fully-populated roster, real strokes-gained stats, and
              CoachHelm AI insights — no setup, no credit card.
            </p>

            {/* Value prop pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {VALUE_PROPS.map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-primary-800"
                  style={{
                    background: 'rgba(22, 163, 74, 0.12)',
                    border: '1px solid rgba(22, 163, 74, 0.20)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 text-primary-600" aria-hidden />
                  {text}
                </span>
              ))}
            </div>
          </m.div>

          {/* Gate card */}
          <m.div
            id="demo-form"
            role="region"
            aria-label="Demo access form"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionCard}
            className="w-full max-w-[420px]"
            style={{
              padding: '24px 22px 20px',
              background: 'rgba(255, 253, 245, 0.94)',
              borderRadius: 24,
              border: '0.5px solid rgba(255,255,255,0.92)',
              boxShadow:
                '0 22px 54px rgba(60,40,20,0.17), 0 4px 12px rgba(60,40,20,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <div className="text-center mb-5">
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#1c1917',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                }}
              >
                Try the live demo
              </h2>
              <p className="text-warm-500 text-sm mt-1">
                Tell us a bit about yourself to get instant access.
              </p>
            </div>

            {/* Already-signed-in shortcut */}
            {checkingAuth ? (
              <div className="flex justify-center py-4">
                <span role="status" aria-label="Checking sign-in status" className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            ) : isDemoUser ? (
              <div className="space-y-3">
                <div className="bg-primary-400/10 border border-primary-400/30 text-primary-800 px-4 py-3 rounded-xl text-sm text-center">
                  You&apos;re already in the demo — continue where you left off.
                </div>
                <Button
                  variant="primary"
                  onClick={() => router.push(DEMO_LANDING_PATH)}
                  className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 active:scale-[0.97] active:duration-75"
                  rightIcon={<ArrowRight className="w-4 h-4" aria-hidden />}
                >
                  Continue to dashboard
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-label="Demo access form">
                {/* Server error */}
                {serverError && (
                  <m.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
                    <span>{serverError}</span>
                  </m.div>
                )}

                {/* Name */}
                <Input
                  id="demo-name"
                  label="Your name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setServerError(null); }}
                  onBlur={() => setTouched(t => ({ ...t, name: true }))}
                  placeholder="Coach Alex Rivera"
                  required
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  error={nameError}
                  aria-describedby={nameError ? 'demo-name-error' : undefined}
                />

                {/* Email */}
                <Input
                  id="demo-email"
                  label="Work email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setServerError(null); }}
                  onBlur={() => setTouched(t => ({ ...t, email: true }))}
                  placeholder="coach@university.edu"
                  required
                  enterKeyHint="next"
                  error={emailError}
                  aria-describedby={emailError ? 'demo-email-error' : undefined}
                />

                {/* School / Program */}
                <Input
                  id="demo-school"
                  label="School / Program"
                  type="text"
                  value={school}
                  onChange={(e) => { setSchool(e.target.value); setServerError(null); }}
                  onBlur={() => setTouched(t => ({ ...t, school: true }))}
                  placeholder="State University Golf"
                  required
                  autoCapitalize="words"
                  enterKeyHint="go"
                  error={schoolError}
                  aria-describedby={schoolError ? 'demo-school-error' : undefined}
                />

                {/* Submit */}
                <Button
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className="
                    w-full min-h-[50px] py-3
                    bg-primary-600 text-white
                    font-semibold tracking-[-0.01em]
                    rounded-xl
                    shadow-lg shadow-primary-600/25
                    transition-all duration-200 ease-ios
                    hover:bg-primary-700 hover:shadow-primary-600/30
                    active:scale-[0.97] active:duration-75
                    disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100
                    flex items-center justify-center gap-2
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  "
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
                  You&apos;ll be signed into a shared demo account instantly.{' '}
                  No password needed.
                </p>
              </form>
            )}
          </m.div>

          {/* Footer */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={motionStagger(0.55)}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <p className="text-warm-600 text-sm">
              Already have an account?{' '}
              <Link
                href="/golf/login"
                className="text-primary-700 font-semibold hover:text-primary-600 transition-colors"
              >
                Sign in
              </Link>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-warm-500">
              <Link href="/privacy" className="hover:text-warm-700 transition-colors">Privacy</Link>
              <span className="text-warm-400" aria-hidden>·</span>
              <Link href="/terms" className="hover:text-warm-700 transition-colors">Terms</Link>
            </div>
          </m.div>
        </div>
      </div>
    </LazyMotion>
  );
}

// ---------------------------------------------------------------------------
// Page export (Suspense boundary for useSearchParams if we add it later)
// ---------------------------------------------------------------------------

export default function DemoGatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height: '100svh', background: '#FFFEFA' }}>
          <span role="status" aria-label="Loading demo" className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      }
    >
      <DemoGateContent />
    </Suspense>
  );
}
