'use client';

// The Supabase client, `getUserResilient`, `resolveAdminPostLoginPath`,
// `clearActiveTeam`, `isSafeInternalPath` and `Button` all left with the
// client-side auth check — this page no longer touches auth at all. It renders
// a form. `updateSession` decides who gets to see it.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { HelmMark } from '@/components/brand/HelmMark';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isNativeApp } from '@/lib/utils/capacitor';

function LoginContent() {
  const prefersReducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const router = useRouter();
  const LOGIN_MESSAGES: Record<string, string> = {
    session_expired: 'Session expired. Please sign in again.',
    password_reset: 'Password reset successfully. Please sign in with your new password.',
    account_created: 'Account created successfully. Please sign in.',
    signed_out: 'You have been signed out.',
  };
  const messageKey = searchParams.get('message');
  const successMessage = messageKey ? LOGIN_MESSAGES[messageKey] ?? null : null;
  const returnTo = searchParams.get('returnTo');
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';

  const [isNative, setIsNative] = useState(false);
  const [brandMountDone, setBrandMountDone] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  // Prefetch the welcome page bundle — a successful sign-in goes straight there
  // (golf-sign-in-form.tsx) and we don't want to wait on JS at that moment.
  useEffect(() => {
    router.prefetch('/golf/welcome');
  }, [router]);

  /*
   * There is deliberately NO client-side auth check here any more.
   *
   * This page used to open with `checkingAuth = true`, run `getUserResilient`
   * plus a `users.role` query, and only then decide what to render. Two costs,
   * both visible:
   *
   *   · An ALREADY-SIGNED-IN user got the whole login screen — scene, brand
   *     lockup entrance, form card entrance — and was then yanked away by
   *     `router.replace` once the check resolved. A screen we already knew was
   *     wrong, rendered anyway, then visibly corrected.
   *   · A SIGNED-OUT user (the common case) sat behind three pulsing dots for a
   *     full network round trip before the form appeared. The form needs no
   *     session to render. It was waiting for an answer it never used.
   *
   * Both are now answered in `updateSession` before any HTML ships — see
   * `isBounceWhenAuthedRoute` in `@/lib/auth/post-auth-destination`. An
   * authenticated user never arrives here, so the form renders immediately and
   * unconditionally.
   *
   * The one population that still reaches this page with a session is a
   * `degraded` one — a local session the auth server could not verify. The
   * middleware intentionally does not bounce those (bouncing a dead session
   * loops it between here and the dashboard), and showing them the sign-in form
   * is exactly the right recovery.
   */

  return (
    <LazyMotion features={loadFeatures}>
      <div
        className="relative overflow-hidden"
        style={{
          height: '100dvh',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <a
          href="#login-form"
          className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Skip to login form
        </a>

        {/*
         * Back to the marketing home — the login is otherwise a dead-end.
         *
         * Native-only exception: proxy.ts treats "/" as a marketing route for
         * the HelmSportsLabsApp user agent (App Store Guideline 3.1.1) and
         * 307s it straight back here. Rendering the control in the native
         * shell gives the user a button that visibly does nothing — so it is
         * hidden there rather than looping them.
         */}
        {!isNative && (
        <Link
          href="/"
          aria-label="Back to home"
          className="absolute z-20 inline-flex items-center gap-1.5 rounded-full text-warm-700 hover:text-warm-900 transition-colors"
          style={{
            top: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
            left: 'max(1rem, env(safe-area-inset-left))',
            padding: '7px 13px 7px 10px',
            fontSize: 13.5,
            fontWeight: 600,
            background: 'rgba(255, 253, 245, 0.82)',
            WebkitBackdropFilter: 'blur(8px)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(60, 40, 20, 0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Home
        </Link>
        )}

        {/*
         * Exactly one scene renders per viewport — avoids paying paint, memory
         * and the background CSS-animation tick for the inactive scene.
         * Mobile/iOS native = portrait Scenic; desktop ≥768px = landscape Coastal.
         * SSR renders the mobile scene (matches iOS, our native target) and
         * `useMediaQuery` swaps to Coastal after hydration on desktop.
         */}
        {isDesktop ? <CoastalScene idSuffix="login-coastal" /> : <CourseScene idSuffix="login" />}

        {/* Content — flex column that fits any iPhone without scroll */}
        <div
          className="relative z-10 h-full flex flex-col items-center px-5"
          style={{
            paddingTop: 'max(2.5rem, calc(env(safe-area-inset-top) + 1.75rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Brand lockup */}
          <m.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
            onAnimationComplete={() => setBrandMountDone(true)}
            className="flex flex-col items-center gap-2.5 shrink-0"
          >
            <div
              data-scene-animated
              style={{
                animation: 'helmSceneLogoFloat 5s ease-in-out infinite',
                // Only force GPU promotion during the initial mount animation.
                // After Framer Motion's enter animation completes, the CSS
                // keyframe's gentle translate is fine without the layer hint
                // and we avoid paying a permanent composite-layer cost.
                willChange: brandMountDone ? undefined : 'transform',
              }}
            >
              <HelmMark
                sport="golf"
                size={64}
                className="h-16 w-16"
                priority
                imgStyle={{ filter: 'drop-shadow(0 1px 3px rgba(60,40,20,0.22))' }}
              />
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: '-0.033em',
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.12))',
              }}
            >
              <span style={{ color: '#1c1917' }}>Golf</span>
              <span style={{ color: '#15803D' }}>Helm</span>
            </h1>
          </m.div>

          {/* Form card */}
          <m.div
            id="login-form"
            role="region"
            aria-label="Login form"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] })}
            className="w-full max-w-[420px] mt-5 shrink-0"
            style={{
              padding: '22px 20px 18px',
              background: 'rgba(255, 253, 245, 0.94)',
              borderRadius: 24,
              border: '0.5px solid rgba(255,255,255,0.9)',
              boxShadow:
                '0 20px 50px rgba(60, 40, 20, 0.18), 0 4px 12px rgba(60, 40, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <div className="text-center">
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#1c1917',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                }}
              >
                Log in to GolfHelm
              </h2>
            </div>

            {successMessage && (
              <m.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 bg-primary-400/10 border border-primary-400/30 text-primary-700 px-4 py-3 rounded-xl text-sm"
              >
                {successMessage}
              </m.div>
            )}

            {/*
              Renders immediately. No auth gate, no pulsing-dots placeholder —
              the middleware has already guaranteed that whoever reaches this
              page needs the form.
            */}
            <div className="mt-4">
              <GolfSignInForm />
            </div>

            {/* Tiny caption below form: signup link (web) + legal (all) */}
            <div
              className="mt-4 pt-3 text-center"
              style={{ borderTop: '0.5px solid rgba(120,113,108,0.14)' }}
            >
              {!isNative && (
                <p className="text-warm-600 text-caption">
                  New to GolfHelm?{' '}
                  <Link href={signupHref} className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">
                    Create an account
                  </Link>
                </p>
              )}
              <div className="flex items-center justify-center gap-1.5 text-eyebrow text-warm-500 mt-1.5 tracking-[0.02em]">
                <Link href="/privacy" className="hover:text-warm-700 transition-colors">Privacy</Link>
                <span className="text-warm-400" aria-hidden="true">·</span>
                <Link href="/terms" className="hover:text-warm-700 transition-colors">Terms</Link>
              </div>
            </div>
          </m.div>

          {/* Course scene decorates the remaining space below naturally — nothing else here */}
          <div className="flex-1" />
        </div>

        {/* Scene keyframes live in `src/app/globals.css` (prefixed `helmScene…`)
            so they're shared across scenes and scoped reduced-motion hits
            `[data-scene-animated]` only — never touches focus rings or status
            indicators. */}
      </div>
    </LazyMotion>
  );
}

export default function GolfLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height: '100svh', background: '#FFFEFA' }}>
          <span role="status" aria-label="Loading sign-in" className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
