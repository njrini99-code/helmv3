'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { BaseballSignInForm } from '@/components/auth/baseball-sign-in-form';

function LoginContent() {
  const searchParams = useSearchParams();
  const successMessage = searchParams.get('message');

  return (
    <div
      className="
        min-h-screen
        flex items-center justify-center
        bg-cover bg-center bg-no-repeat
        relative
        p-4
      "
      style={{
        backgroundImage: "url('/images/auth-bg-baseball.jpg')",
        backgroundColor: '#0F172A', // Fallback while image loads
      }}
    >
      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'conic-gradient(from 0deg at 50% 50%, rgba(22, 162, 108, 1) 8%, rgba(235, 220, 178, 1) 100%)',
          border: '1px solid rgba(0, 0, 0, 1)',
          boxShadow: 'inset 0px 4px 12px 0px rgba(0, 0, 0, 0.15)',
        }}
      />

      {/* Decorative elements - subtle */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-600/5 rounded-full blur-3xl" />
      </div>

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="
            bg-white/85
            backdrop-blur-xl
            border border-white/40
            rounded-[24px]
            p-10
            shadow-2xl
          "
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-[12px] bg-primary-600 flex items-center justify-center mb-4 overflow-hidden">
              <img
                src="/helm-baseball-logo.png"
                alt="BaseballHelm"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-bold text-warm-900">BaseballHelm</h1>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-warm-900 mb-2">
              Welcome back
            </h2>
            <p className="text-warm-500">Sign in to continue to your dashboard</p>
          </div>

          {/* Success message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-[10px] text-sm mb-6"
            >
              {successMessage}
            </motion.div>
          )}

          {/* Form */}
          <BaseballSignInForm />
        </motion.div>

        {/* Footer link outside card */}
        <p className="text-center mt-6 text-white/80 text-sm">
          Don't have an account?{' '}
          <Link
            href="/baseball/signup"
            className="text-white font-medium hover:underline transition-all"
          >
            Sign up
          </Link>
        </p>

        {/* Back to home */}
        <p className="text-center mt-4 text-white/60 text-sm">
          <Link href="/" className="hover:text-white/90 transition-colors">
            ← Back to HelmLabs
          </Link>
        </p>

        <p className="text-center mt-3 text-white/50 text-xs">
          <Link href="/privacy" className="hover:text-white/80 transition-colors">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-white/80 transition-colors">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
