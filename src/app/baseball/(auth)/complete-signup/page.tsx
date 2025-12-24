'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser } from '@/components/icons';
import type { CoachType, PlayerType } from '@/lib/types';

type Role = 'coach' | 'player';

// Force dynamic rendering to avoid prerender errors
export const dynamic = 'force-dynamic';

export default function CompleteSignupPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [coachType, setCoachType] = useState<CoachType | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  // Check if user is logged in and doesn't have a profile
  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/baseball/login');
        return;
      }

      // Check if profile already exists
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (coach) {
        router.push('/baseball/coach');
        return;
      }

      const { data: player } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (player) {
        router.push('/baseball/player');
        return;
      }

      // User has no profile - show role selection
      setChecking(false);
    }

    checkUser();
  }, [supabase, router]);

  const handleSubmit = async () => {
    if (!role || (role === 'coach' && !coachType) || (role === 'player' && !playerType)) {
      setError('Please select all options');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/baseball/login');
        return;
      }

      // Update users table with role
      const userEmail = user.email;
      if (!userEmail) {
        setError('Email is required');
        setLoading(false);
        return;
      }

      await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: userEmail,
          role,
        }, { onConflict: 'id' });

      // Create profile
      if (role === 'coach') {
        const { error: coachError } = await supabase.from('coaches').insert({
          user_id: user.id,
          coach_type: coachType!,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Coach',
          onboarding_completed: false
        });

        if (coachError) {
          setError(`Failed to create profile: ${coachError.message}`);
          setLoading(false);
          return;
        }

        router.push('/baseball/coach');
      } else {
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Player';
        const [firstName, ...lastParts] = fullName.split(' ');
        
        const { error: playerError } = await supabase.from('players').insert({
          user_id: user.id,
          player_type: playerType!,
          first_name: firstName,
          last_name: lastParts.join(' ') || '',
          recruiting_activated: playerType !== 'college',
          onboarding_completed: false,
          profile_completion_percent: 0
        });

        if (playerError) {
          setError(`Failed to create profile: ${playerError.message}`);
          setLoading(false);
          return;
        }

        router.push('/baseball/player');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Email Verified!</h1>
          <p className="text-slate-500 mt-1">Just one more step to complete your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          {/* Role Selection */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-3 block">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setRole('coach'); setPlayerType(null); }}
                className={cn(
                  'p-4 border-2 rounded-xl text-left transition-all flex items-center gap-3',
                  role === 'coach'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <IconUsers size={20} className="text-green-600" />
                <span className="font-medium">Coach</span>
              </button>
              <button
                onClick={() => { setRole('player'); setCoachType(null); }}
                className={cn(
                  'p-4 border-2 rounded-xl text-left transition-all flex items-center gap-3',
                  role === 'player'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <IconUser size={20} className="text-green-600" />
                <span className="font-medium">Player</span>
              </button>
            </div>
          </div>

          {/* Type Selection */}
          {role && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-3 block">
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
                      <button
                        key={type.value}
                        onClick={() => setCoachType(type.value as CoachType)}
                        className={cn(
                          'p-3 border-2 rounded-xl text-sm font-medium transition-all',
                          coachType === type.value
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {type.label}
                      </button>
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
                      <button
                        key={type.value}
                        onClick={() => setPlayerType(type.value as PlayerType)}
                        className={cn(
                          'p-3 border-2 rounded-xl text-sm font-medium transition-all',
                          playerType === type.value
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {type.label}
                      </button>
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
            loading={loading}
            className="w-full"
          >
            Complete Setup
          </Button>
        </div>
      </div>
    </div>
  );
}
