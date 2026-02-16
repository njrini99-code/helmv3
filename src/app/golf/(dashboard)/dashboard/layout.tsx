import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | GolfHelm',
  description: 'Your golf team dashboard — performance tracking, team management, and coaching tools.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
