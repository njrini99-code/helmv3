'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { GolfSignUpForm } from '@/components/auth/golf-sign-up-form';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Component to render sign-in link with returnTo param preserved
function SignInLink() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const loginHref = returnTo ? `/golf/login?returnTo=${encodeURIComponent(returnTo)}` : '/golf/login';

  return (
    <Link
      href={loginHref}
      className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
    >
      Sign in
    </Link>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 bg-auth-golf">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#signup-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to signup form
      </a>

      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <motion.div
          className="auth-orb auth-orb-1 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] -top-20 -right-20 sm:-top-32 sm:-right-32 bg-gradient-to-br from-emerald-400/40 to-green-500/30"
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
          className="auth-orb auth-orb-2 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] -bottom-16 -left-16 sm:-bottom-24 sm:-left-24 bg-gradient-to-tr from-teal-400/30 to-emerald-400/25"
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
        {/* Small accent orb - top left (hidden on very small screens) */}
        <motion.div
          className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-green-300/25 to-emerald-400/20"
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
          className="absolute w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-emerald-500/40 top-[30%] right-[15%] sm:right-[20%]"
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
          backgroundSize: '40px 40px sm:60px sm:60px'
        }}
      />

      {/* Glass card */}
      <div id="signup-form" className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
          {/* Logo with glow effect */}
          <motion.div
            className="flex flex-col items-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl scale-150" />
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
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
              Create your account
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">Start tracking your golf journey</p>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
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
                <div className="h-12 bg-emerald-200 rounded-xl" />
              </div>
            }>
              <GolfSignUpForm />
            </Suspense>
          </motion.div>
        </motion.div>

        {/* Footer links with stagger animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
            Already have an account?{' '}
            <Suspense fallback={<Link href="/golf/login" className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">Sign in</Link>}>
              <SignInLink />
            </Suspense>
          </p>

          <p className="text-center mt-3 sm:mt-4 text-warm-500 text-sm">
            <Link href="/" className="hover:text-warm-700 transition-colors">
              ← Back to HelmLabs
            </Link>
          </p>

          <p className="text-center mt-2 sm:mt-3 text-warm-400 text-xs">
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
