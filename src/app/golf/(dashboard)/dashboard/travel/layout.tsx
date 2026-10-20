import type { ReactNode } from 'react';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: Travel is a Team Hub tab.
export default async function TravelLayout({ children }: { children: ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/team-hub?tab=travel', player: '/golf/dashboard/team-hub?tab=travel' });
  return children;
}
