'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LiftingForgotPasswordPage() {
  const prefersReducedMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/lifting/reset-password`,
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
      className="min-h-dvh flex items-center justify-center relative p-4"
      style={{ background: 'linear-gradient(135deg, #FFFEFA 0%, #f0fdf4 50%, #dcfce7 100%)' }}
    >
      <a
        href="#forgot-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to form
      </a>

      {/* Animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] -top-32 -right-32 rounded-full bg-gradient-to-br from-primary-400/30 to-primary-600/20 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] -bottom-24 -left-24 rounded-full bg-gradient-to-tr from-primary-400/25 to-primary-400/20 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 0.95, 1] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(22, 163, 74, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(22, 163, 74, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div id="forgot-form" className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass-standard rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
        >
          {/* Logo */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, duration: 0.5 }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-xl scale-150" />
              <div className="relative w-14 h-14 flex items-center justify-center mb-4 bg-primary-50 rounded-2xl border border-primary-100">
                <Image src="/helm-lifting-logo.png" alt="Helm Lifting Lab" width={56} height={56} className="object-contain" priority />
              </div>
            </div>
            <h1 className="text-xl font-bold text-warm-900">Helm Lifting Lab</h1>
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-warm-900 mb-2">
              {success ? 'Check your email' : 'Reset your password'}
            </h2>
            <p className="text-warm-500 text-sm">
              {success
                ? `We've sent a reset link to ${email}`
                : 'Enter your email to receive a reset link'}
            </p>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4, duration: 0.5 }}
          >
            {success ? (
              <div className="space-y-5">
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
                    <Mail className="w-8 h-8 text-primary-600" />
                  </div>
                </div>
                <div className="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-primary-700">
                      <p>Click the link in the email to reset your password.</p>
                      <p className="mt-1 text-primary-600">The link will expire in 1 hour.</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-warm-500 text-center">
                  Didn&apos;t receive the email? Check your spam folder or try again.
                </p>
                <Button
                  asChild
                  variant="ghost"
                  className="w-full py-3 bg-cream-50 text-warm-700 font-medium text-sm rounded-xl border border-warm-200 hover:bg-warm-50 active:bg-warm-100 hover:border-warm-300 active:scale-[0.98] transition-all"
                >
                  <Link href="/lifting/login">Back to Sign In</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {error && (
                  <div
                    className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="forgot-email" className="text-sm font-medium text-warm-700">Email</label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 bg-cream-50 border border-warm-200 rounded-xl text-warm-900 text-base lg:text-sm placeholder:text-warm-400 transition-all focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10"
                  />
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary-600 text-white font-medium text-sm rounded-xl shadow-sm hover:bg-primary-700 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                >
                  {loading ? (
                    <div className="flex items-center gap-1" role="status" aria-label="Sending reset link">
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="sr-only">Sending reset link...</span>
                    </div>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>
            )}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.6, duration: 0.5 }}
        >
          {!success && (
            <p className="text-center mt-6 text-warm-600 text-sm">
              Remember your password?{' '}
              <Link href="/lifting/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                Sign in
              </Link>
            </p>
          )}

          <p className="text-center mt-4 text-warm-500 text-sm">
            <Link href="/" className="hover:text-warm-700 transition-colors">
              ← Back to HelmLabs
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
