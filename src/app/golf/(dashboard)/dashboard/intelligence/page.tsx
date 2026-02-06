import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageLoading } from '@/components/ui/loading';
import { IntelligenceCommandCenter } from '@/components/golf/coachhelm/v2';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Intelligence Dashboard | CoachHelm',
  description: 'AI-powered insights, patterns, predictions, and coaching intelligence for your team',
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function IntelligenceDashboardPage() {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Get coach record
  const { data: coachData } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const coach = coachData as { id: string; organization_id: string | null } | null;

  if (!coach) {
    // Check if player
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (player) {
      redirect('/golf/dashboard/coachhelm');
    }

    redirect('/golf/login');
  }

  // Look up team_id via organization_id
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = team?.id ?? null;
  }

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  return (
    <div className="flex flex-col min-h-full">
      <Suspense fallback={<PageLoading />}>
        <AnimatedPage>
          <AnimatedItem>
            <IntelligenceCommandCenter
              teamId={teamId}
              coachId={coach.id}
              variant="page"
            />
          </AnimatedItem>
        </AnimatedPage>
      </Suspense>
    </div>
  );
}
