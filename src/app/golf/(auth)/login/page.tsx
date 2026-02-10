'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';
import { createClient } from '@/lib/supabase/client';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const successMessage = searchParams.get('message');
  const returnTo = searchParams.get('returnTo');
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = createClient();

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
    <div className="min-h-screen flex items-center justify-center relative p-4 sm:p-6 bg-auth-golf">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to login form
      </a>

      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <motion.div
          className="auth-orb auth-orb-1 w-[500px] h-[500px] -top-32 -right-32 bg-gradient-to-br from-helm-green-400/40 to-helm-green-500/30 motion-reduce:animate-none"
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
          className="auth-orb auth-orb-2 w-[400px] h-[400px] -bottom-24 -left-24 bg-gradient-to-tr from-helm-green-400/30 to-helm-green-400/25 motion-reduce:animate-none"
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
          className="auth-orb auth-orb-3 w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-helm-green-300/25 to-helm-green-400/20 motion-reduce:animate-none"
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
          className="absolute w-3 h-3 rounded-full bg-helm-green-500/40 top-[30%] right-[20%] motion-reduce:animate-none"
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
              <div className="absolute inset-0 bg-helm-green-500/30 rounded-full blur-xl scale-150" />
              <div className="relative w-14 h-14 flex items-center justify-center mb-4">
                <Image
                  src="/helm-golf-logo-transparent.png"
                  alt="GolfHelm Logo"
                  width={56}
                  height={56}
                  className="w-14 h-14 object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-warm-900 to-warm-700 bg-clip-text text-transparent">
              GolfHelm
            </h1>
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-warm-900 mb-2">
              Welcome back
            </h2>
            <p className="text-warm-500">Sign in to continue to your dashboard</p>
          </motion.div>

          {/* Success message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-helm-green-400/10 border border-helm-green-400/30 text-helm-green-600 px-4 py-3 rounded-xl text-sm mb-6"
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
                <div className="animate-spin h-6 w-6 border-2 border-helm-green-600 border-t-transparent rounded-full" />
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-4">
                <div className="bg-helm-green-400/10 border border-helm-green-400/30 text-helm-green-600 px-4 py-3 rounded-xl text-sm text-center">
                  You&apos;re already signed in
                </div>
                <button
                  onClick={() => router.push('/golf/dashboard')}
                  className="w-full py-3 bg-primary-600 text-white font-medium text-sm rounded-[10px] shadow-sm transition-all duration-200 hover:bg-primary-700 hover:shadow-md"
                >
                  Continue to Dashboard
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full py-3 bg-warm-100 text-warm-700 font-medium text-sm rounded-[10px] transition-all duration-200 hover:bg-warm-200 disabled:opacity-50"
                >
                  {isLoggingOut ? 'Signing out...' : 'Sign out & use a different account'}
                </button>
              </div>
            ) : (
              <GolfSignInForm />
            )}
          </motion.div>
        </motion.div>

        {/* Footer links with stagger animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {!isLoggedIn && !checkingAuth && (
            <p className="text-center mt-6 text-warm-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href={signupHref}
                className="text-helm-green-600 font-semibold hover:text-helm-green-500 transition-colors"
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

          <p className="text-center mt-4 text-warm-500 text-sm">
            <Link href="/" className="hover:text-warm-700 transition-colors">
              ← Back to HelmLabs
            </Link>
          </p>

          <p className="text-center mt-3 text-warm-400 text-xs">
            <Link href="/privacy" className="hover:text-warm-600 transition-colors">
              Privacy
            </Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-warm-600 transition-colors">
              Terms
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function GolfLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-warm-900 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
