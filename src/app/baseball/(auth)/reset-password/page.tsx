'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
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
    // Check if user has a valid session (from email link)
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
  }, [supabase]); // supabase is stable via useRef — no re-fire risk

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
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      // Password updated successfully - redirect to login
      router.push('/baseball/login?message=Password updated successfully');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center relative p-4 bg-auth-baseball">
      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large primary orb - top right */}
        <motion.div
          className="auth-orb auth-orb-1 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] -top-20 -right-20 sm:-top-32 sm:-right-32 bg-gradient-to-br from-amber-400/40 to-orange-400/30"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            scale: [1, 1.05, 1],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          })}
        />
        {/* Medium orb - bottom left */}
        <motion.div
          className="auth-orb auth-orb-2 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] -bottom-16 -left-16 sm:-bottom-24 sm:-left-24 bg-gradient-to-tr from-yellow-400/30 to-amber-400/25"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
            scale: [1, 0.95, 1],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          })}
        />
        {/* Small accent orb - top left */}
        <motion.div
          className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-20 left-[10%] bg-gradient-to-br from-orange-300/25 to-amber-400/20"
          animate={{
            x: [0, 20, 0],
            y: [0, -15, 0],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          })}
        />
        {/* Tiny floating dot */}
        <motion.div
          className="absolute w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-amber-500/40 top-[30%] right-[15%] sm:right-[20%]"
          animate={{
            y: [0, -10, 0],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          })}
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
      <div className="relative z-10 w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, ease: [0.16, 1, 0.3, 1] })}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
          {/* Logo with glow effect */}
          <motion.div
            className="flex flex-col items-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.2, duration: 0.5 })}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-amber-500/30 rounded-full blur-xl scale-150" />
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 sm:mb-4">
                <Image
                  src="/helm-baseball-logo.png"
                  alt="BaseballHelm Logo"
                  width={56}
                  height={56}
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-warm-900 to-warm-700 bg-clip-text text-transparent">
              BaseballHelm
            </h1>
          </motion.div>

          {/* Header */}
          <motion.div
            className="text-center mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3, duration: 0.5 })}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-warm-900 mb-1 sm:mb-2">
              Set new password
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">Enter your new password below</p>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, duration: 0.5 })}
          >
            {sessionValid === null ? (
              // Loading state while checking session
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-amber-600 border-t-transparent rounded-full" />
              </div>
            ) : sessionValid === false ? (
              // Invalid session state
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5" role="alert">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{error}</p>
                    <Link
                      href="/baseball/forgot-password"
                      className="block mt-2 text-primary-600 font-medium hover:text-primary-700 underline underline-offset-2"
                    >
                      Request a new reset link
                    </Link>
                  </div>
                </div>
                <Link href="/baseball/login">
                  <Button variant="ghost" className="w-full py-2.5 sm:py-3 bg-white text-warm-700 font-medium text-sm rounded-xl border border-warm-200 transition-all duration-200 hover:bg-warm-50 active:bg-warm-100 hover:border-warm-300 active:scale-[0.98]">
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              // Valid session - show form
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
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
                  <input
                    id="reset-new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your new password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="
                      w-full px-4 py-2.5 sm:py-3
                      bg-white
                      border border-warm-200
                      rounded-xl
                      text-warm-900 text-base lg:text-sm
                      placeholder:text-warm-400
                      transition-all duration-200
                      focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
                    "
                  />
                  <PasswordStrengthIndicator password={password} />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-confirm-password" className="text-sm font-medium text-warm-700">Confirm Password</label>
                  <input
                    id="reset-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    required
                    autoComplete="new-password"
                    className={`
                      w-full px-4 py-2.5 sm:py-3
                      bg-white
                      border rounded-xl
                      text-warm-900 text-base lg:text-sm
                      placeholder:text-warm-400
                      transition-all duration-200
                      focus:outline-none focus:ring-[3px]
                      ${confirmPassword && confirmPassword !== password
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                        : confirmPassword && confirmPassword === password
                        ? 'border-primary-300 focus:border-primary-500 focus:ring-primary-500/10'
                        : 'border-warm-200 focus:border-primary-600 focus:ring-primary-600/10'
                      }
                    `}
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

                <Button variant="primary"
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className="
                    w-full py-2.5 sm:py-3
                    bg-primary-600 text-white
                    font-medium text-sm
                    rounded-xl
                    shadow-sm
                    transition-all duration-200
                    hover:bg-primary-700 hover:shadow-md
                    active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center
                  "
                >
                  {loading ? (
                    <div className="flex items-center gap-1" role="status" aria-label="Updating password">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6, duration: 0.5 })}
        >
          <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
            Remember your password?{' '}
            <Link href="/baseball/login" className="text-amber-600 font-semibold hover:text-amber-700 transition-colors">
              Sign in
            </Link>
          </p>

          <p className="text-center mt-3 sm:mt-4 text-warm-500 text-sm">
            <Link href="/" className="hover:text-warm-700 transition-colors">
              &#8592; Back to HelmLabs
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
