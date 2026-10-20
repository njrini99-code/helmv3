import type { ReactNode } from 'react';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: Documents is a Team Hub tab.
export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/team-hub?tab=docs', player: '/golf/dashboard/team-hub?tab=docs' });
  return children;
}
