'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function GolfLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Redirect to golf dashboard for all users
      router.push('/golf/dashboard');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome to GolfHelm</h1>
          <p className="text-slate-500 mt-1">Sign in to your account</p>
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
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
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
