'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser } from '@/components/icons';
import type { CoachType, PlayerType } from '@/lib/types';

type Role = 'coach' | 'player';
type Step = 'role' | 'type' | 'details';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [coachType, setCoachType] = useState<CoachType | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || (role === 'coach' && !coachType) || (role === 'player' && !playerType)) return;

    setLoading(true);
    setError('');

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

      console.log('SignUp Response:', { authData, authError });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        console.error('No user in auth response');
        setError('Failed to create account. No user returned.');
        setLoading(false);
        return;
      }

      // Step 2: Upsert user record with role (handles race condition with trigger)
      // The trigger creates the users record, but we use upsert to be safe
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
        setError(`Failed to set user role: ${userError.message}`);
        setLoading(false);
        return;
      }

      // Step 3: Create role-specific record
      if (role === 'coach') {
        const { error: coachError } = await supabase.from('coaches').insert({
          user_id: authData.user.id,
          coach_type: coachType!,
          full_name: fullName,
          onboarding_completed: false
        });

        if (coachError) {
          setError(`Failed to create coach profile: ${coachError.message}`);
          setLoading(false);
          return;
        }
      } else {
        const [firstName, ...lastParts] = fullName.split(' ');
        const { error: playerError } = await supabase.from('players').insert({
          user_id: authData.user.id,
          player_type: playerType!,
          first_name: firstName,
          last_name: lastParts.join(' ') || '',
          recruiting_activated: playerType !== 'college', // College players don't get recruiting
          onboarding_completed: false,
          profile_completion_percent: 0
        });

        if (playerError) {
          setError(`Failed to create player profile: ${playerError.message}`);
          setLoading(false);
          return;
        }
      }

      // Success - redirect to onboarding
      const onboardingPath = role === 'coach' ? '/baseball/coach' : '/baseball/player';
      router.push(onboardingPath);
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (step === 'role') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/helm-baseball-logo.png"
              alt="BaseballHelm"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Join BaseballHelm</h1>
            <p className="text-slate-500 mt-1">Select your role to get started</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { setRole('coach'); setStep('type'); }}
              className="w-full p-6 bg-white rounded-2xl border-2 border-slate-200 text-left transition-all hover:border-green-500 hover:shadow-md flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <IconUsers size={24} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Coach</p>
                <p className="text-sm leading-relaxed text-slate-500 mt-1">Discover and recruit athletes for your program</p>
              </div>
            </button>

            <button
              onClick={() => { setRole('player'); setStep('type'); }}
              className="w-full p-6 bg-white rounded-2xl border-2 border-slate-200 text-left transition-all hover:border-green-500 hover:shadow-md flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <IconUser size={24} className="text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Player</p>
                <p className="text-sm leading-relaxed text-slate-500 mt-1">Showcase your skills and connect with colleges</p>
              </div>
            </button>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account? <Link href="/baseball/login" className="text-green-600 font-medium hover:underline">Sign in</Link>
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

  // Step 2: Type Selection
  if (step === 'type') {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/helm-baseball-logo.png"
              alt="BaseballHelm"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {role === 'coach' ? 'Select Program Type' : 'Select Player Type'}
            </h1>
            <p className="text-slate-500 mt-1 capitalize">
              Signing up as a {role}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            {role === 'coach' ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'college', label: 'College', desc: 'Recruit players' },
                  { value: 'high_school', label: 'High School', desc: 'Manage team' },
                  { value: 'juco', label: 'JUCO', desc: 'Recruit & manage' },
                  { value: 'showcase', label: 'Showcase', desc: 'Multi-team org' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setCoachType(type.value as CoachType)}
                    className={cn(
                      'p-4 border-2 rounded-xl text-left transition-all',
                      coachType === type.value
                        ? 'border-green-500 bg-green-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <p className="font-medium text-slate-900 text-sm">{type.label}</p>
                    <p className="text-xs text-slate-500 mt-1">{type.desc}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'high_school', label: 'High School', desc: 'HS team player' },
                  { value: 'showcase', label: 'Showcase', desc: 'Travel ball' },
                  { value: 'juco', label: 'JUCO', desc: 'Transfer track' },
                  { value: 'college', label: 'College', desc: 'Current player' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setPlayerType(type.value as PlayerType)}
                    className={cn(
                      'p-4 border-2 rounded-xl text-left transition-all',
                      playerType === type.value
                        ? 'border-green-500 bg-green-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                  >
                    <p className="font-medium text-slate-900 text-sm">{type.label}</p>
                    <p className="text-xs text-slate-500 mt-1">{type.desc}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <Button
                variant="secondary"
                onClick={() => setStep('role')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep('details')}
                disabled={role === 'coach' ? !coachType : !playerType}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Account Details
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/helm-baseball-logo.png"
            alt="BaseballHelm"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
          <p className="text-slate-500 mt-1">
            <span className="capitalize">{role}</span>
            {' • '}
            <span className="font-medium text-green-600">
              {role === 'coach'
                ? coachType?.replace('_', ' ')
                : playerType?.replace('_', ' ')
              }
            </span>
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
            onClick={() => setStep('type')}
            className="w-full text-center text-sm text-slate-500 mt-4 hover:text-slate-700 transition-colors"
          >
            ← Change type
          </button>
        </div>
      </div>
    </div>
  );
}
