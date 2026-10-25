import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseCourseHistoryRoute } from '@/clubhouse/routes/course-history';

export const metadata: Metadata = { title: 'Course history' };

/**
 * P-7: one player's history at one course. Clubhouse only: there is no legacy page, so with Clubhouse off it is not
 * found (the entry points are drawn only where Clubhouse is).
 */
export default async function CourseHistoryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ key }, search] = await Promise.all([params, searchParams]);
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!(await isClubhouseFor(await getGolfDashboardRole()))) notFound();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <ClubhouseCourseHistoryRoute rawKey={key} player={one(search.player)} hole={one(search.hole)} window={one(search.w) === 'season' ? 'season' : 'all'} />;
}
