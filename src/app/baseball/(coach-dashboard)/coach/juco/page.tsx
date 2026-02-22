'use client';

import { useAuth } from '@/hooks/use-auth';
import { JucoTeamDashboard } from '@/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard';

export default function JucoCoachDashboardPage() {
  const { coach } = useAuth();

  return (
    <JucoTeamDashboard
      coachName={coach?.full_name || 'Coach'}
      coachType={coach?.coach_type || 'juco'}
      organizationName={coach?.organization?.name || undefined}
    />
  );
}
