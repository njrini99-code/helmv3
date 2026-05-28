'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { GolfSignUpForm } from '@/components/auth/golf-sign-up-form';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isNativeApp } from '@/lib/utils/capacitor';
import { validateAccessCode } from '@/app/golf/actions/access-code';
import { Button } from '@/components/ui/button';

// Component to render sign-in link with returnTo param preserved
function SignInLink() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const loginHref = returnTo ? `/golf/login?returnTo=${encodeURIComponent(returnTo)}` : '/golf/login';

  return (
    <Link
      href={loginHref}
      className="text-primary-600 font-semibold hover:text-primary-500 transition-colors"
    >
      Sign in
    </Link>
  );
}

export default function SignupPage() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  // Defer native detection to useEffect to avoid hydration mismatch.
  const [isNative, setIsNative] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  // Team join code carried in via the invite link (/golf/join/<CODE> →
  // /golf/signup?returnTo=...). Prefills the access-code field and is forwarded
  // to onboarding so the player auto-joins the inviting team.
  const [joinCode, setJoinCode] = useState<string | null>(null);
  // Match the login page: one painterly scene per viewport. SSR renders the
  // portrait CourseScene (matches our iOS native target) and useMediaQuery
  // swaps to the landscape CoastalScene after hydration on desktop ≥768px.
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (isNativeApp()) {
      // Helm Sports Labs memberships are purchased on the web.
      // The iOS app is for existing members only — redirect to login.
      setIsNative(true);
      router.replace('/golf/login');
    }
  }, [router]);

  // Prefill the access code from an invite link so coach-invited players can
  // continue with a single tap. Read from window.location to avoid needing a
  // useSearchParams Suspense boundary on this gate.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let linkCode = params.get('joinCode') || params.get('code');
    if (!linkCode) {
      const returnTo = params.get('returnTo');
      const match = returnTo?.match(/\/golf\/join\/([^/?#]+)/i);
      if (match?.[1]) linkCode = decodeURIComponent(match[1]);
    }
    if (linkCode) {
      const normalized = linkCode.trim().toUpperCase();
      setJoinCode(normalized);
      setCode(normalized);
    }
  }, []);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entered = code.trim();
    const isValid = await validateAccessCode(entered);
    if (isValid) {
      setAccessGranted(true);
      setCodeError(false);
      // If a player typed a team join code directly (no invite link), carry it
      // to onboarding so they still auto-join that team. Non-team codes (e.g.
      // the global access code) are a harmless no-op on the onboarding side.
      if (!joinCode && entered) setJoinCode(entered.toUpperCase());
    } else {
      setCodeError(true);
    }
  }

  if (!accessGranted) {
    return (
      <LazyMotion features={domAnimation}>
        <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
          {/*
           * Reuse the login page's painterly scene as the gate backdrop instead
           * of the old floating-orb field. Exactly one scene renders per
           * viewport: portrait CourseScene on mobile/iOS (the SSR default),
           * landscape CoastalScene on desktop ≥768px after hydration.
           */}
          {isDesktop ? <CoastalScene idSuffix="signup-gate-coastal" /> : <CourseScene idSuffix="signup-gate" />}

          <div className="relative z-10 w-full max-w-[420px]">
            <m.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
              className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
            >
              <m.div
                className="flex flex-col items-center mb-6 sm:mb-8"
                initial={{ opacity: 0, y: 10 }}
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

              <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
                  Access Code Required
                </h2>
                <p className="text-warm-500 text-sm sm:text-base">
                  Enter your invite code to create an account
                </p>
              </div>

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    inputMode="text"
                    pattern="[A-Za-z0-9]*"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-label="Access code"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(false); }}
                    placeholder="Enter access code"
                    autoFocus
                    className={`w-full h-12 px-4 rounded-xl border bg-cream-100/82 text-warm-900 placeholder:text-warm-400 text-center text-lg tracking-widest font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition-all ${
                      codeError ? 'border-red-300 ring-2 ring-red-500/20' : 'border-warm-200'
                    }`}
                  />
                  {codeError && (
                    <p className="text-sm text-red-600 mt-2 text-center">
                      Invalid access code. Please try again.
                    </p>
                  )}
                </div>
                <Button variant="primary"
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors"
                >
                  Continue
                </Button>
              </form>
            </m.div>

            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
            >
              <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
                Already have an account?{' '}
                <Suspense fallback={<Link href="/golf/login" className="text-primary-600 font-semibold hover:text-primary-500 transition-colors">Sign in</Link>}>
                  <SignInLink />
                </Suspense>
              </p>
            </m.div>
          </div>
        </div>
      </LazyMotion>
    );
  }
  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#signup-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to signup form
      </a>

      {/*
       * Painterly login scene as the backdrop — replaces the old orb field +
       * 60px grid overlay. One scene per viewport: portrait CourseScene on
       * mobile/iOS (SSR default), landscape CoastalScene on desktop ≥768px.
       */}
      {isDesktop ? <CoastalScene idSuffix="signup-coastal" /> : <CourseScene idSuffix="signup" />}

      {/* Glass card */}
      <div id="signup-form" className="relative z-10 w-full max-w-[420px]">
        <m.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
          {/* Logo with glow effect */}
          <m.div
            className="flex flex-col items-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3, duration: 0.5 })}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
              Create your account
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">You&apos;re in. Let&apos;s set up your team.</p>
          </m.div>

          {/* Form */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, duration: 0.5 })}
          >
            <Suspense fallback={
              <div className="space-y-4 animate-pulse">
                <div className="h-20 bg-warm-200 rounded-xl" />
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="h-12 bg-warm-200 rounded-xl" />
                  <div className="h-12 bg-warm-200 rounded-xl" />
                </div>
                <div className="h-12 bg-warm-200 rounded-xl" />
                <div className="h-12 bg-warm-200 rounded-xl" />
                <div className="h-12 bg-primary-400/20 rounded-xl" />
              </div>
            }>
              <GolfSignUpForm joinCode={joinCode} />
            </Suspense>
          </m.div>
        </m.div>

        {/* Footer links with stagger animation */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
        >
          <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
            Already have an account?{' '}
            <Suspense fallback={<Link href="/golf/login" className="text-primary-600 font-semibold hover:text-primary-500 transition-colors">Sign in</Link>}>
              <SignInLink />
            </Suspense>
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

          <div className="flex items-center justify-center gap-2 mt-2 sm:mt-3">
            <Link
              href="/privacy"
              className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg active:bg-warm-100/50"
            >
              Privacy
            </Link>
            <span className="text-warm-300" aria-hidden="true">·</span>
            <Link
              href="/terms"
              className="text-warm-400 hover:text-warm-600 transition-colors text-xs px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg active:bg-warm-100/50"
            >
              Terms
            </Link>
          </div>
        </m.div>
      </div>
    </div>
    </LazyMotion>
  );
}
