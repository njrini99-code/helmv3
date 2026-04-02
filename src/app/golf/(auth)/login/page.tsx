'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';
import { IconChevronLeft } from '@/components/icons';

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
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Defer native detection to useEffect to avoid hydration mismatch:
  // isNativeApp() returns false on server (no window) but may return true on client.
  const [isNative, setIsNative] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        setIsAdmin((data?.role as string) === 'admin');
      }
      setCheckingAuth(false);
    }
    checkAuth();
  }, [supabase, supabase.auth]);

  async function handleSignOut() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsLoggingOut(false);
    router.refresh();
  }

  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6 bg-auth-golf">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to login form
      </a>

      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <m.div
          className="auth-orb auth-orb-1 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] -top-20 -right-20 sm:-top-32 sm:-right-32 bg-gradient-to-br from-primary-400/40 to-primary-500/30 motion-reduce:animate-none"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        {/* Medium orb - bottom left */}
        <m.div
          className="auth-orb auth-orb-2 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] -bottom-16 -left-16 sm:-bottom-24 sm:-left-24 bg-gradient-to-tr from-primary-400/30 to-primary-400/25 motion-reduce:animate-none"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
            scale: [1, 0.95, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        {/* Small accent orb - top left */}
        <m.div
          className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-primary-300/25 to-primary-400/20 motion-reduce:animate-none"
          animate={{
            x: [0, 20, 0],
            y: [0, -15, 0],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
        {/* Tiny floating dot */}
        <m.div
          className="absolute w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-primary-500/40 top-[30%] right-[15%] sm:right-[20%] motion-reduce:animate-none"
          animate={{
            y: [0, -10, 0],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Glass card */}
      <div id="login-form" className="relative z-10 w-full max-w-[420px]">
        <m.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
          {/* Back to landing */}
          <m.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="mb-4"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-700 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-warm-100/50"
            >
              <IconChevronLeft size={16} />
              Back
            </Link>
          </m.div>

          {/* Logo with glow effect */}
          <m.div
            className="flex flex-col items-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
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
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
              Welcome back
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">Sign in to continue to your dashboard</p>
          </m.div>

          {/* Success message */}
          {successMessage && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary-400/10 border border-primary-400/30 text-primary-600 px-4 py-3 rounded-xl text-sm mb-6"
            >
              {successMessage}
            </m.div>
          )}

          {/* Form or Already Logged In */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {checkingAuth ? (
              <div className="flex justify-center py-8">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-4">
                <div className="bg-primary-400/10 border border-primary-400/30 text-primary-600 px-4 py-3 rounded-xl text-sm text-center">
                  You&apos;re already signed in
                </div>
                <button
                  onClick={() => router.push(returnTo || (isAdmin ? '/golf/admin' : '/golf/dashboard'))}
                  className="w-full py-3 bg-primary-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 hover:bg-primary-700 hover:shadow-primary-600/30"
                >
                  {returnTo ? 'Continue' : isAdmin ? 'Continue to Admin Dashboard' : 'Continue to Dashboard'}
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full py-3 bg-warm-100 text-warm-700 font-semibold text-sm rounded-xl transition-all duration-200 hover:bg-warm-200 disabled:opacity-50"
                >
                  {isLoggingOut ? 'Signing out...' : 'Sign out & use a different account'}
                </button>
              </div>
            ) : (
              <GolfSignInForm />
            )}
          </m.div>
        </m.div>

        {/* Footer links with stagger animation */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {!isLoggedIn && !checkingAuth && (
            <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href={signupHref}
                className="text-primary-600 font-semibold hover:text-primary-500 transition-colors"
              >
                Sign up
              </Link>
            </p>
          )}

          {isLoggedIn && isAdmin && (
            <p className="text-center mt-4">
              <Link
                href="/golf/admin"
                className="text-xs text-warm-400 hover:text-warm-600 transition-colors"
              >
                Admin Dashboard
              </Link>
            </p>
          )}

          {!isNative && (
            <p className="text-center mt-4 text-warm-500 text-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-warm-700 transition-colors px-3 py-3 -my-3 min-h-[44px] rounded-lg active:bg-warm-100/50"
              >
                ← Back to HelmLabs
              </Link>
            </p>
          )}

          <div className="flex items-center justify-center gap-2 mt-3">
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

export default function GolfLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-auth-golf flex items-center justify-center">
          <span className="flex items-center gap-1.5">
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
