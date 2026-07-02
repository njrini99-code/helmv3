'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, GraduationCap, Users } from 'lucide-react';
import { completeBaseballSignup } from '@/app/baseball/actions/onboarding';
import type { CoachType, PlayerType } from '@/lib/types';
import {
  AuthCard,
  AuthPendingDots,
  BaseballAuthShell,
  humanizeAuthError,
} from '@/components/auth/baseball-auth-shell';

type Role = 'coach' | 'player';

const COACH_TYPES: { value: CoachType; label: string }[] = [
  { value: 'college', label: 'College' },
  { value: 'high_school', label: 'High School' },
  { value: 'juco', label: 'JUCO' },
  { value: 'showcase', label: 'Showcase' },
];

const PLAYER_TYPES: { value: PlayerType; label: string }[] = [
  { value: 'high_school', label: 'High School' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'juco', label: 'JUCO' },
  { value: 'college', label: 'College' },
];

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
        setError(humanizeAuthError(result.error || 'Something went wrong. Please try again.'));
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

  const canSubmit = !!role && (role === 'coach' ? !!coachType : !!playerType) && !loading;

  if (checking) {
    return (
      <div className="baseball-auth-field flex min-h-[100dvh] items-center justify-center p-4">
        <AuthPendingDots label="Verifying your account" />
      </div>
    );
  }

  return (
    <BaseballAuthShell
      skipTargetId="complete-signup-form"
      skipLabel="Skip to setup form"
      eyebrow="ONE STEP LEFT"
      tagline="Just one more step to complete your account."
    >
      <AuthCard ariaLabel="Complete your account setup">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-grade-plus/10">
            <svg className="h-7 w-7 text-grade-plus" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">
            Email verified!
          </h2>
        </div>

        <div className="space-y-6">
          {/* Role Selection */}
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-warm-700">I am a...</legend>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                type="button"
                onClick={() => { setRole('coach'); setPlayerType(null); }}
                aria-pressed={role === 'coach'}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 p-4 text-left',
                  role === 'coach' ? 'border-grade-plus bg-grade-plus/10' : 'border-warm-200 bg-cream-50 hover:border-warm-300'
                )}
              >
                <Users className="h-5 w-5 text-grade-plus" aria-hidden />
                <span className="font-medium text-text-primary">Coach</span>
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => { setRole('player'); setCoachType(null); }}
                aria-pressed={role === 'player'}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 p-4 text-left',
                  role === 'player' ? 'border-grade-plus bg-grade-plus/10' : 'border-warm-200 bg-cream-50 hover:border-warm-300'
                )}
              >
                <GraduationCap className="h-5 w-5 text-grade-plus" aria-hidden />
                <span className="font-medium text-text-primary">Player</span>
              </Button>
            </div>
          </fieldset>

          {/* Type Selection */}
          {role && (
            <fieldset className="animate-fade-in">
              <legend className="mb-3 text-sm font-medium text-warm-700">
                {role === 'coach' ? 'Program Type' : 'Player Type'}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(role === 'coach' ? COACH_TYPES : PLAYER_TYPES).map((type) => {
                  const selected = role === 'coach' ? coachType === type.value : playerType === type.value;
                  return (
                    <Button
                      variant="outline"
                      type="button"
                      key={type.value}
                      onClick={() => (role === 'coach' ? setCoachType(type.value as CoachType) : setPlayerType(type.value as PlayerType))}
                      aria-pressed={selected}
                      className={cn(
                        'rounded-xl border-2 p-3 text-sm font-medium',
                        selected
                          ? 'border-grade-plus bg-grade-plus/10 text-primary-700'
                          : 'border-warm-200 bg-cream-50 text-warm-700 hover:border-warm-300'
                      )}
                    >
                      {type.label}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {error && (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={loading}
            className="w-full py-3 text-sm font-semibold"
          >
            {loading ? 'Setting up…' : 'Complete Setup'}
          </Button>
        </div>
      </AuthCard>
    </BaseballAuthShell>
  );
}
