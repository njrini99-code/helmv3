'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LiftingResetPasswordPage() {
  const prefersReducedMotion = useReducedMotion();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setError('Unable to verify reset link. Please try again.');
          setSessionValid(false);
          return;
        }
        if (!session) {
          setError('Invalid or expired reset link. Please request a new one.');
          setSessionValid(false);
        } else {
          setSessionValid(true);
        }
      } catch {
        setError('An unexpected error occurred. Please try again.');
        setSessionValid(false);
      }
    }
    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      router.push('/lifting/login?message=password_reset');
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

      <div className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass-standard border border-white/20 rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
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
            <h2 className="text-2xl font-bold text-warm-900 mb-2">Set new password</h2>
            <p className="text-warm-500 text-sm">Enter your new password below</p>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4, duration: 0.5 }}
          >
            {sessionValid === null ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
              </div>
            ) : sessionValid === false ? (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5" role="alert">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{error}</p>
                    <Link
                      href="/lifting/forgot-password"
                      className="block mt-2 text-primary-600 font-medium hover:text-primary-700 underline underline-offset-2"
                    >
                      Request a new reset link
                    </Link>
                  </div>
                </div>
                <Button asChild variant="ghost" className="w-full py-3 bg-cream-50 text-warm-700 font-medium text-sm rounded-xl border border-warm-200 hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all">
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
                  <label htmlFor="reset-new-password" className="text-sm font-medium text-warm-700">New Password</label>
                  <Input
                    id="reset-new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your new password"
                    required
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input on a single-field auth page
                    autoFocus
                    autoComplete="new-password"
                    className="border-warm-200 rounded-xl text-warm-900 text-base lg:text-sm placeholder:text-warm-400 transition-all focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10"
                  />
                  <PasswordStrengthIndicator password={password} />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-confirm-password" className="text-sm font-medium text-warm-700">Confirm Password</label>
                  <Input
                    id="reset-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    required
                    autoComplete="new-password"
                    className={`border rounded-xl text-warm-900 text-base lg:text-sm placeholder:text-warm-400 transition-all focus:outline-none focus:ring-[3px] ${
                      confirmPassword && confirmPassword !== password
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                        : confirmPassword && confirmPassword === password
                        ? 'border-primary-300 focus:border-primary-500 focus:ring-primary-500/10'
                        : 'border-warm-200 focus:border-primary-600 focus:ring-primary-600/10'
                    }`}
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Passwords do not match
                    </p>
                  )}
                  {confirmPassword && confirmPassword === password && password.length >= 8 && (
                    <p className="text-xs text-primary-600 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Passwords match
                    </p>
                  )}
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className="w-full py-3 bg-primary-600 text-white font-medium text-sm rounded-xl shadow-sm hover:bg-primary-700 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                >
                  {loading ? (
                    <div className="flex items-center gap-1" role="status" aria-label="Updating password">
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-cream-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="sr-only">Updating password...</span>
                    </div>
                  ) : (
                    'Update password'
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
          <p className="text-center mt-6 text-warm-600 text-sm">
            Remember your password?{' '}
            <Link href="/lifting/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
              Sign in
            </Link>
          </p>
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
