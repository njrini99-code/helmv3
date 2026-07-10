'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TeamSelector } from '@/components/baseball/showcase/TeamSelector';
import { OrgDashboard } from '@/components/baseball/showcase/OrgDashboard';
import { IconUsers, IconFlag, IconChevronRight } from '@/components/icons';
import { SectionMasthead, PaperCard } from '@/components/baseball/living-annual';

const ORGANIZATION_LANDING_CARDS = [
  {
    href: '/baseball/dashboard/teams',
    label: 'Teams',
    description: 'The full list of teams in your organization — rosters, staff, and program details.',
    icon: IconUsers,
  },
  {
    href: '/baseball/dashboard/events',
    label: 'Events',
    description: 'Every showcase and tournament on the calendar, across all of your teams.',
    icon: IconFlag,
  },
] as const;

export default function OrganizationDashboardPage() {
  const [teamFilterId, setTeamFilterId] = useState('all');

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <SectionMasthead eyebrow="THE PRESSBOX · ORGANIZATION" title="Organization Dashboard" ink="team">
        <p className="font-annual text-body-sm text-text-secondary">Multi-team overview and roster management</p>
      </SectionMasthead>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {ORGANIZATION_LANDING_CARDS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
            >
              <PaperCard className="flex h-full items-start gap-4 p-5 transition-shadow duration-200 group-hover:shadow-card-hover group-hover:-translate-y-0.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-600/10 text-primary-600">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-body-lg font-semibold text-warm-900">{label}</h3>
                  <p className="mt-1 text-body-sm text-warm-500">{description}</p>
                </div>
                <IconChevronRight
                  size={18}
                  className="mt-1 shrink-0 text-warm-500 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </PaperCard>
            </Link>
          ))}
        </div>
        <TeamSelector value={teamFilterId} onChange={setTeamFilterId} />
        <OrgDashboard teamFilterId={teamFilterId} />
      </div>
    </div>
  );
}
