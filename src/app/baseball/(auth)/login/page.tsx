'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BaseballSignInForm } from '@/components/auth/baseball-sign-in-form';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';
import {
  AuthCard,
  AuthFooterLinks,
  AuthPendingDots,
  BaseballAuthShell,
} from '@/components/auth/baseball-auth-shell';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Use predefined message codes to prevent content injection via query params
  const LOGIN_MESSAGES: Record<string, string> = {
    session_expired: 'Session expired. Please sign in again.',
    password_reset: 'Password reset successfully. Please sign in with your new password.',
    account_created: 'Account created successfully. Please sign in.',
    signed_out: 'You have been signed out.',
  };
  const messageKey = searchParams.get('message');
  const successMessage = messageKey ? LOGIN_MESSAGES[messageKey] ?? null : null;
  const returnTo = searchParams.get('returnTo');
  const signupHref = returnTo ? `/baseball/signup?returnTo=${encodeURIComponent(returnTo)}` : '/baseball/signup';

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

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      setCheckingAuth(false);
    }
    checkAuth();
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
      eyebrow="COACHES · PLAYERS · PROGRAMS"
      tagline="Sign in to continue to your dashboard."
      hero
      footer={
        <AuthFooterLinks
          switchLabel={!isLoggedIn && !checkingAuth && !isNative ? "Don't have an account?" : undefined}
          switchHref={signupHref}
          switchCta="Sign up"
          showBackToHelmLabs={!isNative}
        />
      }
    >
      <AuthCard ariaLabel="Sign in">
        {successMessage && (
          <div
            className="mb-6 animate-fade-in rounded-xl border border-grade-plus/25 bg-grade-plus/10 px-4 py-3 text-sm text-primary-700"
            role="status"
          >
            {successMessage}
          </div>
        )}

        {checkingAuth ? (
          <div className="flex justify-center py-8">
            <AuthPendingDots label="Checking sign-in status" />
          </div>
        ) : isLoggedIn ? (
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
              onClick={handleSignOut}
              isLoading={isLoggingOut}
              className="min-h-[50px] w-full py-3 text-body font-semibold tracking-[-0.01em]"
            >
              {isLoggingOut ? 'Signing out…' : 'Sign out & use a different account'}
            </Button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <BaseballSignInForm />
          </div>
        )}
      </AuthCard>
    </BaseballAuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="baseball-auth-field flex min-h-[100dvh] items-center justify-center">
          <AuthPendingDots label="Loading sign-in page" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
