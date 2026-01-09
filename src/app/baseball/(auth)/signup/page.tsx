'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BaseballSignUpForm } from '@/components/auth/baseball-sign-up-form';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function SignupPage() {
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
        className="
          absolute inset-0
          bg-gradient-to-br
          from-warm-900/90
          via-warm-900/85
          to-primary-900/80
        "
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
              Create your account
            </h2>
            <p className="text-warm-500">Start building your championship roster</p>
          </div>

          {/* Form */}
          <BaseballSignUpForm />
        </motion.div>

        {/* Footer link outside card */}
        <p className="text-center mt-6 text-white/80 text-sm">
          Already have an account?{' '}
          <Link
            href="/baseball/login"
            className="text-white font-medium hover:underline transition-all"
          >
            Sign in
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
