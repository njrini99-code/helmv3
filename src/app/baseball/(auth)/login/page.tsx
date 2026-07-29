'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BaseballSignInForm } from '@/components/auth/baseball-sign-in-form';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';
import { setRememberedFirstName } from '@/lib/entry/greeting';
import { probeSignedIn } from '@/lib/demo/gate-probe';
import {
  AuthCard,
  AuthFooterLinks,
  AuthPendingDots,
  BaseballAuthShell,
} from '@/components/auth/baseball-auth-shell';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Use predefined message codes to prevent content injection via query params
const LOGIN_MESSAGES: Record<string, string> = {
  session_expired: 'Session expired. Please sign in again.',
  password_reset: 'Password reset successfully. Please sign in with your new password.',
  account_created: 'Account created successfully. Please sign in.',
  signed_out: 'You have been signed out.',
};

// Reads the `message` query param to show a one-line status banner above
// the sign-in form. Scoped to its own Suspense (mirrors signup/page.tsx's
// SignupFooter pattern) so the shell — scene, welcome copy, form chrome —
// still renders eagerly instead of sitting behind one page-level fallback.
function LoginStatusBanner() {
  const searchParams = useSearchParams();
  const messageKey = searchParams.get('message');
  const successMessage = messageKey ? LOGIN_MESSAGES[messageKey] ?? null : null;

  if (!successMessage) return null;

  return (
    <div
      className="mb-6 animate-fade-in rounded-xl border border-grade-plus/25 bg-grade-plus/10 px-4 py-3 text-sm text-primary-700"
      role="status"
    >
      {successMessage}
    </div>
  );
}

// Reads `returnTo` from the URL to preserve it through the sign-up switch
// link. Same pattern/purpose as signup/page.tsx's SignupFooter.
function LoginFooter({
  isLoggedIn,
  checkingAuth,
  isNative,
}: {
  isLoggedIn: boolean;
  checkingAuth: boolean;
  isNative: boolean;
}) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const signupHref = returnTo ? `/baseball/signup?returnTo=${encodeURIComponent(returnTo)}` : '/baseball/signup';

  return (
    <AuthFooterLinks
      switchLabel={!isLoggedIn && !checkingAuth && !isNative ? "Don't have an account?" : undefined}
      switchHref={signupHref}
      switchCta="Sign up"
      showBackToHelmLabs={!isNative}
    />
  );
}

// Reads `returnTo` for the "already signed in" continue target/label.
function LoggedInActions({
  isLoggingOut,
  onSignOut,
}: {
  isLoggingOut: boolean;
  onSignOut: () => void;
}) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const router = useRouter();

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-grade-plus/25 bg-grade-plus/10 px-4 py-3 text-center text-sm text-primary-700">
        You&apos;re already signed in
      </div>
      <Button
        variant="primary"
        onClick={() => router.push(returnTo || '/baseball/dashboard/command-center')}
        className="min-h-[50px] w-full py-3 text-body font-semibold tracking-[-0.01em]"
      >
        {returnTo ? 'Continue' : 'Continue to Dashboard'}
      </Button>
      <Button
        variant="ghost"
        onClick={onSignOut}
        isLoading={isLoggingOut}
        className="min-h-[50px] w-full py-3 text-body font-semibold tracking-[-0.01em]"
      >
        {isLoggingOut ? 'Signing out…' : 'Sign out & use a different account'}
      </Button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Defer native detection to useEffect to avoid hydration mismatch:
  // isNativeApp() returns false on server (no window) but may return true on client.
  const [isNative, setIsNative] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  // "Am I already signed in?" — via probeSignedIn, NOT a raw getUser().
  //
  // This effect is the only thing that clears `checkingAuth`, and `checkingAuth`
  // is what stands between a visitor and the sign-in form. The previous version
  // awaited `supabase.auth.getUser()` bare — no catch, no timeout — so any
  // outcome other than a clean resolve left `setCheckingAuth(false)` unreached
  // and the page pinned on "Checking sign-in status" forever, with no form to
  // type into. A login screen that cannot render its own form because a network
  // call did not come back is the worst possible failure on the most important
  // page in the product.
  //
  // That hang is not hypothetical and it is already documented in this
  // codebase: gate-probe.ts (#918) exists because "a stale/expired httpOnly
  // Supabase auth cookie and a network blip can leave getUser()'s internal
  // refresh-token exchange hanging indefinitely — the browser fetch GoTrue
  // issues internally has no timeout of its own, so the returned promise may
  // simply never settle." Both demo gates adopted probeSignedIn. The login
  // pages never did.
  //
  // probeSignedIn races a 4s deadline and treats EVERY failure — timeout,
  // throw, or an error surfaced through getUser()'s own `error` field — as
  // signed out, so this effect always settles. Failing to "signed out" is the
  // right bias here: the worst case is showing the form to someone already
  // authenticated, and signing in again works fine.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await probeSignedIn(supabase);
      if (cancelled) return;
      setIsLoggedIn(!!user);
      setCheckingAuth(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Entry World personalization (docs/baseball/ENTRY_SCENES_DESIGN.md family
  // rule #6): remember the first name on a fresh sign-in only — never on
  // `INITIAL_SESSION` (an already-authed page load, not a login success) —
  // so the next visit's greeting can read "Welcome back, {name}." Purely
  // additive: doesn't touch loginAction, redirects, validation, or errors.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN') return;
      const firstName = session?.user?.user_metadata?.first_name;
      if (typeof firstName === 'string' && firstName.trim()) {
        setRememberedFirstName(firstName);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSignOut() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsLoggingOut(false);
    router.refresh();
  }

  return (
    <BaseballAuthShell
      skipTargetId="login-form"
      skipLabel="Skip to login form"
      sceneIdSuffix="login"
      eyebrow="COACHES · PLAYERS · PROGRAMS"
      welcomeLine="Welcome back to the Yard."
      tagline="Sign in to continue to your dashboard."
      hero
      footer={
        <Suspense
          fallback={
            <AuthFooterLinks
              switchLabel="Don't have an account?"
              switchHref="/baseball/signup"
              switchCta="Sign up"
              showBackToHelmLabs
            />
          }
        >
          <LoginFooter isLoggedIn={isLoggedIn} checkingAuth={checkingAuth} isNative={isNative} />
        </Suspense>
      }
    >
      <AuthCard ariaLabel="Sign in">
        <Suspense fallback={null}>
          <LoginStatusBanner />
        </Suspense>

        {checkingAuth ? (
          <div className="flex justify-center py-8">
            <AuthPendingDots label="Checking sign-in status" />
          </div>
        ) : isLoggedIn ? (
          <Suspense fallback={null}>
            <LoggedInActions isLoggingOut={isLoggingOut} onSignOut={handleSignOut} />
          </Suspense>
        ) : (
          <div className="animate-fade-in">
            <Suspense
              fallback={
                <div className="animate-pulse space-y-4">
                  <div className="h-12 rounded-xl bg-warm-100" />
                  <div className="h-12 rounded-xl bg-warm-100" />
                  <div className="h-12 rounded-xl bg-grade-plus/15" />
                </div>
              }
            >
              <BaseballSignInForm />
            </Suspense>
          </div>
        )}
      </AuthCard>
    </BaseballAuthShell>
  );
}
