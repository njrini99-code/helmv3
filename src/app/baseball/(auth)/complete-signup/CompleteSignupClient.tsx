'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser } from '@/components/icons';
import { completeBaseballSignup } from '@/app/baseball/actions/onboarding';
import type { CoachType, PlayerType } from '@/lib/types';

type Role = 'coach' | 'player';

export default function CompleteSignupClient() {
  const [role, setRole] = useState<Role | null>(null);
  const [coachType, setCoachType] = useState<CoachType | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  // Check if user is logged in and doesn't have a profile
  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = supabaseRef.current;
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/baseball/login');
          return;
        }

        // Check if profile already exists (parallel queries)
        const [coachResult, playerResult] = await Promise.all([
          supabase.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
          supabase.from('baseball_players').select('id').eq('user_id', user.id).maybeSingle(),
        ]);

        if (coachResult.data) {
          router.push('/baseball/coach');
          return;
        }
        if (playerResult.data) {
          router.push('/baseball/player');
          return;
        }

        // User has no profile - show role selection
        setChecking(false);
      } catch {
        // Show the form anyway - user can try to proceed
        setChecking(false);
      }
    }

    checkUser();
  }, [router]);

  const handleSubmit = async () => {
    if (!role || (role === 'coach' && !coachType) || (role === 'player' && !playerType)) {
      setError('Please select all options');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await completeBaseballSignup({
        role,
        coachType: role === 'coach' ? coachType! : undefined,
        playerType: role === 'player' ? playerType! : undefined,
      });

      if (!result.success) {
        setError(result.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="min-h-dvh bg-[#FAF6F1] flex items-center justify-center p-4" aria-busy="true">
        <h1 className="sr-only">Complete your BaseballHelm account</h1>
        <div className="w-full max-w-md space-y-4 animate-pulse">
          <div className="h-16 w-16 rounded-full bg-warm-200 mx-auto" />
          <div className="h-6 w-48 rounded bg-warm-200 mx-auto" />
          <div className="h-4 w-64 rounded bg-warm-100 mx-auto" />
          <div className="bg-white rounded-2xl border border-warm-200 p-6 space-y-4">
            <div className="h-4 w-24 rounded bg-warm-200" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-14 rounded-xl bg-warm-100" />
              <div className="h-14 rounded-xl bg-warm-100" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-warm-900">Email Verified!</h1>
          <p className="text-warm-500 mt-1">Just one more step to complete your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm space-y-6">
          {/* Role Selection */}
          <div>
            <p className="text-sm font-medium text-warm-700 mb-3 block">I am a...</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="primary"
                onClick={() => { setRole('coach'); setPlayerType(null); }}
                className={cn(
                  'p-4 border-2 rounded-xl text-left transition-all flex items-center gap-3',
                  role === 'coach'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-warm-200 hover:border-warm-300'
                )}
              >
                <IconUsers size={20} className="text-primary-600" />
                <span className="font-medium">Coach</span>
              </Button>
              <Button variant="primary"
                onClick={() => { setRole('player'); setCoachType(null); }}
                className={cn(
                  'p-4 border-2 rounded-xl text-left transition-all flex items-center gap-3',
                  role === 'player'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-warm-200 hover:border-warm-300'
                )}
              >
                <IconUser size={20} className="text-primary-600" />
                <span className="font-medium">Player</span>
              </Button>
            </div>
          </div>

          {/* Type Selection */}
          {role && (
            <div>
              <label className="text-sm font-medium text-warm-700 mb-3 block">
                {role === 'coach' ? 'Program Type' : 'Player Type'}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {role === 'coach' ? (
                  <>
                    {[
                      { value: 'college', label: 'College' },
                      { value: 'high_school', label: 'High School' },
                      { value: 'juco', label: 'JUCO' },
                      { value: 'showcase', label: 'Showcase' },
                    ].map((type) => (
                      <Button variant="primary"
                        key={type.value}
                        onClick={() => setCoachType(type.value as CoachType)}
                        className={cn(
                          'p-3 border-2 rounded-xl text-sm font-medium transition-all',
                          coachType === type.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-warm-200 hover:border-warm-300'
                        )}
                      >
                        {type.label}
                      </Button>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { value: 'high_school', label: 'High School' },
                      { value: 'showcase', label: 'Showcase' },
                      { value: 'juco', label: 'JUCO' },
                      { value: 'college', label: 'College' },
                    ].map((type) => (
                      <Button variant="primary"
                        key={type.value}
                        onClick={() => setPlayerType(type.value as PlayerType)}
                        className={cn(
                          'p-3 border-2 rounded-xl text-sm font-medium transition-all',
                          playerType === type.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-warm-200 hover:border-warm-300'
                        )}
                      >
                        {type.label}
                      </Button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!role || (role === 'coach' ? !coachType : !playerType) || loading}
            isLoading={loading}
            className="w-full"
          >
            Complete Setup
          </Button>
        </div>
      </div>
    </main>
  );
}
