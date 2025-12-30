import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tasks | Helm Golf',
  description: 'Assign and track player tasks, monitor completion status, and manage team assignments.',
};

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
