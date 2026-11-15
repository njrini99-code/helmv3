import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseCalendarRoute } from '@/clubhouse/routes/calendar';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'View and manage your team events, practices, and class schedule',
};

// 30s cache: balances freshness vs cold-fetch timeouts (was 0 → 100% P75 30s)
export const revalidate = 30;

interface GolfCalendarPageProps {
  /** `?event=<id>` opens that event; `view`, `date`, `new`, `with`, `type` and `setup` are the Calendar's own deep links. */
  searchParams: Promise<{ event?: string; view?: string; date?: string; new?: string; with?: string; type?: string; setup?: string }>;
}

export default async function GolfCalendarPage({ searchParams }: GolfCalendarPageProps) {
  const { event: initialEventId, view, date, new: isNew, with: withPlayer, type: newType, setup } = await searchParams;
  // React.cache() dedupes getUser() + profile queries — free after layout runs them
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Calendar: coaches and players, each with the permissions they already have.
  return <ClubhouseCalendarRoute view={view} date={date} event={initialEventId} isNew={isNew === '1'} withPlayer={withPlayer} newType={newType} setUp={setup === '1'} />;
}
