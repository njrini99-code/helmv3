'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { isNativeApp } from '@/lib/utils/capacitor';

export default function ResetPasswordPage() {
  const isNative = isNativeApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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

      router.push('/golf/login?message=password_reset');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-dvh flex items-center justify-center relative p-4 sm:p-6 bg-auth-golf">
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
        {/* Small accent orb - top left (hidden on very small screens) */}
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
      <div className="relative z-10 w-full max-w-[420px]">
        <m.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="auth-glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        >
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
              Reset your password
            </h2>
            <p className="text-warm-500 text-sm sm:text-base">
              Enter your new password below
            </p>
          </m.div>

          {/* Form */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
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
                <label htmlFor="golf-reset-password" className="text-sm font-medium text-warm-700">New Password</label>
                <input
                  id="golf-reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="
                    w-full px-4 py-2.5 sm:py-3
                    bg-white
                    border border-warm-200
                    rounded-xl
                    text-warm-900 text-base lg:text-sm
                    placeholder:text-warm-400
                    transition-all duration-200
                    focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/10
                  "
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="golf-reset-confirm" className="text-sm font-medium text-warm-700">Confirm Password</label>
                <input
                  id="golf-reset-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
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
                      : 'border-warm-200 focus:border-primary-500 focus:ring-primary-500/10'
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

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="
                  w-full py-2.5 sm:py-3
                  bg-primary-600 text-white
                  font-semibold text-sm
                  rounded-xl
                  shadow-lg shadow-primary-600/25
                  transition-all duration-200
                  hover:bg-primary-700 hover:shadow-primary-600/30
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
              </button>
            </form>
          </m.div>
        </m.div>

        {/* Footer links */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <p className="text-center mt-5 sm:mt-6 text-warm-600 text-sm">
            Remember your password?{' '}
            <Link href="/golf/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
              Sign in
            </Link>
          </p>

          {!isNative && (
            <p className="text-center mt-3 sm:mt-4 text-warm-500 text-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-warm-700 transition-colors px-3 py-3 -my-3 min-h-[44px] rounded-lg active:bg-warm-100/50"
              >
                ← Back to HelmLabs
              </Link>
            </p>
          )}
        </m.div>
      </div>
    </div>
    </LazyMotion>
  );
}
