'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BaseballSignInForm } from '@/components/auth/baseball-sign-in-form';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Button } from '@/components/ui/button';

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
    <div className="auth-shell min-h-dvh flex items-center justify-center relative p-4 sm:p-6 bg-auth-baseball">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to login form
      </a>

      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <motion.div
          className="auth-orb auth-orb-1 w-[500px] h-[500px] -top-32 -right-32 bg-gradient-to-br from-helm-amber-400/40 to-helm-amber-500/30 motion-reduce:animate-none"
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
        <motion.div
          className="auth-orb auth-orb-2 w-[400px] h-[400px] -bottom-24 -left-24 bg-gradient-to-tr from-helm-amber-400/30 to-helm-amber-400/25 motion-reduce:animate-none"
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
        <motion.div
          className="auth-orb auth-orb-3 w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-helm-amber-300/25 to-helm-amber-400/20 motion-reduce:animate-none"
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
        <motion.div
          className="absolute w-3 h-3 rounded-full bg-helm-amber-500/40 top-[30%] right-[20%] motion-reduce:animate-none"
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
          backgroundImage: `linear-gradient(rgba(245, 158, 11, 0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(245, 158, 11, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Glass card */}
      <div id="login-form" className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="auth-glass-card rounded-3xl p-8 sm:p-10"
        >
          {/* Logo with glow effect */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-amber-500/30 rounded-full blur-xl scale-150" />
              <div className="relative w-14 h-14 flex items-center justify-center mb-4">
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
            <h1 className="text-xl font-bold bg-gradient-to-r from-warm-900 to-warm-700 bg-clip-text text-transparent">
              BaseballHelm
            </h1>
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-h2 sm:text-h1 leading-tight font-bold tracking-[-0.02em] text-warm-900 mb-2">
              Welcome back
            </h2>
            <p className="text-warm-500">Sign in to continue to your dashboard</p>
          </motion.div>

          {/* Success message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-helm-amber-400/10 border border-helm-amber-400/30 text-helm-amber-600 px-4 py-3 rounded-xl text-sm mb-6"
            >
              {successMessage}
            </motion.div>
          )}

          {/* Form or Already Logged In */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {checkingAuth ? (
              <div className="flex justify-center py-8">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-helm-amber-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-4">
                <div className="bg-helm-amber-400/10 border border-helm-amber-400/30 text-helm-amber-600 px-4 py-3 rounded-xl text-sm text-center">
                  You&apos;re already signed in
                </div>
                <Button variant="primary"
                  onClick={() => router.push(returnTo || '/baseball/dashboard')}
                  className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold text-body tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.97] active:duration-75"
                >
                  {returnTo ? 'Continue' : 'Continue to Dashboard'}
                </Button>
                <Button variant="ghost"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full min-h-[50px] py-3 bg-warm-100 text-warm-700 font-semibold text-body tracking-[-0.01em] rounded-xl transition-all duration-200 ease-ios hover:bg-warm-200 active:scale-[0.97] active:duration-75 disabled:opacity-50 disabled:active:scale-100"
                >
                  {isLoggingOut ? 'Signing out…' : 'Sign out & use a different account'}
                </Button>
              </div>
            ) : (
              <BaseballSignInForm />
            )}
          </motion.div>
        </motion.div>

        {/* Footer links with stagger animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {!isLoggedIn && !checkingAuth && !isNative && (
            <p className="text-center mt-6 text-warm-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href={signupHref}
                className="text-helm-amber-600 font-semibold hover:text-helm-amber-500 transition-colors"
              >
                Sign up
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
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-warm-900 flex items-center justify-center">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
