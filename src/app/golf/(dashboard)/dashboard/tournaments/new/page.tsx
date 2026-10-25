import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isTournamentsFor } from '@/clubhouse/gate';
import { ClubhouseTournamentsRoute } from '@/clubhouse/routes/tournaments';

export const metadata: Metadata = { title: 'New event' };

/**
 * /golf/dashboard/tournaments/new (P016 Tournaments). Clubhouse only, behind golf_tournaments_v1: with the flag or Clubhouse off it is not
 * found (there is no Fairway page for it). Rendered in place (D-23).
 */
export default async function TournamentNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!(await isTournamentsFor(await getGolfDashboardRole()))) notFound();
  return <ClubhouseTournamentsRoute view="new" search={await searchParams} />;
}
