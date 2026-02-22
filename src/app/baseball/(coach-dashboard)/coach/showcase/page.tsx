'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { TeamSelector } from '@/components/baseball/showcase/TeamSelector';
import { OrgDashboard } from '@/components/baseball/showcase/OrgDashboard';
import { useAuth } from '@/hooks/use-auth';

export default function ShowcaseCoachDashboardPage() {
  const { coach, loading: authLoading } = useAuth();
  const [teamFilterId, setTeamFilterId] = useState('all');

  if (authLoading || !coach) {
    return <PageLoading />;
  }

  return (
    <>
      <Header
        title="Organization Dashboard"
        subtitle="Multi-team overview and roster management"
      />
      <div className="p-6 lg:p-8 space-y-6">
        <TeamSelector value={teamFilterId} onChange={setTeamFilterId} />
        <OrgDashboard teamFilterId={teamFilterId} />
      </div>
    </>
  );
}
