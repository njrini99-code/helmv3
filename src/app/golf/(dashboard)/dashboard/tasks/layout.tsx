import { Metadata } from 'next';
import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Assign and track player tasks, monitor completion status, and manage team assignments.',
};

const HUB = '/golf/dashboard/team-hub';

// Clubhouse: Tasks is a coach's Team Hub tab; a player's tasks are on Team Hub's Home. A notification's `?task=<id>`
// comes along, so Team Hub scrolls to that task.
export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectToClubhouse({
    coach: (q) => {
      const task = aliasId(q, 'task');
      return `${HUB}?${new URLSearchParams(task ? { tab: 'tasks', task } : { tab: 'tasks' })}`;
    },
    player: (q) => {
      const task = aliasId(q, 'task');
      return task ? `${HUB}?${new URLSearchParams({ task })}` : HUB;
    },
  });
  return children;
}
