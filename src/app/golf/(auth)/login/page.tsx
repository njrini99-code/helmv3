'use client';

// The Supabase client, `getUserResilient`, `resolveAdminPostLoginPath`,
// `clearActiveTeam`, `isSafeInternalPath` and `Button` all left with the
// client-side auth check — this page no longer touches auth at all. It renders
// a form. `updateSession` decides who gets to see it.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';
import { AuthCanvas, authTextLinkClass } from '@/components/auth/golf-auth-canvas';
import { isNativeApp } from '@/lib/utils/capacitor';

/*
 * 2026-09 redesign: a flat canvas with one app mark and one title, the fields
 * in an iOS inset group, and the legal links pinned to the bottom. The
 * illustrated course scene, the floating logo, the second "GolfHelm" wordmark,
 * the card and its shadow, the DM Sans override and the framer entrance
 * animations are gone. Auth behaviour is unchanged: everything that signs in
 * lives in GolfSignInForm and the server action.
 */

function LoginContent() {
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
    <>
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-modal focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-600"
      >
        Skip to login form
      </a>

      <AuthCanvas
        contentId="login-form"
        contentLabel="Login form"
        title="Sign in"
        subtitle="GolfHelm for college golf"
        topBar={
          /*
           * Back to the marketing home, since the login is otherwise a dead end.
           *
           * Native-only exception: proxy.ts treats "/" as a marketing route for
           * the HelmSportsLabsApp user agent (App Store Guideline 3.1.1) and
           * 307s it straight back here. In the native shell the control would
           * visibly do nothing, so it is hidden there rather than looping them.
           */
          !isNative ? (
            <Link
              href="/"
              aria-label="Back to home"
              className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-body-lg text-accent-700 outline-none focus-visible:ring-2 focus-visible:ring-accent-600 active:opacity-60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Home
            </Link>
          ) : null
        }
        footer={
          <>
            {!isNative && (
              <p className="text-center text-body text-text-secondary">
                New here?{' '}
                <Link href={signupHref} className={authTextLinkClass}>
                  Create an account
                </Link>
              </p>
            )}
            <div className="flex items-center justify-center gap-1 text-caption text-text-tertiary">
              {/* `py-3 -my-3 min-h-[44px]` gives these a 44px touch target
                  without moving anything: the padding grows the hit area and
                  the negative margin cancels the vertical growth. Kept in step
                  with signup/page.tsx by `src/test/static/legal-link-touch-targets.test.ts`. */}
              <Link
                href="/privacy"
                className="inline-flex items-center rounded-lg px-2 py-3 -my-3 min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-accent-600 active:opacity-60"
              >
                Privacy
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                href="/terms"
                className="inline-flex items-center rounded-lg px-2 py-3 -my-3 min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-accent-600 active:opacity-60"
              >
                Terms
              </Link>
            </div>
          </>
        }
      >
        {successMessage && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-fw-success-bg px-4 py-3 text-body text-fw-success-ink"
          >
            {successMessage}
          </p>
        )}

        {/*
          Renders immediately. No auth gate and no pulsing-dots placeholder:
          the middleware has already made sure whoever reaches this page needs
          the form.
        */}
        <GolfSignInForm />
      </AuthCanvas>
    </>
  );
}

export default function GolfLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-canvas">
          <span role="status" className="sr-only">
            Loading sign-in
          </span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
