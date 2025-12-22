'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers } from '@/components/icons';

export default function GolfSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      // Step 2: Create user record for golf coach
      const { error: userError } = await supabase.from('users').insert({
        id: authData.user.id,
        email,
        role: 'coach',
      });

      if (userError) {
        console.error('User insert error:', userError);
        setError(`Failed to create user profile: ${userError.message}`);
        setLoading(false);
        return;
      }

      // Step 3: Create golf coach record
      // Note: golf_coaches table - using type assertion until schema is updated
      const { error: coachError } = await supabase.from('golf_coaches').insert({
        user_id: authData.user.id,
        full_name: fullName,
        onboarding_completed: false,
      });

      if (coachError) {
        console.error('Golf coach insert error:', coachError);
        setError(`Failed to create coach profile: ${coachError.message}`);
        setLoading(false);
        return;
      }

      // Success - redirect to golf coach onboarding
      router.push('/golf/coach');
      router.refresh();
    } catch (err) {
      console.error('Signup error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Join GolfHelm</h1>
          <p className="text-slate-500 mt-1">Create your coaching account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          {/* Coach Badge */}
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100 mb-6">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <IconUsers size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Golf Coach Account</p>
              <p className="text-xs text-slate-500">Manage your team and players</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Smith"
              required
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              hint="Minimum 6 characters"
            />
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/golf/login" className="text-green-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <div className="text-center mt-6 space-y-2">
          <p className="text-sm leading-relaxed text-slate-500">
            Are you a player?{' '}
            <span className="text-slate-600">Ask your coach for an invite link.</span>
          </p>
          <p className="text-sm leading-relaxed text-slate-400">
            <Link href="/" className="hover:text-slate-600 transition-colors">
              ← Back to HelmLabs
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
