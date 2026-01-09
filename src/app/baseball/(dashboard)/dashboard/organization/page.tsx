'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { TeamSelector } from '@/components/baseball/showcase/TeamSelector';
import { OrgDashboard } from '@/components/baseball/showcase/OrgDashboard';
import { useRouteProtection } from '@/hooks/use-route-protection';

export default function OrganizationDashboardPage() {
  const { isAllowed, isLoading } = useRouteProtection({
    allowedCoachTypes: ['showcase'],
    redirectTo: '/baseball/dashboard',
  });
  const [teamFilterId, setTeamFilterId] = useState('all');

  if (isLoading || !isAllowed) {
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
