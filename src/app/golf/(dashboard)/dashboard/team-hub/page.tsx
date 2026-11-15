import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseHubRoute } from '@/clubhouse/routes/hub';

export const metadata: Metadata = {
  title: 'Team Hub',
  description: 'Your team at a glance: tasks, announcements, travel, classes, and teammates.',
};

export default async function TeamHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; task?: string; trip?: string }>;
}) {
  // Clubhouse Team Hub: one page for coaches and players, with its own tabs, so `?tab=` opens a tab there.
  const { tab, task, trip } = (await searchParams) ?? {};
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  return <ClubhouseHubRoute tab={tab} task={typeof task === 'string' ? task : undefined} trip={typeof trip === 'string' ? trip : undefined} />;
}
