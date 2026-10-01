import type { ReactNode } from 'react';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: Announcements is a Team Hub tab.
export default async function AnnouncementsLayout({ children }: { children: ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/team-hub?tab=ann', player: '/golf/dashboard/team-hub?tab=ann' });
  return children;
}
