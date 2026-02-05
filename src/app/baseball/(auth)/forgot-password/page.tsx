'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/baseball/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

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
        backgroundColor: '#0F172A',
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

      {/* Decorative elements */}
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
              {success ? 'Check your email' : 'Reset your password'}
            </h2>
            <p className="text-warm-500">
              {success
                ? `We've sent a reset link to ${email}`
                : 'Enter your email to receive a reset link'}
            </p>
          </div>

          {/* Content */}
          {success ? (
            <div className="space-y-5">
              <p className="text-sm text-warm-600 text-center">
                Click the link in the email to reset your password. The link will expire in 1
                hour.
              </p>
              <Link href="/baseball/login">
                <button
                  className="
                    w-full py-3
                    bg-white text-warm-700
                    font-medium text-sm
                    rounded-[10px]
                    border border-warm-200
                    transition-all duration-200
                    hover:bg-warm-50 hover:border-warm-300
                    active:scale-[0.98]
                  "
                >
                  Back to Sign In
                </button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-[10px]">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-warm-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="
                    w-full px-4 py-3
                    bg-white
                    border border-warm-200
                    rounded-[10px]
                    text-warm-900 text-base lg:text-sm
                    placeholder:text-warm-400
                    transition-all duration-200
                    focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
                  "
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="
                  w-full py-3
                  bg-primary-600 text-white
                  font-medium text-sm
                  rounded-[10px]
                  shadow-sm
                  transition-all duration-200
                  hover:bg-primary-700 hover:shadow-md
                  active:scale-[0.98]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center
                "
              >
                {loading ? (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  'Send reset link'
                )}
              </button>

              <p className="text-center text-sm text-warm-600 pt-2">
                Remember your password?{' '}
                <Link href="/baseball/login" className="text-primary-600 font-medium hover:text-primary-700">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </motion.div>

        {/* Back to home */}
        <p className="text-center mt-6 text-white/60 text-sm">
          <Link href="/" className="hover:text-white/90 transition-colors">
            ← Back to HelmLabs
          </Link>
        </p>
      </div>
    </div>
  );
}
