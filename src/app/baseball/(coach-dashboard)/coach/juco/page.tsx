'use client';

import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { JucoTeamDashboard } from '@/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard';

export default function JucoCoachDashboardPage() {
  const { coach, loading: authLoading } = useAuth();

  if (authLoading || !coach) return <PageLoading />;

  return (
    <JucoTeamDashboard
      coachName={coach.full_name || 'Coach'}
      coachType={coach.coach_type || 'juco'}
      organizationName={coach.organization?.name || undefined}
    />
  );
}
