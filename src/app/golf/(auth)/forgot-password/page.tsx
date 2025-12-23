'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/golf/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/helm-golf-logo.png"
              alt="GolfHelm"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
            <p className="text-slate-500 mt-1">We sent you a password reset link</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-6">
              We've sent a password reset link to <strong>{email}</strong>. Click the link in the email to reset your password.
            </div>
            <p className="text-sm text-slate-500 text-center mb-4">
              Didn't receive the email? Check your spam folder.
            </p>
            <Link href="/golf/login">
              <Button className="w-full">Back to Login</Button>
            </Link>
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

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Forgot password?</h1>
          <p className="text-slate-500 mt-1">Enter your email to reset your password</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
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
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-6">
            Remember your password?{' '}
            <Link href="/golf/login" className="text-green-600 font-medium hover:underline">
              Sign in
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
