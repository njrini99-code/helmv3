import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { RecruitingPreferencesClient } from './recruiting-preferences-client';
import type { CoachRecruitingPhilosophy, RecruitingMetricWeights, RecruitingMinimumStandards } from '@/lib/types';
import { DEFAULT_RECRUITING_WEIGHTS } from '@/lib/types';

export const metadata = {
  title: 'Recruiting Preferences | Settings | BaseballHelm',
  description: 'Configure how you want to match with potential recruits',
};

async function getCoachAndPhilosophy() {
  const supabase = await createClient();

  // Single cached auth fetch — coach profile already resolved
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/login');

  // Only college and JUCO coaches can use recruiting
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard/command-center');
  }

  // Get existing philosophy (table added by migration 20260111000002)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: philosophy } = await (supabase as any)
    .from('baseball_coach_recruiting_philosophy')
    .select('*')
    .eq('coach_id', coach.id)
    .single();

  return {
    coach,
    philosophy: philosophy as CoachRecruitingPhilosophy | null,
  };
}

export default async function RecruitingPreferencesPage() {
  const { coach, philosophy } = await getCoachAndPhilosophy();

  // Build initial values with defaults
  const initialWeights: RecruitingMetricWeights = {
    exit_velocity: philosophy?.weight_exit_velocity ?? DEFAULT_RECRUITING_WEIGHTS.exit_velocity,
    pitch_velocity: philosophy?.weight_pitch_velocity ?? DEFAULT_RECRUITING_WEIGHTS.pitch_velocity,
    sixty_time: philosophy?.weight_sixty_time ?? DEFAULT_RECRUITING_WEIGHTS.sixty_time,
    gpa: philosophy?.weight_gpa ?? DEFAULT_RECRUITING_WEIGHTS.gpa,
    height: philosophy?.weight_height ?? DEFAULT_RECRUITING_WEIGHTS.height,
    weight: philosophy?.weight_weight ?? DEFAULT_RECRUITING_WEIGHTS.weight,
    arm_strength: philosophy?.weight_arm_strength ?? DEFAULT_RECRUITING_WEIGHTS.arm_strength,
  };

  const initialStandards: RecruitingMinimumStandards = {
    min_gpa: philosophy?.min_gpa ?? null,
    min_exit_velocity: philosophy?.min_exit_velocity ?? null,
    min_pitch_velocity: philosophy?.min_pitch_velocity ?? null,
    max_sixty_time: philosophy?.max_sixty_time ?? null,
  };

  const initialPositions = philosophy?.position_priorities ?? [];
  const initialStates = philosophy?.preferred_states ?? [];
  const initialGradYears = philosophy?.target_grad_years ?? [];

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[720px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-warm-900">Recruiting Preferences</h1>
          <p className="text-warm-500 mt-1">
            Configure how players are matched and ranked in your Discover feed
          </p>
        </div>

        <Suspense fallback={<LoadingSkeleton />}>
          <RecruitingPreferencesClient
            coachId={coach.id}
            initialWeights={initialWeights}
            initialStandards={initialStandards}
            initialPositions={initialPositions}
            initialStates={initialStates}
            initialGradYears={initialGradYears}
          />
        </Suspense>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white/70 rounded-2xl p-6 animate-pulse">
          <div className="h-6 w-48 bg-warm-200 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-warm-100 rounded" />
            <div className="h-4 w-3/4 bg-warm-100 rounded" />
            <div className="h-4 w-1/2 bg-warm-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
