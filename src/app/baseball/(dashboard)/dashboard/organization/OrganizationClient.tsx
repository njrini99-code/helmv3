'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { TeamSelector } from '@/components/baseball/showcase/TeamSelector';
import { OrgDashboard } from '@/components/baseball/showcase/OrgDashboard';

export default function OrganizationDashboardPage() {
  const [teamFilterId, setTeamFilterId] = useState('all');

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
