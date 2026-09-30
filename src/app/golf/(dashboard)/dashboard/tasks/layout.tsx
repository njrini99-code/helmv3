import { Metadata } from 'next';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Assign and track player tasks, monitor completion status, and manage team assignments.',
};

// Clubhouse: Tasks is a coach's Team Hub tab; a player's tasks are on Team Hub's Home.
export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectToClubhouse({ coach: '/golf/dashboard/team-hub?tab=tasks', player: '/golf/dashboard/team-hub' });
  return children;
}
