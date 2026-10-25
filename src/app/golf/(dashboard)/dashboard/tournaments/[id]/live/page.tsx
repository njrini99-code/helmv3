import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isTournamentsFor } from '@/clubhouse/gate';
import { ClubhouseTournamentsRoute } from '@/clubhouse/routes/tournaments';

export const metadata: Metadata = { title: 'Live round' };

/**
 * /golf/dashboard/tournaments/[id]/live (P016 Tournaments). Clubhouse only, behind golf_tournaments_v1: with the flag or Clubhouse off it is not
 * found (there is no Fairway page for it). Rendered in place (D-23).
 */
export default async function TournamentLivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!(await isTournamentsFor(await getGolfDashboardRole()))) notFound();
  const { id } = await params;
  return <ClubhouseTournamentsRoute view="live" id={id} search={await searchParams} />;
}
