import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { PageLoading } from '@/components/ui/loading';
import { IntelligenceCommandCenter } from '@/components/golf/coachhelm/v2';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';

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
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) redirect('/golf/dashboard/coachhelm');
    redirect('/golf/login');
  }

  const supabase = await createClient();

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
      <div className="px-4 md:px-6 pt-4 pb-2 lg:hidden">
        <MobileMenuButton />
      </div>
      <Suspense fallback={<PageLoading />}>
        <IntelligenceCommandCenter
          teamId={teamId}
          coachId={coach.id}
          variant="page"
        />
      </Suspense>
    </div>
  );
}
