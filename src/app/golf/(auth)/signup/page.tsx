'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser } from '@/components/icons';

type Role = 'coach' | 'player';
type Step = 'role' | 'details';

export default function GolfSignupPage() {
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;

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

      // Step 2: Upsert user record with role (handles race condition with trigger)
      const userEmail = authData.user.email || email;
      if (!userEmail) {
        setError('Email is required');
        setLoading(false);
        return;
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: userEmail,
            role,
          },
          {
            onConflict: 'id',
          }
        );

      if (userError) {
        console.error('User upsert error:', userError);
        setError(`Failed to set user role: ${userError.message}`);
        setLoading(false);
        return;
      }

      // Step 3: Create role-specific record
      if (role === 'coach') {
        const { error: coachError } = await supabase.from('golf_coaches').insert({
          user_id: authData.session.user.id,
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
      } else {
        // Player
        const [firstName, ...lastParts] = fullName.split(' ');
        const { error: playerError } = await supabase.from('golf_players').insert({
          user_id: authData.session.user.id,
          first_name: firstName,
          last_name: lastParts.join(' ') || '',
          onboarding_completed: false,
        });

        if (playerError) {
          console.error('Golf player insert error:', playerError);
          setError(`Failed to create player profile: ${playerError.message}`);
          setLoading(false);
          return;
        }

        // Success - redirect to golf player onboarding
        router.push('/golf/player');
        router.refresh();
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  // Step 1: Role Selection
  if (step === 'role') {
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
            <p className="text-slate-500 mt-1">Select your role to get started</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { setRole('coach'); setStep('details'); }}
              className="w-full p-6 bg-white rounded-2xl border-2 border-slate-200 text-left transition-all hover:border-green-500 hover:shadow-md flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <IconUsers size={24} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Coach</p>
                <p className="text-sm leading-relaxed text-slate-500 mt-1">Manage your golf team and players</p>
              </div>
            </button>

            <button
              onClick={() => { setRole('player'); setStep('details'); }}
              className="w-full p-6 bg-white rounded-2xl border-2 border-slate-200 text-left transition-all hover:border-green-500 hover:shadow-md flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <IconUser size={24} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Player</p>
                <p className="text-sm leading-relaxed text-slate-500 mt-1">Track your progress and performance</p>
              </div>
            </button>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/golf/login" className="text-green-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>

          <p className="text-center text-sm text-slate-400 mt-4">
            <Link href="/" className="hover:text-slate-600 transition-colors">
              ← Back to HelmLabs
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Account Details
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
          <p className="text-slate-500 mt-1">
            <span className="capitalize">{role}</span> account
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
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

          <button
            onClick={() => setStep('role')}
            className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700 transition-colors"
          >
            ← Change role
          </button>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
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
