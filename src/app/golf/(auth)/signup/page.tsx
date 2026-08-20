'use client';

import Link from 'next/link';
import { AuthHomeLink } from '../AuthHomeLink';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { GolfSignUpForm } from '@/components/auth/golf-sign-up-form';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isNativeApp } from '@/lib/utils/capacitor';
import { validateAccessCode, type SignupCodeScope } from '@/app/golf/actions/access-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  // Which NAMESPACE the accepted code came from. It decides what the second
  // role option MEANS: with a roster code it is "Assistant coach", which joins
  // this program immediately with full access; only the global code still
  // offers "Coach", the new-program path (the owner stands head coaches up by
  // hand, so that door is effectively theirs). A roster code must never reach
  // new-program onboarding — that is what minted a duplicate organization for
  // the assistants who picked Coach.
  const [codeScope, setCodeScope] = useState<SignupCodeScope>('generic');
  // The name of the team the roster code belongs to, so the role screen can say
  // "Join Guilford as…" instead of a bare "I am a…". A coach hands the SAME code
  // to players and to an incoming assistant, so naming the program is the only
  // confirmation the person typing it gets that they are joining the right one.
  const [teamName, setTeamName] = useState<string | null>(null);
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
    const { scope, teamName: resolvedTeamName } = await validateAccessCode(entered);
    if (scope !== 'invalid') {
      setAccessGranted(true);
      setCodeError(false);
      setCodeScope(scope);
      setTeamName(resolvedTeamName);
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
      <LazyMotion features={loadFeatures}>
        <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
          <AuthHomeLink />
          {/*
           * Reuse the login page's painterly scene as the gate backdrop instead
           * of the old floating-orb field. Exactly one scene renders per
           * viewport: portrait CourseScene on mobile/iOS (the SSR default),
           * landscape CoastalScene on desktop ≥768px after hydration.
           */}
          {isDesktop ? <CoastalScene idSuffix="signup-gate-coastal" /> : <CourseScene idSuffix="signup-gate" />}

          <div className="relative z-10 w-full max-w-[420px]">
            <m.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
              className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
            >
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

              <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
                  Enter your team code
                </h2>
                <p className="text-warm-500 text-sm sm:text-base">
                  Use the code your coach gave you. You&rsquo;ll join their team automatically.
                </p>
              </div>

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    inputMode="text"
                    pattern="[A-Za-z0-9]*"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-label="Team code"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(false); }}
                    placeholder="Team code"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on signup access-code gate
                    autoFocus
                    className={`w-full h-12 px-4 rounded-xl border bg-cream-100/82 text-warm-900 placeholder:text-warm-400 text-center text-lg tracking-widest font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition-all ${
                      codeError ? 'border-red-300 ring-2 ring-red-500/20' : 'border-warm-200'
                    }`}
                  />
                  {codeError && (
                    <p className="text-sm text-red-600 mt-2 text-center">
                      That code didn&rsquo;t match a team. Check it with your coach and try again.
                    </p>
                  )}
                </div>
                <Button variant="primary"
                  type="submit"
                  // primary-700 (not -600): white text on primary-600 (#16a34a)
                  // is only 3.29:1 — below WCAG AA 4.5:1. primary-700 (#15803d)
                  // lands at ~5.0:1. Hover/active darken further to stay compliant.
                  className="w-full h-12 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary-800 active:bg-primary-900 transition-colors"
                >
                  Continue
                </Button>
              </form>
            </m.div>

            <m.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
            >
              {/* READABILITY OVER THE SCENE.
                  These two lines used to sit as bare text directly on the
                  painterly course illustration. On a phone the card ends
                  higher up the viewport, so they landed right on the trees —
                  green `text-primary-600` links on green foliage, reported
                  2026-08-20 as "the wording at the bottom you can't even
                  read". The panel gives them their own opaque ground instead
                  of relying on whatever pixel happens to be behind them. */}
              <div className="mx-auto mt-5 sm:mt-6 w-fit max-w-full rounded-2xl bg-cream-50/95 px-4 py-3 shadow-sm ring-1 ring-warm-200/70 backdrop-blur-sm">
              <p className="text-center text-warm-700 text-sm">
                Already have an account?{' '}
                <Suspense fallback={<Link href="/golf/login" className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">Sign in</Link>}>
                  <SignInLink />
                </Suspense>
              </p>
              {/* This gate serves ONE audience: a player joining with the code
                  their coach gave them. That is deliberate — production logs
                  carry "SIGNUP_ACCESS_CODE is unset — by design: signup is team
                  join_code only", so self-serve coach signup is sales-led.
                  But the login page's single "Create an account" link sends
                  everyone here, and a coach has no coach and no team code: the
                  copy, the placeholder and the failure message all point them
                  at someone who does not exist. `/golf/demo` is public and
                  built for exactly that visitor, and was linked from neither
                  page. See #1483 — this is the exit only; whether the login
                  page should also split the two audiences is still open there. */}
              <p className="text-center mt-2 text-warm-600 text-sm">
                Not joining a team?{' '}
                <Link
                  href="/golf/demo"
                  className="text-primary-700 font-semibold hover:text-primary-600 transition-colors"
                >
                  See a live demo
                </Link>
              </p>
              </div>
            </m.div>
          </div>
        </div>
      </LazyMotion>
    );
  }
  return (
    <LazyMotion features={loadFeatures}>
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
      <AuthHomeLink />
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
              {teamName ? `Join ${teamName}` : 'Create your account'}
            </h2>
            {/* "Let's set up your team" was actively misleading on a roster
                code: nobody arriving with a coach's code is setting up a team,
                they are joining one that already exists. That sentence is a
                large part of why an assistant reached for "Coach". */}
            <p className="text-warm-500 text-sm sm:text-base">
              {teamName
                ? 'Choose how you\u2019re joining, then create your account.'
                : 'You\u2019re in. Let\u2019s set up your team.'}
            </p>
          </m.div>

          {/* Form */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
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
              <GolfSignUpForm joinCode={joinCode} codeScope={codeScope} teamName={teamName} />
            </Suspense>
          </m.div>
        </m.div>

        {/* Footer links with stagger animation */}
        <m.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
        >
          {/* Same readability panel as the code gate: these lines sit over the
              painterly scene, and on a phone they land on the foliage. */}
          <div className="mx-auto mt-5 sm:mt-6 w-fit max-w-full rounded-2xl bg-cream-50/95 px-4 py-3 shadow-sm ring-1 ring-warm-200/70 backdrop-blur-sm">
            <p className="text-center text-warm-700 text-sm">
              Already have an account?{' '}
              <Suspense fallback={<Link href="/golf/login" className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">Sign in</Link>}>
                <SignInLink />
              </Suspense>
            </p>
          </div>

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
