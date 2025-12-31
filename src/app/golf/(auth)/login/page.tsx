'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShineEffect } from '@/components/ui/shine-effect';
import { loginAction } from '@/app/golf/actions/auth';

function GolfLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const successMessage = searchParams.get('message');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await loginAction(email, password);

      if (!result.success) {
        setError(result.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Redirect to appropriate page
      router.push(result.redirectTo || '/golf/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Unexpected error during sign in:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Atmospheric gradient orbs */}
      <div className="absolute top-1/4 -right-32 w-96 h-96 bg-green-300/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-green-300/15 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome to GolfHelm</h1>
          <p className="text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <div className="relative glass-standard rounded-2xl p-8 shadow-lg overflow-hidden">
          <ShineEffect />
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            <div>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <div className="text-right mt-2">
                <Link href="/golf/forgot-password" className="text-sm text-green-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm"
              >
                {successMessage}
              </motion.div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm animate-shake">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link href="/golf/signup" className="text-green-600 font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>

        <p className="text-center text-sm text-slate-400 mt-6">
          <Link href="/" className="hover:text-slate-600 transition-colors">
            ← Back to HelmLabs
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function GolfLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
      </div>
    }>
      <GolfLoginForm />
    </Suspense>
  );
}
