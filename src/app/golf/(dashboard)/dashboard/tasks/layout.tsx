import { Metadata } from 'next';
import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Assign and track player tasks, monitor completion status, and manage team assignments.',
};

const HUB = '/golf/dashboard/team-hub';

// Clubhouse: Tasks is a Team Hub tab for both roles (a player's tasks are also on its Home). A notification's
// `?task=<id>` comes along, so Team Hub scrolls to that task.
export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const toTasks = (q: Parameters<typeof aliasId>[0]) => {
    const task = aliasId(q, 'task');
    return `${HUB}?${new URLSearchParams(task ? { tab: 'tasks', task } : { tab: 'tasks' })}`;
  };
  await redirectToClubhouse({ coach: toTasks, player: toTasks });
  return children;
}
